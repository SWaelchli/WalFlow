import { describe, it, expect } from 'vitest';
import {
  ASME_SCHEDULE_STANDARD,
  ASME_STAINLESS_SCHEDULE_STANDARD,
  DIN_SCHEDULE_STANDARD,
  getScheduleStandardOptions,
  getScheduleDataset,
  getScheduleBore,
  listSchedules,
  equivalentSchedule,
  scheduleStandardForReducer,
  scheduleLabel,
  classScheduleChoices,
  catalogDns
} from './pipe_schedules';
import { resolveBore, endScheduleStandard, classReducerOptions } from './reducer_catalog';
import { manualSelectionPatch, classSizePatch, schedulePatch, resolvePipeSelection } from './pipeDefaults';

// Catalog rows loaded by src/test/setupCatalogs.js (the backend seed)
const ASME_B36_10M_SCHEDULES = getScheduleDataset(ASME_SCHEDULE_STANDARD);
const ASME_B36_19M_SCHEDULES = getScheduleDataset(ASME_STAINLESS_SCHEDULE_STANDARD);
const DIN_EN_PIPE_SCHEDULES = getScheduleDataset(DIN_SCHEDULE_STANDARD);

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
  it('come only from the catalog API (no bundled copies)', () => {
    expect(getScheduleStandardOptions([])).toEqual([]);
    expect(getScheduleDataset(ASME_SCHEDULE_STANDARD, [])).toEqual([]);
    expect(getScheduleBore(50, 'STD', ASME_SCHEDULE_STANDARD, [])).toBeNull();
    const api = [{ code: DIN_SCHEDULE_STANDARD, name: 'Edited', fitting_type: 'pipe_schedule', dimensions: [] }];
    expect(getScheduleStandardOptions(api)).toEqual([{ code: DIN_SCHEDULE_STANDARD, name: 'Edited', dimensions: [] }]);
    expect(ASME_B36_10M_SCHEDULES.length).toBeGreaterThan(0);
  });

  it('labels schedules as the catalog view does', () => {
    expect(['40', '10S', 'STD', 'XS', 'Normal', 'ISO 1127'].map(scheduleLabel))
      .toEqual(['Sch 40', 'Sch 10S', 'STD', 'XS', 'Normal', 'ISO 1127']);
  });

  it('offers only the class catalogs, grouped per catalog', () => {
    const only19 = classScheduleChoices(50, [ASME_STAINLESS_SCHEDULE_STANDARD]);
    expect(only19.map(g => g.code)).toEqual([ASME_STAINLESS_SCHEDULE_STANDARD]);
    expect(only19[0].schedules).toEqual(['5S', '10S', '40S', '80S']);
    const both = classScheduleChoices(50, [ASME_STAINLESS_SCHEDULE_STANDARD, ASME_SCHEDULE_STANDARD]);
    expect(both.map(g => g.code)).toEqual([ASME_STAINLESS_SCHEDULE_STANDARD, ASME_SCHEDULE_STANDARD]);
    expect(both[1].schedules).toContain('STD');
    expect(classScheduleChoices(600, [ASME_STAINLESS_SCHEDULE_STANDARD])[0].schedules).toEqual(['5S', '10S']);
    expect(catalogDns([DIN_SCHEDULE_STANDARD]).includes(90)).toBe(false);
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

  it('maps between B36.10M and B36.19M walls', () => {
    expect(equivalentSchedule('40S', ASME_SCHEDULE_STANDARD, 50)).toBe('40');
    expect(equivalentSchedule('80S', ASME_SCHEDULE_STANDARD, 50)).toBe('80');
    expect(equivalentSchedule('ISO 1127', ASME_STAINLESS_SCHEDULE_STANDARD, 50)).toBe('10S');
    expect(equivalentSchedule('STD', ASME_STAINLESS_SCHEDULE_STANDARD, 50)).toBe('40S');
    expect(equivalentSchedule('STD', ASME_STAINLESS_SCHEDULE_STANDARD, 400)).toBe('10S'); // no 40S above NPS 12
  });
});

describe('ASME B36.19M stainless schedules', () => {
  it('uses the B36.10M outside diameters and lists S-schedules only', () => {
    ASME_B36_19M_SCHEDULES.forEach(size => {
      const steel = ASME_B36_10M_SCHEDULES.find(s => s.dn === size.dn);
      expect(size.od_mm).toBe(steel.od_mm);
      Object.entries(size.schedules).forEach(([sch, s]) => {
        expect(sch.endsWith('S')).toBe(true);
        expect(s.id_mm).toBeCloseTo(size.od_mm - 2 * s.wt_mm, 6);
      });
    });
    expect(getScheduleBore(50, '10S', ASME_STAINLESS_SCHEDULE_STANDARD)).toMatchObject({ wt_mm: 2.77, id_mm: 54.76 });
    expect(listSchedules(50, ASME_STAINLESS_SCHEDULE_STANDARD)).toEqual(['5S', '10S', '40S', '80S']);
  });

  it('B36.10M lists Sch 10/20/30/60 where the standard has them', () => {
    expect(getScheduleBore(400, '20', ASME_SCHEDULE_STANDARD).wt_mm).toBe(7.92);
    expect(getScheduleBore(400, '30', ASME_SCHEDULE_STANDARD).wt_mm).toBe(9.53);
    expect(getScheduleBore(50, '10S', ASME_SCHEDULE_STANDARD)).toBeNull();
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

  it('a pipe class schedule catalog wins over the reducer standard', () => {
    const dinClass = { code: 'EN01', schedule_standard_codes: [DIN_SCHEDULE_STANDARD], sizes: [] };
    expect(endScheduleStandard(dinClass, 'ASME_B16_9_REDUCERS')).toBe(DIN_SCHEDULE_STANDARD);
    const customClass = { code: 'X', schedule_standard_code: 'CUSTOM', sizes: [] };
    expect(endScheduleStandard(customClass, 'DIN_EN_10253_2_REDUCERS')).toBe(DIN_SCHEDULE_STANDARD);
  });

  it('a reducer end uses the catalog of the class size at that DN', () => {
    const mixed = {
      code: 'DX', schedule_standard_codes: [ASME_STAINLESS_SCHEDULE_STANDARD, ASME_SCHEDULE_STANDARD],
      sizes: [{ dn: 15, catalog: ASME_SCHEDULE_STANDARD, sch: '160' }, { dn: 50, catalog: ASME_STAINLESS_SCHEDULE_STANDARD, sch: '10S' }]
    };
    expect(endScheduleStandard(mixed, 'ASME_B16_9_REDUCERS', undefined, 15)).toBe(ASME_SCHEDULE_STANDARD);
    expect(endScheduleStandard(mixed, 'ASME_B16_9_REDUCERS', undefined, 50)).toBe(ASME_STAINLESS_SCHEDULE_STANDARD);
  });

  it('reducer choices are limited to the class reducer catalogs', () => {
    const din = { reducer_standard_codes: ['DIN_EN_10253_2_REDUCERS'] };
    expect(classReducerOptions(din).map(o => o.code)).toEqual(['DIN_EN_10253_2_REDUCERS']);
    expect(classReducerOptions(null).map(o => o.code)).toEqual(['ASME_B16_9_REDUCERS', 'DIN_EN_10253_2_REDUCERS']);
  });
});

describe('manual pipes with a DIN EN dimension standard', () => {
  it('switching the standard keeps the DN and maps the schedule', () => {
    const patch = manualSelectionPatch(50, 'STD', DIN_SCHEDULE_STANDARD);
    expect(patch).toMatchObject({ schedule_standard_code: DIN_SCHEDULE_STANDARD, standardDn: 50, standardSch: 'Normal', outer_diameter_mm: 60.3, wall_thickness_mm: 2.9 });
    expect(manualSelectionPatch(90, 'STD', DIN_SCHEDULE_STANDARD).standardDn).toBe(80); // DN90 is ASME only
    expect(manualSelectionPatch(50, 'Heavy', ASME_SCHEDULE_STANDARD)).toMatchObject({ schedule_standard_code: ASME_SCHEDULE_STANDARD, standardSch: 'XS' });
  });

  it('a stainless 10S line switched to manual keeps its 10S bore (B36.19M)', () => {
    const ss01 = { id: 'ss', code: 'SS01', sizes: [{ dn: 50, catalog: ASME_STAINLESS_SCHEDULE_STANDARD, sch: '10S', od_mm: 60.3, wt_mm: 2.77 }] };
    const sized = classSizePatch(ss01, 50);
    expect(sized.schedule_standard_code).toBe(ASME_STAINLESS_SCHEDULE_STANDARD);
    const patch = manualSelectionPatch(50, '10S', sized.schedule_standard_code);
    expect(patch).toMatchObject({ schedule_standard_code: ASME_STAINLESS_SCHEDULE_STANDARD, standardDn: 50, standardSch: '10S', wall_thickness_mm: 2.77 });
    expect(patch.diameter_m).toBeCloseTo(0.05476, 6);
  });

  it('manual switch is null when no catalog is loaded', () => {
    expect(manualSelectionPatch(50, 'STD', ASME_SCHEDULE_STANDARD, [])).toBeNull();
  });

  it('schedule changes stay in the pipe standard', () => {
    expect(schedulePatch(100, 'Heavy', DIN_SCHEDULE_STANDARD)).toMatchObject({ standardDn: 100, standardSch: 'Heavy', wall_thickness_mm: 6.3 });
    expect(schedulePatch(90, 'Normal', DIN_SCHEDULE_STANDARD)).toBeNull();
  });

  it('older pipes without a standard read as ASME; DIN pipes match DIN bores', () => {
    expect(resolvePipeSelection({ diameter_m: 0.05248 }).scheduleStandard).toBe(ASME_SCHEDULE_STANDARD);
    const sel = resolvePipeSelection({ pipe_class_id: 'manual', schedule_standard_code: DIN_SCHEDULE_STANDARD, diameter_m: 0.0545 });
    expect(sel).toMatchObject({ dn: 50, sch: 'Normal', isCustomId: false, scheduleStandard: DIN_SCHEDULE_STANDARD });
  });
});
