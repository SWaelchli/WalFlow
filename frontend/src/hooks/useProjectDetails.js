import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { activeProjectFromDetail } from '../utils/activeProject';

/**
 * Fills in the details (pipe classes, members) of an active project that was restored with only id and title.
 * One request per project and signed-in user; a failure is reported through `projectDetailsFailed`.
 */
export function useProjectDetails({ activeProject, setActiveProject, currentUser }) {
  const [failedProjectId, setFailedProjectId] = useState(null);

  const [attempt, setAttempt] = useState(0);

  const projectId = activeProject?.id;
  const userId = currentUser?.id;
  const detailsMissing = !!activeProject && activeProject.members === undefined;

  useEffect(() => {
    if (!userId || !projectId || !detailsMissing) return undefined;
    let superseded = false;
    axios.get(`/api/projects/${projectId}`)
      .then(res => {
        if (superseded) return;
        setActiveProject(prev => (prev?.id === projectId && prev.members === undefined ? activeProjectFromDetail(res.data) : prev));
        setFailedProjectId(null);
      })
      .catch(err => {
        if (superseded) return;
        console.warn('Could not load the project details', err);
        setFailedProjectId(projectId);
      });
    return () => { superseded = true; };
  }, [projectId, userId, detailsMissing, setActiveProject, attempt]);

  const projectDetailsFailed = !!projectId && failedProjectId === projectId && detailsMissing;

  // Clears the failure and lets the effect above send one new request
  const retryProjectDetails = useCallback(() => {
    if (!projectDetailsFailed) return;
    setFailedProjectId(null);
    setAttempt(n => n + 1);
  }, [projectDetailsFailed]);

  return { projectDetailsFailed, retryProjectDetails };
}

export default useProjectDetails;
