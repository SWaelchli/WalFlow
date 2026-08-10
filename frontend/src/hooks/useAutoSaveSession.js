import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { FILE_FORMAT_VERSION, APP_VERSION } from '../constants';
import { useAuth } from './useAuth';

export const LOCAL_DRAFT_KEY = 'walflow_active_session_draft';

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
    
    return {
      version: FILE_FORMAT_VERSION,
      app_version: APP_VERSION,
      format: 'walflow',
      timestamp: new Date().toISOString(),
      active_project_id: activeProject?.id || null,
      active_project_title: activeProject?.title || null,
      active_diagram_id: activeDiagram?.id || null,
      active_diagram_title: activeDiagram?.title || null,
      viewport,
      active_case_id: activeCaseId,
      cases: cases || [],
      nodes: nodes || [],
      edges: edges || [],
      globalSettings: globalSettings || {}
    };
  }, []);

  // Helper to save to local browser storage
  const saveToLocalDraft = useCallback(() => {
    try {
      const payload = serializeWorkspaceState();
      localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(payload));
      return payload.timestamp;
    } catch (e) {
      console.warn('Failed to save session draft to localStorage:', e);
      return null;
    }
  }, [serializeWorkspaceState]);

  // Helper to purge local draft
  const clearLocalDraft = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_DRAFT_KEY);
    } catch (e) {
      console.warn('Failed to remove local draft:', e);
    }
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
        alert(err.response.data.detail);
      } else {
        alert('Could not check out diagram. It may be locked by another user.');
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
    if (!window.confirm('Force release another user\'s edit lock? Any unsaved work they have will not sync to the cloud.')) {
      return false;
    }
    try {
      await axios.post(`/api/diagrams/${activeDiagram.id}/force-checkin`);
      setLockInfo(null);
      return true;
    } catch (err) {
      console.error('Failed to force release lock:', err);
      alert('Failed to release lock. You must be an owner of this project.');
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
          alert(`Your checkout lock was force-released by project owner ${eventData.by_username}.`);
        }
      } else if (eventData.action === 'diagram_updated') {
        // Diagram was modified on the server
        if (currentUser && eventData.user_id !== currentUser.id) {
          if (window.confirm(`Co-editor ${eventData.username} has updated this diagram. Would you like to reload the canvas to see their changes?`)) {
            window.location.reload();
          }
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

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveToLocalDraft]);

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
        setSaveStatus(isLockedByOther ? 'locked' : 'saved_local');
        setLastSavedTimestamp(ts ? new Date(ts).toLocaleTimeString() : new Date().toLocaleTimeString());
      }
    }, 1000);

    // 2000ms delay for Cloud Auto-Sync
    let cloudTimer = null;
    if (isCloudSyncable && !isLockedByOther) {
      cloudTimer = setTimeout(async () => {
        try {
          const payload = serializeWorkspaceState();
          await axios.put(`/api/diagrams/${activeDiagram.id}`, {
            title: activeDiagram.title,
            description: activeDiagram.description || '',
            diagram_data: JSON.stringify(payload)
          });
          setSaveStatus('saved_cloud');
          setLastSavedTimestamp(new Date().toLocaleTimeString());
        } catch (err) {
          console.error('Cloud auto-save failed:', err);
          if (err.response && (err.response.status === 404 || err.response.status === 403)) {
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
  }, [nodes, edges, globalSettings, cases, activeCaseId, activeProject, activeDiagram, isAuthenticated, hasLock, isLockedByOther, saveToLocalDraft, serializeWorkspaceState, setActiveDiagram]);

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
      await axios.put(`/api/diagrams/${activeDiagram.id}`, {
        title: activeDiagram.title,
        description: activeDiagram.description || '',
        diagram_data: JSON.stringify(payload)
      });
      setSaveStatus('saved_cloud');
      const timeStr = new Date().toLocaleTimeString();
      setLastSavedTimestamp(timeStr);
      return true;
    } catch (err) {
      console.error('Manual cloud save failed:', err);
      if (err.response && (err.response.status === 404 || err.response.status === 403)) {
        console.warn('Active diagram no longer accessible. Detaching.');
        if (setActiveDiagram) setActiveDiagram(null);
        setSaveStatus('saved_local');
        return true;
      }
      setSaveStatus('error');
      return false;
    }
  }, [activeDiagram, isAuthenticated, hasLock, isLockedByOther, saveToLocalDraft, serializeWorkspaceState, setActiveDiagram]);

  // Hydration Loader on Boot
  const loadLocalDraftOnBoot = useCallback(() => {
    try {
      const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.nodes || !Array.isArray(parsed.nodes)) {
        return null;
      }

      // Safeguard: Purge old incompatible local drafts
      if (parsed.version !== '0.2') {
        console.warn(`Local draft version '${parsed.version || '0.1'}' is incompatible with version '0.2'. Purging draft.`);
        localStorage.removeItem(LOCAL_DRAFT_KEY);
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

  return {
    saveStatus,
    lastSavedTimestamp,
    isRestoredFromDraft,
    restoredDraftTime,
    clearLocalDraft,
    loadLocalDraftOnBoot,
    triggerManualCloudSave,
    // Co-editing locking details
    lockInfo,
    isLockedByOther,
    hasLock,
    checkoutDiagram,
    checkinDiagram,
    forceCheckinDiagram,
    fetchLockStatus
  };
}

