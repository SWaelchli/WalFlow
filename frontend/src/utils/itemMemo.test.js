import { describe, it, expect, vi } from 'vitest';
import { mapCached } from './itemMemo';

describe('mapCached', () => {
  const a = { id: 'a', v: 1 };
  const b = { id: 'b', v: 2 };

  it('rebuilds only the item that changed (a drag frame)', () => {
    const cache = new Map();
    const build = vi.fn((item) => ({ ...item, built: true }));
    const first = mapCached([a, b], cache, [1], build);
    expect(build).toHaveBeenCalledTimes(2);

    const moved = { ...a, v: 99 };
    const second = mapCached([moved, b], cache, [1], build);
    expect(build).toHaveBeenCalledTimes(3);
    expect(second[1]).toBe(first[1]);        // untouched item keeps its object
    expect(second[0]).not.toBe(first[0]);
  });

  it('rebuilds everything when a shared input changes', () => {
    const cache = new Map();
    const build = vi.fn((item) => ({ ...item }));
    mapCached([a, b], cache, ['case1'], build);
    mapCached([a, b], cache, ['case2'], build);
    expect(build).toHaveBeenCalledTimes(4);
  });

  it('forgets removed items', () => {
    const cache = new Map();
    mapCached([a, b], cache, [], (i) => i);
    mapCached([a], cache, [], (i) => i);
    expect([...cache.keys()]).toEqual(['a']);
  });
});
