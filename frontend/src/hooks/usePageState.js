import { useEffect, useRef, useState } from 'react';

/**
 * A page reports its live state to the menu bar and the keyboard shortcuts (`ctx.pageState` in App.jsx) without
 * lifting its state.
 *   register   `ctx.registerPageState`
 *   data       plain values (what enables, hides or labels menu items); `null` registers nothing
 *   handlers   the page's functions, named once; a new set every render is fine
 * The menu bar reads `{ ...data, actions }`. `actions` holds one stable callback per handler name that always calls
 * the latest handler, so the state only changes when `data` does. When the page (or the tab that registered)
 * unmounts, its state is cleared, so a tab that mounts next never sees the previous tab's state.
 */
export default function usePageState(register, data, handlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; });
  const [owner] = useState(() => ({}));
  const [actions] = useState(() => Object.fromEntries(
    Object.keys(handlers).map((name) => [name, (...args) => handlersRef.current[name]?.(...args)]),
  ));

  const dataKey = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (!register) return;
    register(owner, dataKey === null ? null : { ...JSON.parse(dataKey), actions });
  }, [register, owner, actions, dataKey]);
  useEffect(() => () => register?.(owner, null), [register, owner]);
}
