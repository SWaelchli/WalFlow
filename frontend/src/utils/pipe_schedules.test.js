import { describe, it, expect } from 'vitest';
import { ASME_B36_10M_SCHEDULES } from '../constants/asme_b16_9_data';
import { DIN_EN_PIPE_SCHEDULES } from '../constants/din_en_pipe_data';
import {
  ASME_SCHEDULE_STANDARD,
  DIN_SCHEDULE_STANDARD,
  getScheduleStandardOptions,
  getScheduleBore,
  listSchedules,
  equivalentSchedule,
  scheduleStandardForReducer
} from './pipe_schedules';
import { resolveBore, endScheduleStandard } from './reducer_catalog';
import { manualSelectionPatch, schedulePatch, resolvePipeSelection } from './pipeDefaults';

describe('listSchedules', () => {
  it('returns only schedules the catalogue has for the size, in usual order', () => {
    ASME_B36_10M_SCHEDULES.forEach((size) => {
      const list = listSchedules(size.dn, ASME_SCHEDULE_STANDARD);
      list.forEach((sch) => expect(size.schedules[sch]).toBeDefined());
      expect(list.length).toBe(Object.keys(size.schedules).length);
      if (list.includes('STD')) expect(list[0]).toBe('STD');
    });
    expect(listSchedules(50, DIN_SCHEDULE_STANDARD)).toEqual(['Normal', 'Heavy', 'ISO 1127']);
  });
  it('is empty for an unknown size', () => {
    expect(listSchedules(7, ASME_SCHEDULE_STANDARD)).toEqual([]);
  });
});

describe('schedule standards', () => {
  it('bundles ASME and DIN EN and prefers API data for the same code', () => {
    expect(getScheduleStandardOptions([]).map(o => o.code)).toEqual([ASME_SCHEDULE_STANDARD, DIN_SCHEDULE_STANDARD]);
    const api = [{ code: DIN_SCHEDULE_STANDARD, name: 'Edited', fitting_type: 'pipe_schedule', dimensions: [] }];
    expect(getScheduleStandardOptions(api).find(o => o.code === DIN_SCHEDULE_STANDARD).name).toBe('Edited');
  });

  it('looks up DIN EN bores exactly (EN 10220 outside diameters)', () => {
    const bore = getScheduleBore(65, 'Normal', DIN_SCHEDULE_STANDARD);
    expect(bore).toMatchObject({ dn: 65, od_mm: 76.1, wt_mm: 2.9, standard: DIN_SCHEDULE_STANDARD });
    expect(bore.id_mm).toBeCloseTo(70.3, 6);
    expect(getScheduleBore(65, 'STD', DIN_SCHEDULE_STANDARD)).toBeNull();
    DIN_EN_PIPE_SCHEDULES.forEach(size => {
      Object.values(size.schedules).forEach(s => expect(s.id_mm).toBeCloseTo(size.od_mm - 2 * s.wt_mm, 6));
    });
  });

  it('maps schedules to their counterpart in the other standard', () => {
    expect(equivalentSchedule('STD', DIN_SCHEDULE_STANDARD, 50)).toBe('Normal');
    expect(equivalentSchedule('XS', DIN_SCHEDULE_STANDARD, 50)).toBe('Heavy');
    expect(equivalentSchedule('10S', DIN_SCHEDULE_STANDARD, 50)).toBe('ISO 1127');
    expect(equivalentSchedule('Heavy', ASME_SCHEDULE_STANDARD, 50)).toBe('XS');
    expect(equivalentSchedule('ISO 1127', ASME_SCHEDULE_STANDARD, 50)).toBe('STD');
    expect(equivalentSchedule('80', ASME_SCHEDULE_STANDARD, 50)).toBe('80');
    expect(equivalentSchedule('STD', DIN_SCHEDULE_STANDARD, 7)).toBeNull();
  });
});

describe('reducer bores', () => {
  it('DIN EN reducers without a pipe class use DIN EN pipe dimensions', () => {
    expect(scheduleStandardForReducer('DIN_EN_10253_2_REDUCERS')).toBe(DIN_SCHEDULE_STANDARD);
    expect(scheduleStandardForReducer('DIN_EN_10253_2')).toBe(DIN_SCHEDULE_STANDARD); // legacy code
    expect(endScheduleStandard(null, 'DIN_EN_10253_2_REDUCERS')).toBe(DIN_SCHEDULE_STANDARD);
    expect(endScheduleStandard(null, 'ASME_B16_9_REDUCERS')).toBe(ASME_SCHEDULE_STANDARD);
    expect(resolveBore(65, 'Normal', null, DIN_SCHEDULE_STANDARD).od_mm).toBe(76.1);
  });

  it('a pipe class schedule standard wins over the reducer standard', () => {
    const dinClass = { code: 'EN01', schedule_standard_code: DIN_SCHEDULE_STANDARD, sizes: [] };
    expect(endScheduleStandard(dinClass, 'ASME_B16_9_REDUCERS')).toBe(DIN_SCHEDULE_STANDARD);
    const customClass = { code: 'X', schedule_standard_code: 'CUSTOM', sizes: [] };
    expect(endScheduleStandard(customClass, 'DIN_EN_10253_2_REDUCERS')).toBe(DIN_SCHEDULE_STANDARD);
  });
});

describe('manual pipes with a DIN EN dimension standard', () => {
  it('switching the standard keeps the DN and maps the schedule', () => {
    const patch = manualSelectionPatch(50, 'STD', DIN_SCHEDULE_STANDARD);
    expect(patch).toMatchObject({ schedule_standard_code: DIN_SCHEDULE_STANDARD, standardDn: 50, standardSch: 'Normal', outer_diameter_mm: 60.3, wall_thickness_mm: 2.9 });
    expect(manualSelectionPatch(90, 'STD', DIN_SCHEDULE_STANDARD).standardDn).toBe(80); // DN90 is ASME only
    expect(manualSelectionPatch(50, 'Heavy', ASME_SCHEDULE_STANDARD)).toMatchObject({ schedule_standard_code: ASME_SCHEDULE_STANDARD, standardSch: 'XS' });
  });

  it('schedule changes stay in the pipe standard', () => {
    expect(schedulePatch(100, 'Heavy', DIN_SCHEDULE_STANDARD)).toMatchObject({ standardDn: 100, standardSch: 'Heavy', wall_thickness_mm: 6.3 });
    expect(schedulePatch(90, 'Normal', DIN_SCHEDULE_STANDARD)).toBeNull();
  });

  it('older pipes without a standard read as ASME; DIN pipes match DIN bores', () => {
    expect(resolvePipeSelection({ diameter: 0.05248 }).scheduleStandard).toBe(ASME_SCHEDULE_STANDARD);
    const sel = resolvePipeSelection({ pipe_class_id: 'manual', schedule_standard_code: DIN_SCHEDULE_STANDARD, diameter: 0.0545 });
    expect(sel).toMatchObject({ dn: 50, sch: 'Normal', isCustomId: false, scheduleStandard: DIN_SCHEDULE_STANDARD });
  });
});
