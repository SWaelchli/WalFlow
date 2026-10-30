import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { persistKey } from '../utils/graphSignature';
import { parseServerTime } from '../utils/serverTime';
import { notify, confirmDialog } from '../utils/dialogs';
import axios from 'axios';
import { serializeDiagram, checkFormatVersion } from '../utils/diagramFile';
import { useAuth } from './useAuth';
import { writeDraft, readDraft, removeDraft, startHeartbeat, pruneDrafts, findOrphanDraft, adoptDraft, discardOrphan, getTabId, isMyTabLock } from '../utils/draftStorage';

// One id per browser tab, sent with cloud saves so the server's "diagram updated" notice skips the saving tab
const CLIENT_ID = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `tab-${Math.random().toString(36).slice(2)}`;

// Content that decides whether a save is needed: everything except the timestamp, viewport, the
// project/drawing the file was attached to and the server version the payload was based on
const contentKey = (payload) => {
  const { timestamp: _t, viewport: _v, base_updated_at: _b, ...rest } = payload;
  const content = {};
  Object.keys(rest).forEach((k) => { if (!k.startsWith('active_')) content[k] = rest[k]; });
  return JSON.stringify(content);
};

// The content key a saved diagram has once it is on the canvas (same serializer as a save)
const loadedContentKey = (data) => {
  const { created_at: _createdAt, ...base } = serializeDiagram({
    nodes: data.nodes || [],
    edges: data.edges || [],
    globalSettings: data.globalSettings || {},
    cases: data.cases || [],
    activeCaseId: data.active_case_id,
  });
  return contentKey(base);
};

// The server ties each edit lock to a browser tab: it needs the tab id on checkout, check-in and saves
const sessionHeaders = () => ({ 'X-Walflow-Session': getTabId() });

// Why the server refused to keep a lock: 'moved' (the lock went to another drawing of this user), 'other_user', 'other_tab'
const lockRefusalReason = (err) => (err && err.response && err.response.headers && err.response.headers['x-lock-reason']) || null;

// A lock refusal (another user, another tab, not the holder) is an expected answer, not an error
const isLockRefusal = (err) => !!(err && err.response && (err.response.status === 409 || err.response.status === 403));

// Check-in that never throws: the lock may already be gone
const sendCheckin = (diagramId) => Promise.resolve()
  .then(() => axios.post(`/api/diagrams/${diagramId}/checkin`, null, { headers: sessionHeaders() }))
  .then(() => true, () => false);

// A lock held by this tab is released after this long without activity in the tab
export const IDLE_RELEASE_MS = 30 * 60 * 1000;
const IDLE_CHECK_MS = 30 * 1000;
// The server lease is 180 s; it is extended while this tab holds the lock
const HEARTBEAT_MS = 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

const isStaleConflict = (err) => !!(err.response && err.response.status === 409 &&
  err.response.headers && err.response.headers['x-walflow-conflict'] === 'stale');

// Orphan-draft dialogs that are still open, by draft key
const pendingOrphanOffers = new Map();

const STALE_MESSAGE ='Not saved: this diagram was changed elsewhere since you opened it. Reload to see the latest version; your edits here stay in the local draft.';

export function useAutoSaveSession({
  nodes,
  edges,
  globalSettings,
  cases,
  activeCaseId,
  reactFlowInstance,
  isAuthenticated,
  activeProject,
  activeDiagram,
  setActiveDiagram
}) {
  const { currentUser, loading: authLoading } = useAuth();
  const [saveStatus, setSaveStatus] = useState('saved_local'); // 'saved_cloud' | 'saving_cloud' | 'saved_local' | 'saving_local' | 'error' | 'locked'
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState(null);
  const [isRestoredFromDraft, setIsRestoredFromDraft] = useState(false);
  const [restoredDraftTime, setRestoredDraftTime] = useState(null);
  // Non-blocking notice about co-editors / saves refused because the diagram changed elsewhere
  const [collabNotice, setCollabNotice] = useState(null);
  const dismissCollabNotice = useCallback(() => setCollabNotice(null), []);
  // updated_at of the server version this tab last loaded or saved; sent with each save so a newer copy is not overwritten
  const baseUpdatedAtRef = useRef(null);
  // content of the last version known to be on the server, to skip saves that would change nothing
  const lastSavedKeyRef = useRef(null);

  // Latest sign-in state for async boot code, and callers waiting until the sign-in check is done
  const authRef = useRef({ isAuthenticated, loading: authLoading });
  const authWaitersRef = useRef([]);
  useEffect(() => {
    authRef.current = { isAuthenticated, loading: authLoading };
    if (!authLoading) {
      authWaitersRef.current.forEach((resolve) => resolve());
      authWaitersRef.current = [];
    }
  }, [isAuthenticated, authLoading]);

  // Collaboration Lock States
  const [lockInfo, setLockInfo] = useState(null); // { user_id, username, expires_at }
  // The lock is this tab's only when it is this user's and not tied to another tab
  const tabId = getTabId();
  const isMyUser = !!(lockInfo && currentUser && lockInfo.user_id === currentUser.id);
  const hasLock = isMyUser && isMyTabLock(lockInfo, currentUser.id);
  const isLockedByOtherTab = isMyUser && !hasLock;
  const isLockedByOther = !!(lockInfo && !hasLock);
  const currentUserIdRef = useRef(currentUser ? currentUser.id : null);
  useEffect(() => { currentUserIdRef.current = currentUser ? currentUser.id : null; }, [currentUser]);
  // Drawing whose lock this tab holds, as far as this tab knows
  const heldLockIdRef = useRef(null);
  const applyLock = useCallback((diagramId, lock) => {
    heldLockIdRef.current = isMyTabLock(lock, currentUserIdRef.current) ? diagramId : null;
    setLockInfo(lock || null);
  }, []);

  // Ref to track latest state for beforeunload and debounced saves
  const stateRef = useRef({
    nodes,
    edges,
    globalSettings,
    cases,
    activeCaseId,
    activeProject,
    activeDiagram,
    reactFlowInstance
  });

  useEffect(() => {
    stateRef.current = {
      nodes,
      edges,
      globalSettings,
      cases,
      activeCaseId,
      activeProject,
      activeDiagram,
      reactFlowInstance
    };
  }, [nodes, edges, globalSettings, cases, activeCaseId, activeProject, activeDiagram, reactFlowInstance]);

  // The drawing open in this tab, for async code that must not act on a drawing that was left
  const activeDiagramRef = useRef(activeDiagram);
  useEffect(() => { activeDiagramRef.current = activeDiagram; }, [activeDiagram]);
  // Set while the hook unmounts, so the cleanup of the last drawing does not mistake it for a reopened drawing
  const unmountingRef = useRef(false);
  useEffect(() => {
    unmountingRef.current = false;
    return () => { unmountingRef.current = true; };
  }, []);

  // Serializer function
  const serializeWorkspaceState = useCallback(() => {
    const { nodes, edges, globalSettings, cases, activeCaseId, activeProject, activeDiagram, reactFlowInstance } = stateRef.current;
    const viewport = reactFlowInstance ? reactFlowInstance.getViewport() : { x: 0, y: 0, zoom: 1 };
    
    // Results are not part of a draft or cloud save; the diagram is re-solved after loading
    const { created_at: _createdAt, ...base } = serializeDiagram({ nodes, edges, globalSettings: globalSettings || {}, cases, activeCaseId });
    return {
      ...base,
      timestamp: new Date().toISOString(),
      base_updated_at: baseUpdatedAtRef.current || null,
      active_project_id: activeProject?.id || null,
      active_project_title: activeProject?.title || null,
      active_diagram_id: activeDiagram?.id || null,
      active_diagram_title: activeDiagram?.title || null,
      active_diagram_description: activeDiagram?.description || null,
      viewport,
    };
  }, []);

  // Learn the server version when a diagram is opened; remember what was on screen at that moment
  useEffect(() => {
    if (activeDiagram && activeDiagram.updated_at) baseUpdatedAtRef.current = activeDiagram.updated_at;
    if (!activeDiagram) baseUpdatedAtRef.current = null;
  }, [activeDiagram]);
  // The saved time shown is the opened (or newly created) drawing's own, not the one that was left
  const [savedTimeId, setSavedTimeId] = useState(null);
  const openId = activeDiagram ? activeDiagram.id : null;
  if (openId !== savedTimeId) {
    setSavedTimeId(openId);
    if (!openId) {
      // Detached: the previous drawing's time no longer applies (a local draft label shows no time)
      setLastSavedTimestamp(null);
    } else if (activeDiagram.updated_at) {
      // Without updated_at (restored draft) the time set by reconcileDraft or the save path is kept
      const savedAt = parseServerTime(activeDiagram.updated_at);
      setLastSavedTimestamp(savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt.toLocaleTimeString() : null);
    }
  }
  // What a save would write. Selection, measuring and results do not change it, so they no longer start the
  // save timers; a moved component does.
  const contentSignature = useMemo(
    () => persistKey({ nodes, edges, globalSettings, cases, activeCaseId }),
    [nodes, edges, globalSettings, cases, activeCaseId]
  );

  const activeDiagramId = activeDiagram ? activeDiagram.id : null;
  // Content key of a cloud drawing that is being loaded onto the canvas. When the canvas content equals it,
  // that content is the saved version and is not uploaded; anything else is a real change and is saved.
  const expectedLoadKeyRef = useRef(null);
  const markLoaded = useCallback((data) => {
    try {
      expectedLoadKeyRef.current = loadedContentKey(data);
    } catch {
      expectedLoadKeyRef.current = null;
    }
  }, []);
  // Drawing whose content was just set from a local draft by reconcileDraft
  const draftLoadedIdRef = useRef(null);
  // Change of the active drawing that is waiting for its cloud save: { diagram, payload }. Flushed when the
  // drawing is switched or the hook unmounts.
  const pendingFlushRef = useRef(null);
  // The latest cloud save request (settles, never rejects): { id, result: Promise<{ ok, updatedAt }> }, id = its drawing
  const lastPutRef = useRef(null);
  // Settles when the save and check-in of the drawing that was left are done (never rejects)
  const leavingSaveRef = useRef(Promise.resolve());
  // After a drawing is opened, the first content change is the drawing arriving on the canvas (loading can
  // normalise it), not an edit. Only valid for a short time.
  const landingUntilRef = useRef(0);
  const prevDiagramIdRef = useRef(null);
  useEffect(() => {
    const prevId = prevDiagramIdRef.current;
    prevDiagramIdRef.current = activeDiagramId;
    landingUntilRef.current = 0;
    if (!activeDiagramId) {
      lastSavedKeyRef.current = null;
      return;
    }
    if (draftLoadedIdRef.current === activeDiagramId) {
      // The draft holds work the server does not have: it must be saved
      draftLoadedIdRef.current = null;
      expectedLoadKeyRef.current = null;
      lastSavedKeyRef.current = null;
      return;
    }
    // Only a drawing load (markLoaded was called) lands on the canvas; Save As changes the id without loading
    if (prevId !== activeDiagramId && expectedLoadKeyRef.current !== null) landingUntilRef.current = Date.now() + 2000;
    // What is on the canvas now is not uploaded to the newly active drawing; a load that is still on its way
    // is recognised by expectedLoadKeyRef when it lands
    lastSavedKeyRef.current = contentKey(serializeWorkspaceState());
  }, [activeDiagramId, serializeWorkspaceState]);

  // Switching drawings (or closing the app) must not drop an edit that is still waiting for its save: it is
  // sent to the drawing it was made in, with the content it had then
  useEffect(() => () => {
    const pending = pendingFlushRef.current;
    pendingFlushRef.current = null;
    // The lock of the drawing that was left is given back once its last save has settled
    const leftId = heldLockIdRef.current;
    heldLockIdRef.current = null;
    const unmounting = unmountingRef.current;
    // A save of this drawing that is already on its way (autosave, manual save) must land before the flush
    // and the check-in
    const lastPut = lastPutRef.current;
    // After a quick switch back to the drawing its lock is wanted again: no late check-in
    const checkinLeft = () => {
      if (!leftId) return;
      const open = activeDiagramRef.current;
      if (!unmounting && open && open.id === leftId) return;
      sendCheckin(leftId);
    };
    leavingSaveRef.current = (async () => {
      const put = lastPut ? await lastPut.result : null;
      if (pending) {
        const { diagram, payload } = pending;
        // The flush builds on the version the save in flight produced, if that save was of the same drawing
        const putUpdatedAt = put && lastPut.id === diagram.id ? put.updatedAt : null;
        const base = putUpdatedAt || payload.base_updated_at || undefined;
        try {
          await axios.put(`/api/diagrams/${diagram.id}`, {
            title: diagram.title,
            description: diagram.description || '',
            diagram_data: JSON.stringify(payload),
            base_updated_at: base
          }, { headers: { 'X-Walflow-Client-Id': CLIENT_ID, ...sessionHeaders() } });
        } catch (err) {
          // A refused save (changed elsewhere, lock lost) is reported; the edit may be gone with the next drawing
          if (!(err.response && err.response.status === 409)) console.warn('Could not save the previous drawing:', err);
          notify(`Your last changes to "${diagram.title}" could not be saved to the cloud.`, 'warning');
        }
      }
      checkinLeft();
    })();
  }, [activeDiagramId]);

  // Cloud save with the version check; remembers the new server version and content on success
  const putDiagram = useCallback(async (diagram, payload) => {
    // This save is newer than any change waiting to be flushed for the same drawing
    if (pendingFlushRef.current && pendingFlushRef.current.diagram.id === diagram.id) pendingFlushRef.current = null;
    const request = axios.put(`/api/diagrams/${diagram.id}`, {
      title: diagram.title,
      description: diagram.description || '',
      diagram_data: JSON.stringify(payload),
      base_updated_at: baseUpdatedAtRef.current || undefined
    }, { headers: { 'X-Walflow-Client-Id': CLIENT_ID, ...sessionHeaders() } });
    lastPutRef.current = {
      id: diagram.id,
      result: Promise.resolve(request).then(
        (r) => ({ ok: true, updatedAt: (r.data && r.data.updated_at) || null }),
        () => ({ ok: false, updatedAt: null })
      )
    };
    const response = await request;
    // Not for a drawing that was left while the save was out: the open drawing has its own version
    const open = activeDiagramRef.current;
    if (response.data && response.data.updated_at && open && open.id === diagram.id) baseUpdatedAtRef.current = response.data.updated_at;
    lastSavedKeyRef.current = contentKey(payload);
    expectedLoadKeyRef.current = null;
    return response;
  }, []);

  // Helper to save to local browser storage
  const saveToLocalDraft = useCallback(() => {
    try {
      const payload = serializeWorkspaceState();
      writeDraft(JSON.stringify(payload));
      return payload.timestamp;
    } catch (e) {
      console.warn('Failed to save session draft to localStorage:', e);
      return null;
    }
  }, [serializeWorkspaceState]);

  // Helper to purge local draft
  const clearLocalDraft = useCallback(() => {
    removeDraft();
  }, []);

  // This tab's draft stays out of other tabs' reach while the tab is open
  useEffect(() => {
    pruneDrafts();
    return startHeartbeat();
  }, []);

  // Lock status as the server reports it; throws when the request fails
  const requestLockStatus = useCallback(async (diagramId) => {
    const response = await axios.get(`/api/diagrams/${diagramId}/lock-status`);
    return response.data;
  }, []);

  // Fetch lock status for diagram
  const fetchLockStatus = useCallback(async (diagramId) => {
    if (!diagramId || !isAuthenticated) return null;
    try {
      const data = await requestLockStatus(diagramId);
      if (data.is_locked) {
        applyLock(diagramId, data.lock);
        return data.lock;
      } else {
        applyLock(diagramId, null);
        return null;
      }
    } catch (err) {
      console.error('Failed to fetch diagram lock status:', err);
      return null;
    }
  }, [isAuthenticated, requestLockStatus, applyLock]);

  // Acquire the lock of a diagram. silent: no toasts. isCurrent: false when the drawing changed while the
  // request was out; the lock is then handed back instead of shown. resume: keep the lock this tab already has
  // (or take a free drawing) without releasing the user's other locks; a refusal is passed to onRefused(err).
  const checkoutDiagramById = useCallback(async (diagramId, { silent = false, isCurrent = () => true, onRefused = null, resume = false } = {}) => {
    if (!diagramId || !isAuthenticated) return false;
    try {
      const url = `/api/diagrams/${diagramId}/checkout${resume ? '?resume=true' : ''}`;
      const response = await axios.post(url, null, { headers: sessionHeaders() });
      if (!isCurrent()) {
        sendCheckin(diagramId);
        return false;
      }
      if (response.data && response.data.status === 'success') {
        applyLock(diagramId, response.data.lock);
        return true;
      }
      return false;
    } catch (err) {
      if (silent) {
        if (isLockRefusal(err)) {
          // Someone else holds it: show the read-only state
          if (isCurrent()) {
            if (onRefused) onRefused(err); else fetchLockStatus(diagramId);
          }
        } else {
          console.warn('Could not check out the diagram automatically:', err);
        }
        return false;
      }
      if (!isLockRefusal(err)) console.error('Failed to checkout diagram:', err);
      if (err.response && err.response.data && err.response.data.detail) {
        notify(err.response.data.detail, 'warning');
      } else {
        notify('Could not check out diagram. It may be locked by another user.', 'error');
      }
      // Refresh status
      fetchLockStatus(diagramId);
      return false;
    }
  }, [isAuthenticated, fetchLockStatus, applyLock]);

  // Checkout diagram (Acquire Lock)
  const checkoutDiagram = useCallback(
    (options) => checkoutDiagramById(activeDiagram ? activeDiagram.id : null, { silent: !!(options && options.silent === true) }),
    [activeDiagram, checkoutDiagramById]
  );

  // Checkin diagram (Release Lock)
  const checkinDiagram = useCallback(async () => {
    if (!activeDiagram || !activeDiagram.id || !isAuthenticated) return false;
    try {
      await axios.post(`/api/diagrams/${activeDiagram.id}/checkin`, null, { headers: sessionHeaders() });
      applyLock(activeDiagram.id, null);
      return true;
    } catch (err) {
      if (!isLockRefusal(err)) console.error('Failed to checkin diagram:', err);
      return false;
    }
  }, [activeDiagram, isAuthenticated, applyLock]);

  // Force checkin (Owner Override Lock Release)
  const forceCheckinDiagram = useCallback(async () => {
    if (!activeDiagram || !activeDiagram.id || !isAuthenticated) return false;
    const ok = await confirmDialog({
      title: 'Force release edit lock?',
      message: "Force release another user's edit lock? Any unsaved work they have will not sync to the cloud.",
      confirmLabel: 'Release lock',
      danger: true,
    });
    if (!ok) return false;
    try {
      await axios.post(`/api/diagrams/${activeDiagram.id}/force-checkin`);
      applyLock(activeDiagram.id, null);
      return true;
    } catch (err) {
      console.error('Failed to force release lock:', err);
      notify('Failed to release lock. You must be an owner of this project.', 'error');
      return false;
    }
  }, [activeDiagram, isAuthenticated, applyLock]);

  // Tell the user the lock went to their other tab; Check out only acts while that drawing is still open here
  const notifyMoved = useCallback((diagramId) => {
    notify('Checked in because you opened another drawing in another tab. Check out to edit here.', 'warning', {
      key: `lock-moved:${diagramId}`,
      action: {
        label: 'Check out',
        onClick: () => {
          const open = activeDiagramRef.current;
          if (open && open.id === diagramId) checkoutDiagramById(diagramId);
        },
      },
    });
  }, [checkoutDiagramById]);

  // The lock this tab thought it held is somewhere else (or gone): read-only, with the moved notice for own tabs
  const handleLockLost = useCallback((diagramId, lock) => {
    const wasHeldHere = heldLockIdRef.current === diagramId;
    applyLock(diagramId, lock);
    if (wasHeldHere && lock && currentUserIdRef.current && lock.user_id === currentUserIdRef.current) notifyMoved(diagramId);
  }, [applyLock, notifyMoved]);

  // Re-read the lock after a refused re-checkout
  const refreshLostLock = useCallback(async (diagramId) => {
    try {
      const data = await requestLockStatus(diagramId);
      const open = activeDiagramRef.current;
      if (open && open.id === diagramId) handleLockLost(diagramId, data.is_locked ? data.lock : null);
    } catch (err) {
      console.warn('Could not read the lock status:', err);
    }
  }, [requestLockStatus, handleLockLost]);

  // A refused keep-my-lock call (heartbeat, reconnect, retry after a refused save): the lock went to another
  // drawing of this user, or to someone else
  const handleResumeRefused = useCallback((diagramId, err) => {
    if (lockRefusalReason(err) === 'moved') {
      const open = activeDiagramRef.current;
      if (!open || open.id !== diagramId) return;
      const wasHeldHere = heldLockIdRef.current === diagramId;
      applyLock(diagramId, null);
      if (wasHeldHere) notifyMoved(diagramId);
    } else {
      refreshLostLock(diagramId);
    }
  }, [applyLock, notifyMoved, refreshLostLock]);

  // A save was refused because the lock is not this tab's: ask the server who holds it. A free drawing is taken
  // back and the save is tried once more (the edits stay); otherwise the real lock is shown.
  // Resolves 'saved' | 'locked' | 'failed' | 'left' (the drawing is no longer open); a refused retry throws.
  const recoverRefusedSave = useCallback(async (diagram) => {
    const diagramId = diagram.id;
    const isCurrent = () => !!activeDiagramRef.current && activeDiagramRef.current.id === diagramId;
    let lock;
    try {
      const data = await requestLockStatus(diagramId);
      lock = data.is_locked ? data.lock : null;
    } catch (err) {
      console.warn('Could not read the lock status after a refused save:', err);
      return 'failed';
    }
    if (!isCurrent()) return 'left';
    if (lock && !isMyTabLock(lock, currentUserIdRef.current)) {
      handleLockLost(diagramId, lock);
      return 'locked';
    }
    if (lock) {
      applyLock(diagramId, lock);
    } else {
      const ok = await checkoutDiagramById(diagramId, { silent: true, resume: true, isCurrent, onRefused: (err) => handleResumeRefused(diagramId, err) });
      if (!ok) return isCurrent() ? 'locked' : 'left';
    }
    await putDiagram(diagram, serializeWorkspaceState());
    return 'saved';
  }, [requestLockStatus, handleLockLost, applyLock, checkoutDiagramById, handleResumeRefused, putDiagram, serializeWorkspaceState]);

  // WebSocket Collaboration Event Listener
  useEffect(() => {
    const handleCollabEvent = (e) => {
      const eventData = e.detail;
      if (!activeDiagram || eventData.diagram_id !== activeDiagram.id) return;

      if (eventData.action === 'lock_acquired') {
        applyLock(activeDiagram.id, eventData.lock);
      } else if (eventData.action === 'lock_released') {
        const wasHeldHere = heldLockIdRef.current === activeDiagram.id;
        applyLock(activeDiagram.id, null);
        if (eventData.reason === 'moved' && currentUser && eventData.user_id === currentUser.id && wasHeldHere) {
          notifyMoved(activeDiagram.id);
        } else if (eventData.forced && eventData.by_username) {
          setCollabNotice({ kind: 'lock_released', message: `Your edit lock was released by project owner ${eventData.by_username}.` });
        }
      } else if (eventData.action === 'diagram_updated') {
        // Diagram was modified on the server, by someone else or by another tab of this user
        if (eventData.client_id !== CLIENT_ID) {
          const who = currentUser && eventData.user_id === currentUser.id ? 'Another tab of yours' : `Co-editor ${eventData.username}`;
          setCollabNotice({ kind: 'diagram_updated', message: `${who} saved changes to this diagram. Reload to see them; your unsaved edits here are kept as a local draft.` });
        }
      }
    };

    window.addEventListener('walflow_collab_event', handleCollabEvent);
    return () => {
      window.removeEventListener('walflow_collab_event', handleCollabEvent);
    };
  }, [activeDiagram, currentUser, applyLock, notifyMoved]);

  // Lock status fetch when diagram changes; a free drawing is checked out right away
  const autoCheckoutIdRef = useRef(null);
  const currentUserId = currentUser ? currentUser.id : null;   // the user, not the object: a new object does not refetch
  useEffect(() => {
    let active = true;
    if (activeDiagram && activeDiagram.id) {
      const diagramId = activeDiagram.id;
      requestLockStatus(diagramId)
        .then(async (data) => {
          if (!active) return;
          if (data.is_locked) {
            applyLock(diagramId, data.lock);
            return;
          }
          applyLock(diagramId, null);
          if (!isAuthenticated || !currentUserId || autoCheckoutIdRef.current === diagramId) return;
          // The drawing that was left must have saved before this checkout releases its lock
          await leavingSaveRef.current;
          if (!active || autoCheckoutIdRef.current === diagramId) return;
          autoCheckoutIdRef.current = diagramId;
          await checkoutDiagramById(diagramId, { silent: true, isCurrent: () => active });
        })
        .catch(err => {
          console.error('Failed to fetch diagram lock status:', err);
        });
    } else {
      autoCheckoutIdRef.current = null;
      Promise.resolve().then(() => {
        if (active) applyLock(null, null);
      });
    }
    return () => { active = false; };
  }, [activeDiagram, isAuthenticated, currentUserId, requestLockStatus, checkoutDiagramById, applyLock]);

  // Heartbeat lease extension (every minute while this tab holds the lock)
  useEffect(() => {
    if (!hasLock || !activeDiagram || !activeDiagram.id || !isAuthenticated) return;

    const diagramId = activeDiagram.id;
    const intervalId = setInterval(() => {
      // A refused heartbeat means the lock is no longer ours: read-only, no retry
      checkoutDiagramById(diagramId, {
        silent: true,
        resume: true,
        isCurrent: () => !!activeDiagramRef.current && activeDiagramRef.current.id === diagramId,
        onRefused: (err) => handleResumeRefused(diagramId, err),
      });
    }, HEARTBEAT_MS);

    return () => clearInterval(intervalId);
  }, [hasLock, activeDiagram, isAuthenticated, checkoutDiagramById, handleResumeRefused]);

  // Idle release: a lock held 30 minutes without activity in this tab is given back; the next activity takes it again
  const lastActivityRef = useRef(0);
  const idleReleasedIdRef = useRef(null);
  useEffect(() => {
    const onActivity = () => {
      lastActivityRef.current = Date.now();
      const releasedId = idleReleasedIdRef.current;
      if (!releasedId) return;
      idleReleasedIdRef.current = null;
      const open = activeDiagramRef.current;
      if (!open || open.id !== releasedId) return;
      checkoutDiagramById(releasedId, { silent: true, isCurrent: () => !!activeDiagramRef.current && activeDiagramRef.current.id === releasedId })
        .then((ok) => { if (ok) setCollabNotice((n) => (n && n.kind === 'idle' ? null : n)); });
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity));
  }, [checkoutDiagramById]);
  useEffect(() => {
    if (!hasLock || !activeDiagramId || !isAuthenticated) return;
    const diagramId = activeDiagramId;
    let releasing = false;
    // Taking the lock counts as activity
    if (Date.now() - lastActivityRef.current >= IDLE_RELEASE_MS) lastActivityRef.current = Date.now();
    const intervalId = setInterval(async () => {
      if (releasing || Date.now() - lastActivityRef.current < IDLE_RELEASE_MS) return;
      releasing = true;
      const pending = pendingFlushRef.current;
      if (pending && pending.diagram.id === diagramId) {
        try {
          await putDiagram(pending.diagram, pending.payload);
        } catch { /* a refused save stays in the local draft */ }
      }
      if (activeDiagramRef.current && activeDiagramRef.current.id === diagramId) {
        await sendCheckin(diagramId);
        idleReleasedIdRef.current = diagramId;
        applyLock(diagramId, null);
        setCollabNotice({ kind: 'idle', message: 'Checked in after 30 minutes without activity.' });
      }
    }, IDLE_CHECK_MS);
    return () => clearInterval(intervalId);
  }, [hasLock, activeDiagramId, isAuthenticated, putDiagram, applyLock]);

  // After the socket reconnects the server may have released the lock: take it again if this tab held it
  const reacquireAfterReconnect = useCallback(async () => {
    const open = activeDiagramRef.current;
    if (!open || !open.id || heldLockIdRef.current !== open.id) return;
    const diagramId = open.id;
    const isCurrent = () => !!activeDiagramRef.current && activeDiagramRef.current.id === diagramId;
    // The lock may have moved to another tab while the socket was down: look before taking it
    let lock;
    try {
      const data = await requestLockStatus(diagramId);
      lock = data.is_locked ? data.lock : null;
    } catch (err) {
      console.warn('Could not read the lock status after reconnecting:', err);
      return;
    }
    if (!isCurrent()) return;
    if (lock && !isMyTabLock(lock, currentUserIdRef.current)) {
      handleLockLost(diagramId, lock);
      return;
    }
    checkoutDiagramById(diagramId, { silent: true, resume: true, isCurrent, onRefused: (err) => handleResumeRefused(diagramId, err) });
  }, [requestLockStatus, checkoutDiagramById, handleLockLost, handleResumeRefused]);

  // Synchronous saving on page unload / tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveToLocalDraft();
    };
    // Give the edit lock back when the tab closes (the server also releases it when the socket drops)
    const handlePageHide = () => {
      if (hasLock && activeDiagram && activeDiagram.id && navigator.sendBeacon) {
        navigator.sendBeacon(`/api/diagrams/${activeDiagram.id}/checkin?session=${encodeURIComponent(tabId)}`);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [saveToLocalDraft, hasLock, activeDiagram, tabId]);

  // Skip initial mount effect trigger
  const isInitialMount = useRef(true);
  const prevSignatureRef = useRef(contentSignature);

  // Debounced Local Draft & Cloud Auto-Save Engine
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const isCloudSyncable = activeDiagram && activeDiagram.id && isAuthenticated && hasLock;

    // The canvas content of a just opened drawing arrived: that is the saved version
    const signatureChanged = prevSignatureRef.current !== contentSignature;
    prevSignatureRef.current = contentSignature;
    let loadMatched = false;
    const liveKey = contentKey(serializeWorkspaceState());
    if (activeDiagram && activeDiagram.id && expectedLoadKeyRef.current !== null && liveKey === expectedLoadKeyRef.current) {
      lastSavedKeyRef.current = expectedLoadKeyRef.current;
      expectedLoadKeyRef.current = null;
      loadMatched = true;
    } else if (activeDiagram && activeDiagram.id && signatureChanged && Date.now() < landingUntilRef.current) {
      // The opened drawing as it landed on the canvas (loading may have normalised it) is the saved version
      lastSavedKeyRef.current = liveKey;
      expectedLoadKeyRef.current = null;
      loadMatched = true;
    }
    if (signatureChanged) landingUntilRef.current = 0;
    // Nothing differs from the server version: the save status stays as it is
    const inSync = !!(activeDiagram && activeDiagram.id && isAuthenticated) &&
      (loadMatched || (!signatureChanged && liveKey === lastSavedKeyRef.current));
    if (isCloudSyncable && liveKey !== lastSavedKeyRef.current) {
      pendingFlushRef.current = { diagram: activeDiagram, payload: serializeWorkspaceState() };
    } else {
      pendingFlushRef.current = null;
    }

    const pendingTimer = setTimeout(() => {
      if (isLockedByOther) {
        setSaveStatus('locked');
      } else if (!inSync) {
        setSaveStatus(isCloudSyncable ? 'saving_cloud' : 'saving_local');
      }
    }, 0);

    // 1000ms delay for Local Storage save
    const localTimer = setTimeout(() => {
      const ts = saveToLocalDraft();
      if (!isCloudSyncable) {
        if (!ts) {
          // Storage full or blocked: do not claim the draft is saved
          setSaveStatus('error');
          return;
        }
        if (isLockedByOther) {
          setSaveStatus('locked');
        } else if (!inSync) {
          setSaveStatus('saved_local');
        }
        if (!inSync) setLastSavedTimestamp(new Date(ts).toLocaleTimeString());
      }
    }, 1000);

    // 2000ms delay for Cloud Auto-Sync
    let cloudTimer = null;
    if (isCloudSyncable) {
      cloudTimer = setTimeout(async () => {
        try {
          const payload = serializeWorkspaceState();
          // Nothing but selection, viewport or results changed since the last save: nothing to send
          if (contentKey(payload) === lastSavedKeyRef.current) {
            setSaveStatus('saved_cloud');
            return;
          }
          await putDiagram(activeDiagram, payload);
          setSaveStatus('saved_cloud');
          setLastSavedTimestamp(new Date().toLocaleTimeString());
        } catch (err) {
          if (isStaleConflict(err)) {
            setSaveStatus('error');
            setCollabNotice({ kind: 'stale', message: STALE_MESSAGE });
          } else if (err.response && (err.response.status === 404 || err.response.status === 403)) {
            if (setActiveDiagram) setActiveDiagram(null);
            setSaveStatus('saved_local');
          } else if (err.response && err.response.status === 409) {
            // Not the lock holder: look at the real lock; a free drawing is taken back and the save repeated
            try {
              const outcome = await recoverRefusedSave(activeDiagram);
              if (outcome === 'saved') {
                setSaveStatus('saved_cloud');
                setLastSavedTimestamp(new Date().toLocaleTimeString());
              } else if (outcome === 'locked') {
                setSaveStatus('locked');
              } else if (outcome === 'failed') {
                setSaveStatus('error');
              }
            } catch (retryErr) {
              if (isStaleConflict(retryErr)) {
                setSaveStatus('error');
                setCollabNotice({ kind: 'stale', message: STALE_MESSAGE });
              } else {
                console.error('Cloud auto-save failed:', retryErr);
                setSaveStatus('error');
              }
            }
          } else {
            console.error('Cloud auto-save failed:', err);
            setSaveStatus('error');
          }
        }
      }, 2000);
    }

    return () => {
      clearTimeout(pendingTimer);
      clearTimeout(localTimer);
      if (cloudTimer) clearTimeout(cloudTimer);
    };
  }, [contentSignature, activeProject, activeDiagram, isAuthenticated, hasLock, isLockedByOther, saveToLocalDraft, serializeWorkspaceState, setActiveDiagram, putDiagram, recoverRefusedSave]);

  // Manual Trigger for Instant Cloud Save
  const triggerManualCloudSave = useCallback(async () => {
    const isCloudSyncable = activeDiagram && activeDiagram.id && isAuthenticated && hasLock;

    if (!isCloudSyncable) {
      saveToLocalDraft();
      setSaveStatus(isLockedByOther ? 'locked' : 'saved_local');
      return true;
    }

    setSaveStatus('saving_cloud');
    try {
      const payload = serializeWorkspaceState();
      await putDiagram(activeDiagram, payload);
      setSaveStatus('saved_cloud');
      const timeStr = new Date().toLocaleTimeString();
      setLastSavedTimestamp(timeStr);
      return true;
    } catch (err) {
      if (isStaleConflict(err)) {
        setSaveStatus('error');
        setCollabNotice({ kind: 'stale', message: STALE_MESSAGE });
        return false;
      }
      if (err.response && (err.response.status === 404 || err.response.status === 403)) {
        if (setActiveDiagram) setActiveDiagram(null);
        setSaveStatus('saved_local');
        return true;
      }
      console.error('Manual cloud save failed:', err);
      setSaveStatus('error');
      return false;
    }
  }, [activeDiagram, isAuthenticated, hasLock, isLockedByOther, saveToLocalDraft, serializeWorkspaceState, setActiveDiagram, putDiagram]);

  // Hydration Loader on Boot
  // Reads a stored draft; null when it is empty, unreadable or in another file format (say so once)
  const parseDraft = useCallback((raw, discard) => {
    try {
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.nodes || !Array.isArray(parsed.nodes)) {
        return null;
      }

      const versionError = checkFormatVersion(parsed);
      if (versionError) {
        discard();
        setTimeout(() => notify(`Your unsaved draft was discarded.

${versionError}`, 'error'), 0);
        return null;
      }

      return parsed;
    } catch (e) {
      console.warn('Failed to parse local session draft:', e);
      return null;
    }
  }, []);

  // Compares a stored draft with the cloud copy of its drawing. The draft is only "restored" when it holds
  // work the server does not have and was made on top of the server's current version; a draft based on an
  // older version is reported as a conflict, so the caller can ask before it replaces anything.
  const reconcileDraft = useCallback(async (draft) => {
    const restoredResult = { source: 'draft', data: draft, restored: true };
    const showDraftTime = () => {
      if (draft.timestamp) {
        setRestoredDraftTime(new Date(draft.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    };
    const markRestored = () => {
      setIsRestoredFromDraft(true);
      showDraftTime();
      draftLoadedIdRef.current = draft.active_diagram_id || null;
      return restoredResult;
    };
    if (!draft.active_diagram_id) return markRestored();
    if (authRef.current.loading) await new Promise((resolve) => { authWaitersRef.current.push(resolve); });
    if (!authRef.current.isAuthenticated) return markRestored();
    let updatedAt;
    let server;
    try {
      const response = await axios.get(`/api/diagrams/${draft.active_diagram_id}`);
      updatedAt = response.data.updated_at;
      const raw = response.data.diagram_data;
      server = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      console.warn('Could not compare the draft with the cloud copy:', e);
      baseUpdatedAtRef.current = draft.base_updated_at || null;
      return markRestored();
    }
    if (contentKey(server) === contentKey(draft)) {
      baseUpdatedAtRef.current = updatedAt;
      markLoaded(server);
      setSaveStatus('saved_cloud');
      const savedAt = parseServerTime(updatedAt);
      if (savedAt) setLastSavedTimestamp(savedAt.toLocaleTimeString());
      return { source: 'server', data: server, restored: false, updatedAt };
    }
    const draftBase = parseServerTime(draft.base_updated_at);
    const serverTime = parseServerTime(updatedAt);
    if (draftBase && serverTime && draftBase.getTime() === serverTime.getTime()) {
      baseUpdatedAtRef.current = draft.base_updated_at;
      return markRestored();
    }
    showDraftTime();
    markLoaded(server);   // if the cloud version is chosen, it is not uploaded again
    return { source: 'server', data: server, restored: false, conflict: true, draft, updatedAt };
  }, [markLoaded]);

  // This tab's own draft (after a reload)
  const loadLocalDraftOnBoot = useCallback(() => parseDraft(readDraft(), removeDraft), [parseDraft]);

  const askAboutOrphan = useCallback(async (orphan) => {
    const when = orphan.timestamp ? new Date(orphan.timestamp).toLocaleString() : 'an earlier session';
    let name = '';
    try {
      name = JSON.parse(orphan.raw).active_diagram_title || '';
    } catch { /* unreadable draft: asked without a name */ }
    const restore = await confirmDialog({
      title: 'Restore unsaved drawing?',
      message: `An unsaved ${name ? `change to "${name}"` : 'drawing'} from ${when} was found in this browser. Restore it? Choosing Discard removes it.`,
      confirmLabel: 'Restore',
      cancelLabel: 'Discard',
    });
    if (!restore) {
      discardOrphan(orphan);
      return null;
    }
    const draft = parseDraft(orphan.raw, () => discardOrphan(orphan));
    if (draft) adoptDraft(orphan);
    return draft;
  }, [parseDraft]);

  // A new tab: offer the newest draft of a tab that is gone (closed, crashed, browser restarted)
  const offerOrphanDraft = useCallback(async () => {
    const orphan = findOrphanDraft();
    if (!orphan) return null;
    // React StrictMode runs the boot effect twice in dev: both runs share one dialog
    if (pendingOrphanOffers.has(orphan.key)) return pendingOrphanOffers.get(orphan.key);
    const offer = askAboutOrphan(orphan).finally(() => pendingOrphanOffers.delete(orphan.key));
    pendingOrphanOffers.set(orphan.key, offer);
    return offer;
  }, [askAboutOrphan]);

  return {
    saveStatus,
    lastSavedTimestamp,
    isRestoredFromDraft,
    restoredDraftTime,
    clearLocalDraft,
    loadLocalDraftOnBoot,
    offerOrphanDraft,
    reconcileDraft,
    markLoaded,
    triggerManualCloudSave,
    // Co-editing locking details
    lockInfo,
    isLockedByOther,
    isLockedByOtherTab,
    hasLock,
    reacquireAfterReconnect,
    checkoutDiagram,
    checkinDiagram,
    forceCheckinDiagram,
    fetchLockStatus,
    collabNotice,
    dismissCollabNotice
  };
}

