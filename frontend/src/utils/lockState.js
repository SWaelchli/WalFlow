import { isMyTabLock } from './draftStorage';
import { parseServerTime } from './serverTime';

/** Up to two capital letters from a user name ("alice.smith" -> "AS"); "?" when there is no name. */
export function lockInitials(name) {
  const parts = String(name || '').split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

/** Local "HH:MM" of a server time string, or null when it is missing or invalid. */
export function formatClockTime(serverTime) {
  const d = parseServerTime(serverTime);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Who holds the edit lock of a drawing, seen from this user and this tab.
 * kind: 'free' | 'mine' (this tab) | 'my_other_tab' (same user, another tab) | 'other_user'.
 * Returns { kind, holder, initials, since, label }; holder is the lock's username (null when free),
 * initials come from it, since is the local "HH:MM" of lock.locked_at (null when unknown), and label is the
 * full sentence: '' | 'Editing' | 'Read-only · open in another tab of yours' |
 * 'Read-only · {holder} is editing since {since}' (without " since ..." when since is null).
 */
export function describeLockState(lock, userId) {
  if (!lock) return { kind: 'free', holder: null, initials: '', since: null, label: '' };
  const holder = lock.username || null;
  const initials = lockInitials(holder);
  const since = formatClockTime(lock.locked_at);
  if (isMyTabLock(lock, userId)) return { kind: 'mine', holder, initials, since, label: 'Editing' };
  if (userId && lock.user_id === userId) {
    return { kind: 'my_other_tab', holder, initials, since, label: 'Read-only · open in another tab of yours' };
  }
  const who = holder || 'Another user';
  return { kind: 'other_user', holder, initials, since, label: `Read-only · ${who} is editing${since ? ` since ${since}` : ''}` };
}
