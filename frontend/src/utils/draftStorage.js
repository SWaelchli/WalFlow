// Local drafts, one per browser tab: two tabs no longer overwrite each other's draft.
//
// A tab's id lives in sessionStorage, so a reload keeps the tab's draft. The draft itself is in
// localStorage under `walflow_draft_<tabId>`. Every tab marks itself alive with a heartbeat; a draft whose
// tab has gone quiet (closed, crashed, browser restarted) is "orphaned" and is offered to the next tab that
// opens. Drafts older than a week are removed.

export const DRAFT_PREFIX = 'walflow_draft_';
const ALIVE_PREFIX = 'walflow_tab_alive_';
const TAB_ID_KEY = 'walflow_tab_id';
// Single-key draft of earlier versions; offered once like an orphan, then gone
export const LEGACY_DRAFT_KEY = 'walflow_active_session_draft';

export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const HEARTBEAT_MS = 5000;
export const ALIVE_WINDOW_MS = 20000;

const makeId = () => ((typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `tab-${Math.random().toString(36).slice(2)}`);

let cachedTabId = null;

export function getTabId() {
  if (cachedTabId) return cachedTabId;
  try {
    cachedTabId = sessionStorage.getItem(TAB_ID_KEY);
    if (!cachedTabId) {
      cachedTabId = makeId();
      sessionStorage.setItem(TAB_ID_KEY, cachedTabId);
    }
  } catch {
    cachedTabId = cachedTabId || makeId();   // storage blocked: the id lasts as long as the page
  }
  return cachedTabId;
}

/** Test hook: forget the cached id so the next call reads sessionStorage again. */
export function resetTabIdCache() {
  cachedTabId = null;
}

export const ownDraftKey = () => DRAFT_PREFIX + getTabId();

/** Writes this tab's draft; throws when the storage is full or blocked so the caller can say so. */
export function writeDraft(json) {
  localStorage.setItem(ownDraftKey(), json);
}

export function readDraft() {
  try {
    return localStorage.getItem(ownDraftKey());
  } catch {
    return null;
  }
}

export function removeDraft() {
  try {
    localStorage.removeItem(ownDraftKey());
  } catch {
    // storage unavailable: nothing to remove
  }
}

const beat = () => {
  try {
    localStorage.setItem(ALIVE_PREFIX + getTabId(), String(Date.now()));
  } catch {
    // storage unavailable or full: the tab simply looks closed to others
  }
};

/** Marks this tab as open until the returned function is called. */
export function startHeartbeat() {
  beat();
  const id = setInterval(beat, HEARTBEAT_MS);
  return () => {
    clearInterval(id);
    try {
      localStorage.removeItem(ALIVE_PREFIX + getTabId());
    } catch {
      // ignore
    }
  };
}

const allKeys = () => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
  return keys.filter(Boolean);
};

const parseTimestamp = (raw) => {
  try {
    const t = Date.parse(JSON.parse(raw)?.timestamp);
    return Number.isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
};

const isTabAlive = (tabId, now) => {
  if (tabId === getTabId()) return true;
  const last = Number(localStorage.getItem(ALIVE_PREFIX + tabId));
  return Number.isFinite(last) && last > 0 && now - last < ALIVE_WINDOW_MS;
};

/** Removes drafts older than a week and the heartbeat entries of tabs that are gone. */
export function pruneDrafts(now = Date.now()) {
  try {
    for (const key of allKeys()) {
      if (key.startsWith(DRAFT_PREFIX) || key === LEGACY_DRAFT_KEY) {
        const raw = localStorage.getItem(key);
        const ts = parseTimestamp(raw);
        if (ts && now - ts > DRAFT_MAX_AGE_MS) localStorage.removeItem(key);
      } else if (key.startsWith(ALIVE_PREFIX)) {
        const last = Number(localStorage.getItem(key));
        if (!last || now - last > DRAFT_MAX_AGE_MS) localStorage.removeItem(key);
      }
    }
  } catch {
    // storage unavailable: nothing to prune
  }
}

/** The newest draft whose tab is no longer open: { key, raw, timestamp }, or null. */
export function findOrphanDraft(now = Date.now()) {
  try {
    let best = null;
    for (const key of allKeys()) {
      const tabId = key.startsWith(DRAFT_PREFIX) ? key.slice(DRAFT_PREFIX.length) : null;
      if (key !== LEGACY_DRAFT_KEY && !tabId) continue;
      if (tabId && isTabAlive(tabId, now)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const timestamp = parseTimestamp(raw);
      if (!best || timestamp > best.timestamp) best = { key, raw, timestamp };
    }
    return best;
  } catch {
    return null;
  }
}

/** Takes an orphaned draft over as this tab's own draft. */
export function adoptDraft(orphan) {
  try {
    localStorage.setItem(ownDraftKey(), orphan.raw);
    if (orphan.key !== ownDraftKey()) localStorage.removeItem(orphan.key);
  } catch {
    // full or blocked: the draft stays where it is
  }
}

/** Throws the orphaned draft away (the user declined it). */
export function discardOrphan(orphan) {
  try {
    localStorage.removeItem(orphan.key);
  } catch {
    // ignore
  }
}
