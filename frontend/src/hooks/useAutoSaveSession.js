import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { persistKey } from '../utils/graphSignature';
import { notify, confirmDialog } from '../utils/dialogs';
import axios from 'axios';
import { serializeDiagram, checkFormatVersion } from '../utils/diagramFile';
import { useAuth } from './useAuth';
import { writeDraft, readDraft, removeDraft, startHeartbeat, pruneDrafts, findOrphanDraft, adoptDraft, discardOrphan } from '../utils/draftStorage';

// One id per browser tab, sent with cloud saves so the server's "diagram updated" notice skips the saving tab
const CLIENT_ID = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `tab-${Math.random().toString(36).slice(2)}`;

// Content that decides whether a save is needed: everything except the timestamp and the viewport
const contentKey = (payload) => {
  const { timestamp: _t, viewport: _v, ...content } = payload;
  return JSON.stringify(content);
};

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
  const { currentUser } = useAuth();
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

  // Collaboration Lock States
  const [lockInfo, setLockInfo] = useState(null); // { user_id, username, expires_at }
  const hasLock = !!(lockInfo && currentUser && lockInfo.user_id === currentUser.id);
  const isLockedByOther = !!(lockInfo && (!currentUser || lockInfo.user_id !== currentUser.id));

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

  // Serializer function
  const serializeWorkspaceState = useCallback(() => {
    const { nodes, edges, globalSettings, cases, activeCaseId, activeProject, activeDiagram, reactFlowInstance } = stateRef.current;
    const viewport = reactFlowInstance ? reactFlowInstance.getViewport() : { x: 0, y: 0, zoom: 1 };
    
    // Results are not part of a draft or cloud save; the diagram is re-solved after loading
    const { created_at: _createdAt, ...base } = serializeDiagram({ nodes, edges, globalSettings: globalSettings || {}, cases, activeCaseId });
    return {
      ...base,
      timestamp: new Date().toISOString(),
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
  const activeDiagramId = activeDiagram ? activeDiagram.id : null;
  useEffect(() => {
    lastSavedKeyRef.current = activeDiagramId ? contentKey(serializeWorkspaceState()) : null;
  }, [activeDiagramId, serializeWorkspaceState]);

  // Cloud save with the version check; remembers the new server version and content on success
  const putDiagram = useCallback(async (diagram, payload) => {
    const response = await axios.put(`/api/diagrams/${diagram.id}`, {
      title: diagram.title,
      description: diagram.description || '',
      diagram_data: JSON.stringify(payload),
      base_updated_at: baseUpdatedAtRef.current || undefined
    }, { headers: { 'X-Walflow-Client-Id': CLIENT_ID } });
    if (response.data && response.data.updated_at) baseUpdatedAtRef.current = response.data.updated_at;
    lastSavedKeyRef.current = contentKey(payload);
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

  // Fetch lock status for diagram
  const fetchLockStatus = useCallback(async (diagramId) => {
    if (!diagramId || !isAuthenticated) return null;
    try {
      const response = await axios.get(`/api/diagrams/${diagramId}/lock-status`);
      if (response.data.is_locked) {
        setLockInfo(response.data.lock);
        return response.data.lock;
      } else {
        setLockInfo(null);
        return null;
      }
    } catch (err) {
      console.error('Failed to fetch diagram lock status:', err);
      return null;
    }
  }, [isAuthenticated]);

  // Checkout diagram (Acquire Lock)
  const checkoutDiagram = useCallback(async () => {
    if (!activeDiagram || !activeDiagram.id || !isAuthenticated) return false;
    try {
      const response = await axios.post(`/api/diagrams/${activeDiagram.id}/checkout`);
      if (response.data.status === 'success') {
        setLockInfo(response.data.lock);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to checkout diagram:', err);
      if (err.response && err.response.data && err.response.data.detail) {
        notify(err.response.data.detail, 'warning');
      } else {
        notify('Could not check out diagram. It may be locked by another user.', 'error');
      }
      // Refresh status
      fetchLockStatus(activeDiagram.id);
      return false;
    }
  }, [activeDiagram, isAuthenticated, fetchLockStatus]);

  // Checkin diagram (Release Lock)
  const checkinDiagram = useCallback(async () => {
    if (!activeDiagram || !activeDiagram.id || !isAuthenticated) return false;
    try {
      await axios.post(`/api/diagrams/${activeDiagram.id}/checkin`);
      setLockInfo(null);
      return true;
    } catch (err) {
      console.error('Failed to checkin diagram:', err);
      return false;
    }
  }, [activeDiagram, isAuthenticated]);

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
      setLockInfo(null);
      return true;
    } catch (err) {
      console.error('Failed to force release lock:', err);
      notify('Failed to release lock. You must be an owner of this project.', 'error');
      return false;
    }
  }, [activeDiagram, isAuthenticated]);

  // WebSocket Collaboration Event Listener
  useEffect(() => {
    const handleCollabEvent = (e) => {
      const eventData = e.detail;
      if (!activeDiagram || eventData.diagram_id !== activeDiagram.id) return;

      if (eventData.action === 'lock_acquired') {
        setLockInfo(eventData.lock);
      } else if (eventData.action === 'lock_released') {
        setLockInfo(null);
        if (eventData.forced && eventData.by_username) {
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
  }, [activeDiagram, currentUser]);

  // Lock status fetch when diagram changes
  useEffect(() => {
    let active = true;
    if (activeDiagram && activeDiagram.id) {
      axios.get(`/api/diagrams/${activeDiagram.id}/lock-status`)
        .then(response => {
          if (active) {
            Promise.resolve().then(() => {
              if (active) {
                if (response.data.is_locked) {
                  setLockInfo(response.data.lock);
                } else {
                  setLockInfo(null);
                }
              }
            });
          }
        })
        .catch(err => {
          console.error('Failed to fetch diagram lock status:', err);
        });
    } else {
      Promise.resolve().then(() => {
        if (active) setLockInfo(null);
      });
    }
    return () => { active = false; };
  }, [activeDiagram]);

  // Heartbeat lease extension (every 5 minutes if we hold the lock)
  useEffect(() => {
    if (!hasLock || !activeDiagram || !activeDiagram.id || !isAuthenticated) return;

    const intervalId = setInterval(() => {
      checkoutDiagram();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(intervalId);
  }, [hasLock, activeDiagram, isAuthenticated, checkoutDiagram]);

  // Synchronous saving on page unload / tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveToLocalDraft();
    };
    // Give the edit lock back when the tab closes (the server also releases it when the socket drops)
    const handlePageHide = () => {
      if (hasLock && activeDiagram && activeDiagram.id && navigator.sendBeacon) {
        navigator.sendBeacon(`/api/diagrams/${activeDiagram.id}/checkin`);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [saveToLocalDraft, hasLock, activeDiagram]);

  // What a save would write. Selection, measuring and results do not change it, so they no longer start the
  // save timers; a moved component does.
  const contentSignature = useMemo(
    () => persistKey({ nodes, edges, globalSettings, cases, activeCaseId }),
    [nodes, edges, globalSettings, cases, activeCaseId]
  );

  // Skip initial mount effect trigger
  const isInitialMount = useRef(true);

  // Debounced Local Draft & Cloud Auto-Save Engine
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const isCloudSyncable = activeDiagram && activeDiagram.id && isAuthenticated && hasLock;

    const pendingTimer = setTimeout(() => {
      if (isLockedByOther) {
        setSaveStatus('locked');
      } else {
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
        setSaveStatus(isLockedByOther ? 'locked' : 'saved_local');
        setLastSavedTimestamp(new Date(ts).toLocaleTimeString());
      }
    }, 1000);

    // 2000ms delay for Cloud Auto-Sync
    let cloudTimer = null;
    if (isCloudSyncable && !isLockedByOther) {
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
          console.error('Cloud auto-save failed:', err);
          if (isStaleConflict(err)) {
            setSaveStatus('error');
            setCollabNotice({ kind: 'stale', message: STALE_MESSAGE });
          } else if (err.response && (err.response.status === 404 || err.response.status === 403)) {
            console.warn('Active diagram no longer accessible. Detaching.');
            if (setActiveDiagram) setActiveDiagram(null);
            setSaveStatus('saved_local');
          } else if (err.response && err.response.status === 409) {
            // Conflict (lost lock)
            setSaveStatus('locked');
            setLockInfo({ user_id: 'unknown', username: 'another user', expires_at: new Date().toISOString() });
          } else {
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
  }, [contentSignature, activeProject, activeDiagram, isAuthenticated, hasLock, isLockedByOther, saveToLocalDraft, serializeWorkspaceState, setActiveDiagram, putDiagram]);

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
      console.error('Manual cloud save failed:', err);
      if (isStaleConflict(err)) {
        setSaveStatus('error');
        setCollabNotice({ kind: 'stale', message: STALE_MESSAGE });
        return false;
      }
      if (err.response && (err.response.status === 404 || err.response.status === 403)) {
        console.warn('Active diagram no longer accessible. Detaching.');
        if (setActiveDiagram) setActiveDiagram(null);
        setSaveStatus('saved_local');
        return true;
      }
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

      setIsRestoredFromDraft(true);
      if (parsed.timestamp) {
        setRestoredDraftTime(new Date(parsed.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      return parsed;
    } catch (e) {
      console.warn('Failed to parse local session draft:', e);
      return null;
    }
  }, []);

  // This tab's own draft (after a reload)
  const loadLocalDraftOnBoot = useCallback(() => parseDraft(readDraft(), removeDraft), [parseDraft]);

  const askAboutOrphan = useCallback(async (orphan) => {
    const when = orphan.timestamp ? new Date(orphan.timestamp).toLocaleString() : 'an earlier session';
    const restore = await confirmDialog({
      title: 'Restore unsaved drawing?',
      message: `An unsaved drawing from ${when} was found in this browser. Restore it? Choosing Discard removes it.`,
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
    triggerManualCloudSave,
    // Co-editing locking details
    lockInfo,
    isLockedByOther,
    hasLock,
    checkoutDiagram,
    checkinDiagram,
    forceCheckinDiagram,
    fetchLockStatus,
    collabNotice,
    dismissCollabNotice
  };
}

