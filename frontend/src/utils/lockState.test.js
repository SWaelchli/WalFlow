import { describe, it, expect } from 'vitest';
import { describeLockState, lockInitials, formatClockTime } from './lockState';
import { getTabId } from './draftStorage';

const LOCKED_AT = '2026-03-05T09:07:00Z';
const clock = (s) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const HHMM = clock(LOCKED_AT);
const SEP = ' · ';

describe('describeLockState', () => {
  const tab = () => getTabId();
  it.each([
    ['no lock', () => null, 'u1', { kind: 'free', holder: null, initials: '', since: null, label: '' }],
    ['this tab holds it', () => ({ user_id: 'u1', username: 'alice.smith', session_id: tab(), locked_at: LOCKED_AT }), 'u1',
      { kind: 'mine', holder: 'alice.smith', initials: 'AS', since: HHMM, label: 'Editing' }],
    ['same user, other tab', () => ({ user_id: 'u1', username: 'alice.smith', session_id: 'other-tab', locked_at: LOCKED_AT }), 'u1',
      { kind: 'my_other_tab', holder: 'alice.smith', initials: 'AS', since: HHMM, label: `Read-only${SEP}open in another tab of yours` }],
    ['another user', () => ({ user_id: 'u2', username: 'alex', session_id: 'x', locked_at: LOCKED_AT }), 'u1',
      { kind: 'other_user', holder: 'alex', initials: 'AL', since: HHMM, label: `Read-only${SEP}alex is editing since ${HHMM}` }],
    ['not signed in (userId null)', () => ({ user_id: 'u2', username: 'alex', session_id: 'x', locked_at: LOCKED_AT }), null,
      { kind: 'other_user', holder: 'alex', initials: 'AL', since: HHMM, label: `Read-only${SEP}alex is editing since ${HHMM}` }],
    ['another user, no time', () => ({ user_id: 'u2', username: 'alex' }), 'u1',
      { kind: 'other_user', holder: 'alex', initials: 'AL', since: null, label: `Read-only${SEP}alex is editing` }],
    ['another user, unparsable time', () => ({ user_id: 'u2', username: 'alex', locked_at: 'garbage' }), 'u1',
      { kind: 'other_user', holder: 'alex', initials: 'AL', since: null, label: `Read-only${SEP}alex is editing` }],
    ['another user, no name', () => ({ user_id: 'u2', locked_at: LOCKED_AT }), 'u1',
      { kind: 'other_user', holder: null, initials: '?', since: HHMM, label: `Read-only${SEP}Another user is editing since ${HHMM}` }],
  ])('%s', (_name, makeLock, userId, expected) => {
    expect(describeLockState(makeLock(), userId)).toEqual(expected);
  });

  it('since is a local HH:MM clock time', () => {
    expect(HHMM).toMatch(/\d{1,2}[:.]\d{2}/);
  });
});

describe('lockInitials', () => {
  it.each([
    ['alice.smith', 'AS'],
    ['bob', 'BO'],
    ['mary ann lee', 'MA'],
    ['x', 'X'],
    ['', '?'],
    [null, '?'],
    [undefined, '?'],
    ['..', '?'],
  ])('%j -> %s', (name, expected) => {
    expect(lockInitials(name)).toBe(expected);
  });
});

describe('formatClockTime', () => {
  it.each([
    [LOCKED_AT, HHMM],
    [null, null],
    ['garbage', null],
  ])('%j', (input, expected) => {
    expect(formatClockTime(input)).toBe(expected);
  });
});
