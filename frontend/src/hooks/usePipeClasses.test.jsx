import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePipeClasses from './usePipeClasses';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [{ id: 1, code: 'C1' }, { id: 2, code: 'C2' }] })) } }));

describe('usePipeClasses projectRulesLoaded', () => {
  it.each([
    ['no project', null, true],
    ['all allowed (null)', { id: 'p', allowed_pipe_classes: null }, true],
    ['none allowed ([])', { id: 'p', allowed_pipe_classes: [] }, true],
    ['a list', { id: 'p', allowed_pipe_classes: [1] }, true],
    ['details not loaded (undefined)', { id: 'p', title: 'P' }, false],
  ])('%s', async (_n, project, expected) => {
    const { result } = renderHook(() => usePipeClasses(project));
    await act(async () => {});
    expect(result.current.projectRulesLoaded).toBe(expected);
  });
});
