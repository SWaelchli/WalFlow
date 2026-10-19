import { useEffect, useState } from 'react';
import axios from 'axios';

// Module-level cache so every inspector instance shares one request per fitting type.
const cache = {};
// Mounted hooks refetch when the catalog is invalidated (e.g. after an edit on the catalog page)
const listeners = new Set();

/**
 * Loads fitting standards from the catalog API (e.g. reducers, pipe schedules).
 * The catalogs live only in the database: this returns [] while loading or when the API is
 * unavailable, and callers show that the catalog is not loaded.
 */
export function useFittingStandards(fittingType = 'reducer') {
  const [standards, setStandards] = useState(() => cache[fittingType]?.data || []);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion(v => v + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  useEffect(() => {
    let active = true;
    if (!cache[fittingType]) {
      // The request writes only to its own entry: after an invalidation it must not touch the newer one
      const entry = { data: null };
      entry.promise = axios
        .get('/api/fitting-standards', { params: { fitting_type: fittingType } })
        .then(res => {
          entry.data = Array.isArray(res.data) ? res.data : [];
          return entry.data;
        })
        .catch(() => {
          // Allow a retry on the next mount
          if (cache[fittingType] === entry) delete cache[fittingType];
          return [];
        });
      cache[fittingType] = entry;
    }
    cache[fittingType].promise.then(data => { if (active) setStandards(data); });
    return () => { active = false; };
  }, [fittingType, version]);

  return standards;
}

/** Drops the cached catalog so the next mount refetches (call after catalog edits). */
export function invalidateFittingStandards(fittingType) {
  if (fittingType) delete cache[fittingType];
  else Object.keys(cache).forEach(k => delete cache[k]);
  listeners.forEach(listener => listener());
}

/** Catalog rows already loaded for a fitting type ([] before the first response), for non-React callers. */
export function getCachedFittingStandards(fittingType) {
  return cache[fittingType]?.data || [];
}

/** Puts catalog rows into the cache (tests, or data fetched elsewhere). */
export function primeFittingStandards(fittingType, data) {
  cache[fittingType] = { data, promise: Promise.resolve(data) };
}
