import { describe, it, expect, beforeEach } from 'vitest';
import {
  DRAFT_PREFIX, LEGACY_DRAFT_KEY, DRAFT_MAX_AGE_MS, ALIVE_WINDOW_MS,
  getTabId, resetTabIdCache, ownDraftKey, writeDraft, readDraft, removeDraft,
  startHeartbeat, pruneDrafts, findOrphanDraft, adoptDraft, discardOrphan, isMyTabLock,
} from './draftStorage';

const draft = (iso) => JSON.stringify({ nodes: [], timestamp: iso });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetTabIdCache();
});

describe('per-tab drafts', () => {
  it('keeps the tab id across reloads only via pagehide, so a duplicated tab gets a new id', () => {
    const id = getTabId();
    expect(sessionStorage.getItem('walflow_tab_id')).toBeNull();   // a duplicated tab copies sessionStorage: it must find nothing
    resetTabIdCache();
    expect(getTabId()).not.toBe(id);

    const kept = getTabId();
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem('walflow_tab_id')).toBe(kept);
    resetTabIdCache();                                              // reload
    expect(getTabId()).toBe(kept);
    expect(ownDraftKey()).toBe(DRAFT_PREFIX + kept);
  });

  it('two tabs write to different keys and do not overwrite each other', () => {
    writeDraft('tab A');
    const keyA = ownDraftKey();
    sessionStorage.clear();
    resetTabIdCache();            // a second tab
    writeDraft('tab B');
    expect(ownDraftKey()).not.toBe(keyA);
    expect(localStorage.getItem(keyA)).toBe('tab A');
    expect(readDraft()).toBe('tab B');
    removeDraft();
    expect(readDraft()).toBeNull();
    expect(localStorage.getItem(keyA)).toBe('tab A');
  });

  it('reports a full storage by throwing, so the caller does not claim "saved"', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    try {
      expect(() => writeDraft('x')).toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('isMyTabLock', () => {
  it.each([
    ['no lock', null, 'u1', false],
    ['no user', { user_id: 'u1' }, null, false],
    ['another user', { user_id: 'u2', session_id: '__tab__' }, 'u1', false],
    ['same user, no session on the lock', { user_id: 'u1' }, 'u1', true],
    ['same user, this tab', { user_id: 'u1', session_id: '__tab__' }, 'u1', true],
    ['same user, another tab', { user_id: 'u1', session_id: 'some-other-tab' }, 'u1', false],
  ])('%s', (_name, lock, userId, expected) => {
    const held = lock && lock.session_id === '__tab__' ? { ...lock, session_id: getTabId() } : lock;
    expect(isMyTabLock(held, userId)).toBe(expected);
  });
});

describe('orphaned drafts', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const other = (id, iso, aliveAt) => {
    localStorage.setItem(DRAFT_PREFIX + id, draft(iso));
    if (aliveAt) localStorage.setItem(`walflow_tab_alive_${id}`, String(aliveAt));
  };

  it('does not offer a draft whose tab is still alive, nor this tab\'s own draft', () => {
    writeDraft(draft('2026-10-15T11:59:00Z'));
    other('open', '2026-10-15T11:59:30Z', now - 1000);
    expect(findOrphanDraft(now)).toBeNull();
  });

  it('offers the newest draft of tabs that have gone quiet', () => {
    other('old', '2026-10-14T10:00:00Z', now - ALIVE_WINDOW_MS - 1);
    other('newer', '2026-10-15T09:00:00Z');
    const orphan = findOrphanDraft(now);
    expect(orphan.key).toBe(`${DRAFT_PREFIX}newer`);
  });

  it('offers the single-key draft of earlier versions once', () => {
    localStorage.setItem(LEGACY_DRAFT_KEY, draft('2026-10-10T09:00:00Z'));
    const orphan = findOrphanDraft(now);
    expect(orphan.key).toBe(LEGACY_DRAFT_KEY);
    adoptDraft(orphan);
    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
    expect(readDraft()).toBe(orphan.raw);
    expect(findOrphanDraft(now)).toBeNull();
  });

  it('discarding removes the orphan', () => {
    other('gone', '2026-10-15T09:00:00Z');
    discardOrphan(findOrphanDraft(now));
    expect(findOrphanDraft(now)).toBeNull();
  });

  it('prunes drafts older than a week and stale heartbeats', () => {
    other('ancient', new Date(now - DRAFT_MAX_AGE_MS - 1000).toISOString(), now - DRAFT_MAX_AGE_MS - 1000);
    other('recent', '2026-10-14T09:00:00Z');
    pruneDrafts(now);
    expect(localStorage.getItem(`${DRAFT_PREFIX}ancient`)).toBeNull();
    expect(localStorage.getItem('walflow_tab_alive_ancient')).toBeNull();
    expect(localStorage.getItem(`${DRAFT_PREFIX}recent`)).not.toBeNull();
  });

  it('heartbeat marks the tab alive and clears the mark when stopped', () => {
    const stop = startHeartbeat();
    expect(localStorage.getItem(`walflow_tab_alive_${getTabId()}`)).not.toBeNull();
    stop();
    expect(localStorage.getItem(`walflow_tab_alive_${getTabId()}`)).toBeNull();
  });
});
