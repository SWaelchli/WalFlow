import { useState, useEffect } from 'react';
import axios from 'axios';
import { activeProjectFromDetail } from '../utils/activeProject';

/**
 * Fills in the details (pipe classes, members) of an active project that was restored with only id and title.
 * One request per project and signed-in user; a failure is reported through `projectDetailsFailed`.
 */
export function useProjectDetails({ activeProject, setActiveProject, currentUser }) {
  const [failedProjectId, setFailedProjectId] = useState(null);

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
  }, [projectId, userId, detailsMissing, setActiveProject]);

  const projectDetailsFailed = !!projectId && failedProjectId === projectId && detailsMissing;
  return { projectDetailsFailed };
}

export default useProjectDetails;
