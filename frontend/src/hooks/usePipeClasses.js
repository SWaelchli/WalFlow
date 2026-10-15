import { useState, useCallback, useEffect, useMemo } from 'react';
import axios from 'axios';

/** System pipe class catalogue, narrowed to what the active project allows. */
export function usePipeClasses(activeProject) {
  const [pipeClasses, setPipeClasses] = useState([]);

  const fetchPipeClasses = useCallback(async () => {
    try {
      const res = await axios.get('/api/pipe-classes');
      setPipeClasses(res.data);
    } catch {
      console.warn("Failed to load pipe classes catalog in App.");
    }
  }, []);

  useEffect(() => {
    // loads the catalogue once; state is set after the request returns, not synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPipeClasses();
  }, [fetchPipeClasses]);

  const availablePipeClasses = useMemo(() => {
    if (!pipeClasses || pipeClasses.length === 0) return [];
    if (activeProject && Array.isArray(activeProject.allowed_pipe_classes)) {
      return pipeClasses.filter(c => 
        activeProject.allowed_pipe_classes.includes(c.id) || 
        activeProject.allowed_pipe_classes.includes(c.code)
      );
    }
    return pipeClasses;
  }, [pipeClasses, activeProject]);


  const allowCustomPipes = useMemo(() => {
    if (!activeProject) return true;
    return activeProject.allow_custom_pipes !== false;
  }, [activeProject]);

  return { pipeClasses, fetchPipeClasses, availablePipeClasses, allowCustomPipes };
}

export default usePipeClasses;
