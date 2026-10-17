import { describe, it, expect } from 'vitest';
import { manualSelectionPatch, classSelectionPatch, classSizePatch, schedulePatch } from './pipeDefaults';

const pc = {
  id: 'cs1', code: 'CS01', roughness_mm: 0.05,
  sizes: [
    { dn: 50, od_mm: 60.3, wt_mm: 3.91, sch: 'STD' },
    { dn: 80, od_mm: 88.9, wt_mm: 5.49, sch: 'STD' },
  ],
};

describe('pipe selection patches (shared by the inspector and the pipe table)', () => {
  it('class change keeps the current size when the class has it, with the class roughness', () => {
    const patch = classSelectionPatch(pc, 80);
    expect(patch).toMatchObject({ pipe_class_id: 'cs1', pipe_class_code: 'CS01', standardDn: 80, standardSch: 'STD', roughness_mm: 0.05, roughness: 0.00005 });
    expect(patch.diameter).toBeCloseTo((88.9 - 2 * 5.49) / 1000, 9);
    expect(classSelectionPatch(pc, 999).standardDn).toBe(50);       // falls back to the first size
    expect(classSelectionPatch({ ...pc, sizes: [] }, 50)).toBeNull();
    expect(classSelectionPatch(undefined, 50)).toBeNull();
  });

  it('size change only touches the dimensions', () => {
    const patch = classSizePatch(pc, 80);
    expect(Object.keys(patch).sort()).toEqual(['diameter', 'outer_diameter_mm', 'schedule_standard_code', 'standardDn', 'standardSch', 'wall_thickness_mm']);
    expect(classSizePatch(pc, 65)).toBeNull();
  });

  it('manual switch uses the B36.10M table and leaves roughness alone', () => {
    const patch = manualSelectionPatch(50, 'STD');
    expect(patch).toMatchObject({ pipe_class_id: 'manual', pipe_class_code: 'CUSTOM', standardDn: 50, standardSch: 'STD' });
    expect(patch.diameter).toBeCloseTo(0.05248, 4);
    expect('roughness_mm' in patch).toBe(false);
    expect(manualSelectionPatch(undefined, undefined).standardDn).toBe(50);
  });

  it('schedule patch is null for an unknown size', () => {
    expect(schedulePatch(50, '40')).toMatchObject({ standardDn: 50, standardSch: '40' });
    expect(schedulePatch(7, 'STD')).toBeNull();
  });
});
