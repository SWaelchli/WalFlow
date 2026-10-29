import { describe, it, expect } from 'vitest';
import { parseServerTime } from './serverTime';

const base = Date.UTC(2026, 9, 29, 10);

describe('parseServerTime', () => {
  it.each([
    ['no zone suffix is read as UTC', '2026-10-29T10:00:00', base],
    ['microsecond fraction keeps milliseconds', '2026-10-29T10:00:00.123456', base + 123],
    ['Z suffix', '2026-10-29T10:00:00Z', base],
    ['positive offset', '2026-10-29T11:00:00+01:00', base],
  ])('%s', (_name, input, expected) => {
    const parsed = parseServerTime(input);
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getTime()).toBe(expected);
  });

  it.each([[null], ['']])('empty input %j gives null', (input) => {
    expect(parseServerTime(input)).toBeNull();
  });
});
