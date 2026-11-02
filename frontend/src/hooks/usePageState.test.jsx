import React, { useState, useCallback } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import usePageState from './usePageState';

afterEach(cleanup);

// The same registration rule as App.jsx: the latest registration wins; clearing only works for its own owner
function Shell({ children, onState }) {
  const [registration, setRegistration] = useState(null);
  const register = useCallback((owner, state) => {
    setRegistration((prev) => {
      if (state) return { owner, state };
      return prev?.owner === owner ? null : prev;
    });
  }, []);
  onState(registration?.state ?? null);
  return children(register);
}

function Tab({ register, name, handlers }) {
  usePageState(register, { name }, handlers);
  return <span>{name}</span>;
}

describe('usePageState', () => {
  it('reports the data with one stable action per handler that always calls the latest handler', () => {
    const seen = [];
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Shell onState={(s) => seen.push(s)}>{(register) => <Tab register={register} name="a" handlers={{ save: first }} />}</Shell>,
    );
    const state = seen.at(-1);
    expect(state).toMatchObject({ name: 'a' });
    const { save } = state.actions;

    rerender(
      <Shell onState={(s) => seen.push(s)}>{(register) => <Tab register={register} name="a" handlers={{ save: second }} />}</Shell>,
    );
    // Same data: the reported state object is not replaced, so the menu bar does not re-render for nothing
    expect(seen.at(-1)).toBe(state);
    expect(seen.at(-1).actions.save).toBe(save);
    save(1, 2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(1, 2);
  });

  it('a change of data registers a new state with the same actions', () => {
    const seen = [];
    const handlers = { save: vi.fn() };
    const { rerender } = render(<Shell onState={(s) => seen.push(s)}>{(r) => <Tab register={r} name="a" handlers={handlers} />}</Shell>);
    const before = seen.at(-1);
    rerender(<Shell onState={(s) => seen.push(s)}>{(r) => <Tab register={r} name="b" handlers={handlers} />}</Shell>);
    expect(seen.at(-1)).toMatchObject({ name: 'b' });
    expect(seen.at(-1).actions).toBe(before.actions);
  });

  it('clears its state when the page unmounts', () => {
    const seen = [];
    function Page() {
      const [open, setOpen] = useState(true);
      return (
        <Shell onState={(s) => seen.push(s)}>
          {(register) => (<>{open && <Tab register={register} name="a" handlers={{}} />}<button onClick={() => setOpen(false)}>close</button></>)}
        </Shell>
      );
    }
    render(<Page />);
    expect(seen.at(-1)).toMatchObject({ name: 'a' });
    fireEvent.click(screen.getByText('close'));
    expect(seen.at(-1)).toBeNull();
  });

  it('data null registers nothing, and no register function is tolerated', () => {
    const seen = [];
    function Silent({ register }) { usePageState(register, null, {}); return null; }
    render(<Shell onState={(s) => seen.push(s)}>{(r) => <Silent register={r} />}</Shell>);
    expect(seen.every((s) => s === null)).toBe(true);
    function NoRegister() { usePageState(undefined, { a: 1 }, {}); return null; }
    expect(() => render(<NoRegister />)).not.toThrow();
  });

  it('each mount owns its registration, so an old tab clearing late cannot clear the next tab', () => {
    const register = vi.fn();
    const a = render(<Tab register={register} name="a" handlers={{}} />);
    const b = render(<Tab register={register} name="b" handlers={{}} />);
    const ownerA = register.mock.calls.find(([, s]) => s?.name === 'a')[0];
    const ownerB = register.mock.calls.find(([, s]) => s?.name === 'b')[0];
    expect(ownerA).not.toBe(ownerB);
    a.unmount();
    expect(register).toHaveBeenLastCalledWith(ownerA, null);
    expect(register.mock.calls.filter(([o, s]) => o === ownerB && s === null)).toHaveLength(0);
    b.unmount();
    expect(register).toHaveBeenLastCalledWith(ownerB, null);
  });

  it('with the registration rule of the app, the late clear of the old tab leaves the new tab state in place', () => {
    const seen = [];
    let registerFn;
    render(<Shell onState={(s) => seen.push(s)}>{(register) => { registerFn = register; return null; }}</Shell>);
    const a = render(<Tab register={registerFn} name="a" handlers={{}} />);
    render(<Tab register={registerFn} name="b" handlers={{}} />);
    a.unmount();
    expect(seen.at(-1)).toMatchObject({ name: 'b' });
  });
});
