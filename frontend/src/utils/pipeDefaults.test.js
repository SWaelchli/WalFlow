import { describe, it, expect } from 'vitest';
import { getDefaultPipeData, resolvePipeSelection, findPipeClass, matchScheduleByInnerDiameter } from './pipeDefaults';

const CS01 = {
  id: 'pc-cs01', code: 'CS01', roughness_mm: 0.046,
  sizes: [
    { dn: 25, nps: '1', od_mm: 33.4, wt_mm: 3.38, sch: '80' },
    { dn: 50, nps: '2', od_mm: 60.3, wt_mm: 3.91, sch: 'STD' },
  ],
};
const NO_DN50 = {
  id: 'pc-lt01', code: 'LT01', roughness_mm: 0.015,
  sizes: [
    { dn: 40, nps: '1 1/2', od_mm: 48.3, wt_mm: 3.68, sch: 'STD' },
    { dn: 80, nps: '3', od_mm: 88.9, wt_mm: 5.49, sch: 'STD' },
  ],
};

describe('F3-02: default pipe for new connections is DN50 STD', () => {
  it('uses manual ASME B36.10M DN50 STD when no pipe class is available', () => {
    const d = getDefaultPipeData([], true);
    expect(d).toMatchObject({ pipe_class_id: 'manual', standardDn: 50, standardSch: 'STD', outer_diameter_mm: 60.3, wall_thickness_mm: 3.91 });
    expect(d.diameter).toBeCloseTo(0.05248, 6);
    expect(d.roughness_mm).toBe(0.045);
  });

  it('uses the first pipe class when it lists DN50', () => {
    const d = getDefaultPipeData([CS01, NO_DN50], true);
    expect(d).toMatchObject({ pipe_class_id: 'pc-cs01', pipe_class_code: 'CS01', standardDn: 50, roughness_mm: 0.046 });
    expect(d.diameter).toBeCloseTo((60.3 - 2 * 3.91) / 1000, 9);
  });

  it('falls back to manual DN50 STD when the first class has no DN50', () => {
    expect(getDefaultPipeData([NO_DN50, CS01], true)).toMatchObject({ pipe_class_id: 'manual', standardDn: 50 });
  });

  it('uses the nearest size of the first class when custom pipes are not allowed', () => {
    const d = getDefaultPipeData([NO_DN50], false);
    expect(d).toMatchObject({ pipe_class_id: 'pc-lt01', standardDn: 40 });
  });
});

describe('F3-02: display of pipes without catalog references', () => {
  it('shows an older pipe with a standard bore as Manual with its matching DN', () => {
    expect(resolvePipeSelection({ diameter: 0.05248 })).toEqual({ classId: 'manual', dn: 50, sch: 'STD', isCustomId: false, scheduleStandard: 'ASME_B36_10M_SCHEDULES' });
  });

  it('shows a non-standard bore as a custom inner diameter', () => {
    const sel = resolvePipeSelection({ diameter: 0.1 });
    expect(sel.classId).toBe('manual');
    expect(sel.isCustomId).toBe(true);
    expect(sel.sch).toBeNull();
    expect(matchScheduleByInnerDiameter(0.1)).toBeNull();
  });

  it('keeps stored class and size references', () => {
    expect(resolvePipeSelection({ pipe_class_id: 'pc-cs01', standardDn: 25, standardSch: '80', diameter: 0.02664 }))
      .toEqual({ classId: 'pc-cs01', dn: 25, sch: '80', isCustomId: false, scheduleStandard: 'ASME_B36_10M_SCHEDULES' });
  });
});

describe('findPipeClass', () => {
  const classes = [{ id: 'walflow-cs01', code: 'CS01' }, { id: 'walflow-ss01', code: 'SS01' }];

  it('matches by id, then by code (older files stored the code)', () => {
    expect(findPipeClass(classes, 'walflow-ss01')).toBe(classes[1]);
    expect(findPipeClass(classes, 'CS01')).toBe(classes[0]);
  });

  it('returns null for manual, missing and unknown references', () => {
    expect(findPipeClass(classes, 'manual')).toBeNull();
    expect(findPipeClass(classes, undefined)).toBeNull();
    expect(findPipeClass(classes, 'XX99')).toBeNull();
    expect(findPipeClass(undefined, 'CS01')).toBeNull();
  });
});
