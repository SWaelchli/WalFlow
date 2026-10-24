import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { BUILTIN_SOLVER_SETTINGS, SOLVER_KEYS } from '../utils/settingsLevels';

const LOCAL_KEY = 'walflow_global_solver';

const readLocalSolver = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    if (raw && typeof raw === 'object') return { ...BUILTIN_SOLVER_SETTINGS, ...raw };
  } catch { /* storage not accessible or corrupt: use the defaults */ }
  return { ...BUILTIN_SOLVER_SETTINGS };
};

const writeLocalSolver = (solver) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(solver)); } catch { /* ignore */ }
};

const onlySolver = (obj) => Object.fromEntries(SOLVER_KEYS.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));

/**
 * Global (user) and project settings.
 * Global settings live in the database for logged-in users and in localStorage otherwise; a local
 * preference moves to the database on the first login. The unit system is a display preference only.
 */
export default function useSettingsLevels({ isAuthenticated, activeProjectId, unitSystem, setUnitSystem }) {
  const [userSolver, setUserSolver] = useState(readLocalSolver);
  const [loadedProject, setLoadedProject] = useState({ id: null, settings: null });
  const syncedRef = useRef(false);
  const unitSystemRef = useRef(unitSystem);
  const userSolverRef = useRef(userSolver);
  useEffect(() => {
    unitSystemRef.current = unitSystem;
    userSolverRef.current = userSolver;
  }, [unitSystem, userSolver]);

  // Load (or migrate) the user's global settings when logging in
  useEffect(() => {
    syncedRef.current = false;
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get('/api/settings');
        if (cancelled) return;
        if (data.stored) {
          setUserSolver({ ...BUILTIN_SOLVER_SETTINGS, ...data.solver });
          if (data.unit_system) setUnitSystem(data.unit_system);
        } else {
          await axios.put('/api/settings', { unit_system: unitSystemRef.current, solver: onlySolver(readLocalSolver()) });
        }
        if (!cancelled) syncedRef.current = true;
      } catch {
        // the server is not reachable: keep working with the local values
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, setUnitSystem]);

  const persistUser = useCallback((solver, unit) => {
    if (!isAuthenticated || !syncedRef.current) return;
    axios.put('/api/settings', { unit_system: unit, solver: onlySolver(solver) }).catch(() => {});
  }, [isAuthenticated]);

  const updateUserSolver = useCallback((patch) => {
    const next = { ...userSolverRef.current, ...patch };
    userSolverRef.current = next;
    setUserSolver(next);
    writeLocalSolver(next);
    persistUser(next, unitSystemRef.current);
  }, [persistUser]);

  // Unit preference changes are stored with the user
  const lastUnitRef = useRef(unitSystem);
  useEffect(() => {
    if (lastUnitRef.current === unitSystem) return;
    lastUnitRef.current = unitSystem;
    persistUser(userSolver, unitSystem);
  }, [unitSystem, userSolver, persistUser]);

  // Project settings follow the open project
  useEffect(() => {
    if (!isAuthenticated || !activeProjectId) return undefined;
    let cancelled = false;
    axios.get(`/api/projects/${activeProjectId}`)
      .then(({ data }) => { if (!cancelled) setLoadedProject({ id: activeProjectId, settings: data.settings || null }); })
      .catch(() => { if (!cancelled) setLoadedProject({ id: activeProjectId, settings: null }); });
    return () => { cancelled = true; };
  }, [isAuthenticated, activeProjectId]);
  const projectSettings = isAuthenticated && activeProjectId && loadedProject.id === activeProjectId ? loadedProject.settings : null;

  /** Owner only (the server enforces it). Resolves to the saved settings, or rejects with the server error. */
  const updateProjectSettings = useCallback(async (next) => {
    const { data } = await axios.put(`/api/projects/${activeProjectId}`, { settings: next });
    setLoadedProject({ id: activeProjectId, settings: data.settings || next });
    return data.settings || next;
  }, [activeProjectId]);

  return {
    userSettings: { unit_system: unitSystem, solver: userSolver },
    updateUserSolver,
    projectSettings,
    updateProjectSettings,
  };
}
