import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useCanvasHistory } from './useCanvasHistory';

const node = (id, x = 0) => ({ id, type: 'tank', position: { x, y: 0 }, data: { label: id } });

function setup({ isReadOnly = false } = {}) {
  return renderHook(({ readOnly }) => {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const history = useCanvasHistory({
      nodes, edges, setNodes, setEdges,
      setSelectedNode: vi.fn(), setSelectedEdge: vi.fn(),
      handleRotation: vi.fn(), handleValveChange: vi.fn(),
      isReadOnly: readOnly,
    });
    return { nodes, setNodes, setEdges, ...history };
  }, { initialProps: { readOnly: isReadOnly } });
}

// Simulates loadData: set the loaded state and start a new history with it
const load = (result, nodes) => act(() => {
  result.current.setNodes(nodes);
  result.current.setEdges([]);
  result.current.resetHistory(nodes, []);
});

describe('F2-03: undo history', () => {
  it('undo right after loading a diagram does nothing', () => {
    const { result } = setup();
    load(result, [node('a1')]);
    act(() => { result.current.setNodes([node('a1', 100)]); result.current.requestSnapshot(); });

    load(result, [node('b1')]);
    act(() => result.current.undo());
    expect(result.current.nodes.map(n => n.id)).toEqual(['b1']);
  });

  it('the first change after loading can be undone and redone', () => {
    const { result } = setup();
    load(result, [node('b1')]);
    act(() => { result.current.setNodes([node('b1'), node('b2')]); result.current.requestSnapshot(); });

    act(() => result.current.undo());
    expect(result.current.nodes.map(n => n.id)).toEqual(['b1']);
    act(() => result.current.redo());
    expect(result.current.nodes.map(n => n.id)).toEqual(['b1', 'b2']);
  });

  it('records the state after the change was applied (e.g. rotation)', () => {
    const { result } = setup();
    load(result, [node('p1')]);
    act(() => {
      result.current.setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, rotation: 90 } })));
      result.current.requestSnapshot();
    });
    act(() => { result.current.setNodes(nds => nds.map(n => ({ ...n, position: { x: 50, y: 0 } }))); result.current.requestSnapshot(); });

    act(() => result.current.undo());
    expect(result.current.nodes[0].data.rotation).toBe(90);
    expect(result.current.nodes[0].position.x).toBe(0);
  });

  it('undo and redo do nothing on a read-only diagram', () => {
    const { result, rerender } = setup();
    load(result, [node('c1')]);
    act(() => { result.current.setNodes([node('c1'), node('c2')]); result.current.requestSnapshot(); });

    rerender({ readOnly: true });
    act(() => result.current.undo());
    expect(result.current.nodes.map(n => n.id)).toEqual(['c1', 'c2']);
  });
});
