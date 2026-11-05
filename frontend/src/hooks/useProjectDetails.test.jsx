import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useState } from 'react';
import axios from 'axios';
import useProjectDetails from './useProjectDetails';

vi.mock('axios', () => {
  const api = { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() };
  return { default: api, ...api };
});

const USER = { id: 'u1', username: 'me' };
const MEMBERS = [{ user_id: 'u1', role: 'owner' }];
const detail = (id, allowed) => ({ id, title: `T${id}`, description: '', allowed_pipe_classes: allowed, allow_custom_pipes: true, members: MEMBERS });
const draft = (id) => ({ id, title: `T${id}` }); // what the draft restore sets: details missing
const complete = (id, allowed) => ({ ...detail(id, allowed) });

// A GET that stays pending until the test settles it
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const harness = (initial, user = USER) => renderHook(({ currentUser }) => {
  const [activeProject, setActiveProject] = useState(initial);
  const { projectDetailsFailed } = useProjectDetails({ activeProject, setActiveProject, currentUser });
  return { activeProject, setActiveProject, projectDetailsFailed };
}, { initialProps: { currentUser: user } });

beforeEach(() => {
  axios.get.mockReset();
});

describe('useProjectDetails', () => {
  it('waits for a signed-in user, then fetches the missing details once', async () => {
    axios.get.mockResolvedValue({ data: detail('p1', [1]) });
    const { result, rerender } = harness(draft('p1'), null);
    await act(async () => {});
    expect(axios.get).not.toHaveBeenCalled();
    rerender({ currentUser: USER });
    await waitFor(() => expect(result.current.activeProject.members).toEqual(MEMBERS));
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith('/api/projects/p1');
    expect(result.current.activeProject.allowed_pipe_classes).toEqual([1]);
  });

  it('does not fetch when the active project already has its members', async () => {
    harness(complete('p1', [1]));
    await act(async () => {});
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('a late response does not overwrite newer complete details for the same project', async () => {
    const d = deferred();
    axios.get.mockReturnValue(d.promise);
    const { result } = harness(draft('p1'));
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
    act(() => result.current.setActiveProject(complete('p1', [1, 2, 3])));
    await act(async () => { d.resolve({ data: detail('p1', [1]) }); });
    expect(result.current.activeProject.allowed_pipe_classes).toEqual([1, 2, 3]);
  });

  it.each([
    ['another project', complete('p2', [2]), complete('p2', [2])],
    ['no project', null, null],
  ])('a late response for the replaced project is ignored when switching to %s', async (_n, next, expected) => {
    const d = deferred();
    axios.get.mockReturnValue(d.promise);
    const { result } = harness(draft('p1'));
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
    act(() => result.current.setActiveProject(next));
    await act(async () => { d.resolve({ data: detail('p1', [1]) }); });
    expect(result.current.activeProject).toEqual(expected);
  });

  it('after a switch, the new project with missing details is fetched', async () => {
    const d = deferred();
    axios.get.mockReturnValueOnce(d.promise).mockResolvedValueOnce({ data: detail('p2', [2]) });
    const { result } = harness(draft('p1'));
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
    act(() => result.current.setActiveProject(draft('p2')));
    await waitFor(() => expect(result.current.activeProject.members).toEqual(MEMBERS));
    expect(axios.get).toHaveBeenLastCalledWith('/api/projects/p2');
    await act(async () => { d.resolve({ data: detail('p1', [1]) }); });
    expect(result.current.activeProject.id).toBe('p2');
    expect(result.current.activeProject.allowed_pipe_classes).toEqual([2]);
  });

  it('a failed fetch is reported once, not retried in a loop, and keeps the project', async () => {
    axios.get.mockRejectedValue({ response: { status: 500 } });
    const { result } = harness(draft('p1'));
    await waitFor(() => expect(result.current.projectDetailsFailed).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(result.current.activeProject).toEqual(draft('p1'));
  });

  it('fetches again after a new sign-in and clears the failure on success', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: detail('p1', [1]) });
    const { result, rerender } = harness(draft('p1'));
    await waitFor(() => expect(result.current.projectDetailsFailed).toBe(true));
    rerender({ currentUser: null });
    rerender({ currentUser: USER });
    await waitFor(() => expect(result.current.activeProject.members).toEqual(MEMBERS));
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(result.current.projectDetailsFailed).toBe(false);
  });

  it('the failure belongs to the project that failed, not to another one', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 500 } }).mockReturnValue(new Promise(() => {}));
    const { result } = harness(draft('p1'));
    await waitFor(() => expect(result.current.projectDetailsFailed).toBe(true));
    act(() => result.current.setActiveProject(draft('p2')));
    expect(result.current.projectDetailsFailed).toBe(false);
  });
});
