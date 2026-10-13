import { useEffect, useState } from 'react';
import axios from 'axios';

// Module-level cache so every inspector instance shares one request per fitting type.
const cache = {};

/**
 * Loads fitting standards from the catalog API (e.g. reducers).
 * Returns [] while loading or when the API is unavailable; callers fall back to
 * the bundled ASME / DIN datasets in that case.
 */
export function useFittingStandards(fittingType = 'reducer') {
  const [standards, setStandards] = useState(() => cache[fittingType]?.data || []);

  useEffect(() => {
    let active = true;
    if (!cache[fittingType]) {
      cache[fittingType] = {
        data: null,
        promise: axios
          .get('/api/fitting-standards', { params: { fitting_type: fittingType } })
          .then(res => {
            cache[fittingType].data = Array.isArray(res.data) ? res.data : [];
            return cache[fittingType].data;
          })
          .catch(() => {
            // Allow a retry on the next mount
            delete cache[fittingType];
            return [];
          })
      };
    }
    cache[fittingType].promise.then(data => { if (active) setStandards(data); });
    return () => { active = false; };
  }, [fittingType]);

  return standards;
}

/** Drops the cached catalog so the next mount refetches (call after catalog edits). */
export function invalidateFittingStandards(fittingType) {
  if (fittingType) delete cache[fittingType];
  else Object.keys(cache).forEach(k => delete cache[k]);
}
