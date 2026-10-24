// React Flow keeps the object of every node and pipe that did not change. Mapping the whole list into
// new objects on each drag frame makes every node re-render; this reuses the previous output of an item as
// long as the item and the shared inputs (`deps`) are the same objects/values.

const sameDeps = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * @param items  array of items with an `id`
 * @param cache  a Map kept between calls (one per list)
 * @param deps   array of shared inputs that the output depends on (compared with Object.is)
 * @param build  (item) => output; called only for new or changed items
 * @returns the outputs in item order; unchanged items return the same object as last time
 */
export function mapCached(items, cache, deps, build) {
  const seen = new Set();
  const out = items.map((item) => {
    seen.add(item.id);
    const hit = cache.get(item.id);
    if (hit && hit.item === item && sameDeps(hit.deps, deps)) return hit.out;
    const value = build(item);
    cache.set(item.id, { item, deps, out: value });
    return value;
  });
  if (cache.size > seen.size) {
    for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id);
  }
  return out;
}
