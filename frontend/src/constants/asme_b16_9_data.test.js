import { describe, it, expect } from 'vitest';
import { ASME_B36_10M_SCHEDULES, getAvailableSchedules } from './asme_b16_9_data';

describe('getAvailableSchedules', () => {
  it('returns only schedules the catalogue has for the size, in usual order', () => {
    ASME_B36_10M_SCHEDULES.forEach((size) => {
      const list = getAvailableSchedules(size.dn);
      expect(list.length).toBeGreaterThan(0);
      list.forEach((sch) => expect(size.schedules[sch]).toBeDefined());
      expect(list.length).toBe(Object.keys(size.schedules).length);
      if (list.includes('STD')) expect(list[0]).toBe('STD');
    });
  });
  it('is empty for an unknown size', () => {
    expect(getAvailableSchedules(7)).toEqual([]);
  });
});
