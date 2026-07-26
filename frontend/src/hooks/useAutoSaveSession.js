import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { FILE_FORMAT_VERSION, APP_VERSION } from '../constants';

export const LOCAL_DRAFT_KEY = 'walflow_active_session_draft';

export function useAutoSaveSession({
  nodes,
  edges,
  globalSettings,
  cases,
  activeCaseId,
  reactFlowInstance,
  isAuthenticated,
  activeProject
}) {
  const [saveStatus, setSaveStatus] = useState('saved_local'); // 'saved_cloud' | 'saving_cloud' | 'saved_local' | 'saving_local' | 'error'
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState(null);
  const [isRestoredFromDraft, setIsRestoredFromDraft] = useState(false);
  const [restoredDraftTime, setRestoredDraftTime] = useState(null);

  // Ref to track latest state for beforeunload and debounced saves
  const stateRef = useRef({
    nodes,
    edges,
    globalSettings,
    cases,
    activeCaseId,
    activeProject,
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
      reactFlowInstance
    };
  }, [nodes, edges, globalSettings, cases, activeCaseId, activeProject, reactFlowInstance]);

  // Serializer function
  const serializeWorkspaceState = useCallback(() => {
    const { nodes, edges, globalSettings, cases, activeCaseId, activeProject, reactFlowInstance } = stateRef.current;
    const viewport = reactFlowInstance ? reactFlowInstance.getViewport() : { x: 0, y: 0, zoom: 1 };
    
    return {
      version: FILE_FORMAT_VERSION,
      app_version: APP_VERSION,
      format: 'walflow',
      timestamp: new Date().toISOString(),
      active_project_id: activeProject?.id || null,
      active_project_title: activeProject?.title || null,
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

    const pendingTimer = setTimeout(() => {
      setSaveStatus(activeProject && isAuthenticated ? 'saving_cloud' : 'saving_local');
    }, 0);

    // 1000ms delay for Local Storage save
    const localTimer = setTimeout(() => {
      const ts = saveToLocalDraft();
      if (!activeProject || !isAuthenticated) {
        setSaveStatus('saved_local');
        setLastSavedTimestamp(ts ? new Date(ts).toLocaleTimeString() : new Date().toLocaleTimeString());
      }
    }, 1000);

    // 2000ms delay for Cloud Auto-Sync (if active cloud project is selected)
    let cloudTimer = null;
    if (activeProject && activeProject.id && isAuthenticated) {
      cloudTimer = setTimeout(async () => {
        try {
          const payload = serializeWorkspaceState();
          await axios.put(`/api/diagrams/${activeProject.id}`, {
            title: activeProject.title,
            description: activeProject.description || '',
            diagram_data: JSON.stringify(payload)
          });
          setSaveStatus('saved_cloud');
          setLastSavedTimestamp(new Date().toLocaleTimeString());
        } catch (err) {
          console.error('Cloud auto-save failed:', err);
          setSaveStatus('error');
        }
      }, 2000);
    }

    return () => {
      clearTimeout(pendingTimer);
      clearTimeout(localTimer);
      if (cloudTimer) clearTimeout(cloudTimer);
    };
  }, [nodes, edges, globalSettings, cases, activeCaseId, activeProject, isAuthenticated, saveToLocalDraft, serializeWorkspaceState]);

  // Manual Trigger for Instant Cloud Save
  const triggerManualCloudSave = useCallback(async () => {
    if (!activeProject || !activeProject.id || !isAuthenticated) {
      saveToLocalDraft();
      setSaveStatus('saved_local');
      return true;
    }

    setSaveStatus('saving_cloud');
    try {
      const payload = serializeWorkspaceState();
      await axios.put(`/api/diagrams/${activeProject.id}`, {
        title: activeProject.title,
        description: activeProject.description || '',
        diagram_data: JSON.stringify(payload)
      });
      setSaveStatus('saved_cloud');
      const timeStr = new Date().toLocaleTimeString();
      setLastSavedTimestamp(timeStr);
      return true;
    } catch (err) {
      console.error('Manual cloud save failed:', err);
      setSaveStatus('error');
      return false;
    }
  }, [activeProject, isAuthenticated, saveToLocalDraft, serializeWorkspaceState]);

  // Hydration Loader on Boot
  const loadLocalDraftOnBoot = useCallback(() => {
    try {
      const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.nodes || !Array.isArray(parsed.nodes)) {
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
    triggerManualCloudSave
  };
}
