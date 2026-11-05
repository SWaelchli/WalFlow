import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import Sidebar from './Sidebar';
import { UnitProvider } from '../../context/UnitContext';

vi.mock('axios', () => {
  const api = { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() };
  return { default: api, ...api };
});

beforeEach(() => {
  axios.get.mockReset();
  axios.put.mockReset();
  axios.get.mockImplementation((url) => (url === '/api/pipe-classes'
    ? Promise.resolve({ data: CLASSES })
    : Promise.reject({ response: { status: 404 } })));
  axios.put.mockImplementation((url, body) => Promise.resolve({ data: body }));
});
afterEach(cleanup);

const CLASSES = [1, 2, 3].map((id) => ({ id, code: `C${id}`, name: `Class ${id}`, rating_class: 'R', material_grade: 'M', roughness_mm: 0.05 }));

const sidebar = (settingsRequest, activeTab = 'settings') => (
  <UnitProvider>
    <Sidebar globalSettings={{}} userSettings={{ solver: {} }} templates={{ Demo: { nodes: [], edges: [] } }} onLoad={() => {}} settingsRequest={settingsRequest} activeTab={activeTab} />
  </UnitProvider>
);
const globalOnly = () => screen.queryByText('Unit System');

describe('Sidebar settings request', () => {
  it('ignores the initial value', () => {
    render(sidebar({ n: 1, tab: 'global' }));
    expect(globalOnly()).toBeNull();
  });

  it('a new request switches the Settings tab', () => {
    const { rerender } = render(sidebar(null));
    expect(globalOnly()).toBeNull();
    rerender(sidebar({ n: 1, tab: 'global' }));
    expect(globalOnly()).toBeTruthy();
  });
});

describe('Sidebar examples pane', () => {
  it('lists the examples as buttons', () => {
    render(sidebar(null, 'examples'));
    expect(screen.getByRole('button', { name: /Demo/ })).toBeTruthy();
  });
});

describe('Sidebar project pipe classes', () => {
  const ME = { id: 'u1', username: 'me' };
  const OWNER = [{ user_id: 'u1', role: 'owner' }];
  const MEMBER = [{ user_id: 'u1', role: 'member' }];
  const project = (extra) => ({ id: 'p1', title: 'P', description: '', allow_custom_pipes: true, ...extra });
  const HINT = 'Only project owners can change the project solver settings.';
  const openProjectPane = async (activeProject, props = {}) => {
    render(
      <UnitProvider>
        <Sidebar globalSettings={{}} userSettings={{ solver: {} }} templates={{}} onLoad={() => {}} activeTab="settings"
          currentUser={ME} activeProject={activeProject} setActiveProject={() => {}} {...props} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    await screen.findByText('[C1]');
    return [1, 2, 3].map((n) => screen.getByText(`[C${n}]`).closest('label').querySelector('input'));
  };

  it.each([
    ['saved list', [1, 2], [2]],
    ['all allowed (null)', null, [2, 3]],
  ])('an owner unticking a class sends the next list computed from the %s', async (_name, saved, expected) => {
    const boxes = await openProjectPane(project({ members: OWNER, allowed_pipe_classes: saved }));
    fireEvent.click(boxes[0]);
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put).toHaveBeenCalledWith('/api/projects/p1', { allowed_pipe_classes: expected });
  });

  it.each([
    ['project details not loaded yet (list undefined)', { members: OWNER }],
    ['the user is a plain member', { members: MEMBER, allowed_pipe_classes: [1, 2] }],
    ['the members are not known', { allowed_pipe_classes: [1, 2] }],
  ])('the controls are read-only and send nothing when %s', async (_name, extra) => {
    const boxes = await openProjectPane(project(extra));
    boxes.forEach((b) => expect(b.disabled).toBe(true));
    expect(screen.getByRole('button', { name: 'Yes' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'No' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'None' })).toBeNull();
    // element.click() honours `disabled` like a real click; fireEvent would dispatch past it
    boxes[0].click();
    screen.getByRole('button', { name: 'No' }).click();
    expect(screen.queryByText(/All pipe classes are active/)).toBeNull();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('a failed details load says so instead of "Loading", and stays read-only', async () => {
    const boxes = await openProjectPane(project({}), { projectDetailsFailed: true });
    expect(screen.getByText("Could not load this project's settings.")).toBeTruthy();
    expect(screen.queryByText(/Loading project pipe classes/)).toBeNull();
    boxes.forEach((b) => expect(b.disabled).toBe(true));
    boxes[0].click();
    screen.getByRole('button', { name: 'No' }).click();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('a failed details load offers Retry, which calls back once and sends nothing; no Retry otherwise', async () => {
    const onRetryProjectDetails = vi.fn();
    await openProjectPane(project({}), { projectDetailsFailed: true, onRetryProjectDetails });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryProjectDetails).toHaveBeenCalledTimes(1);
    expect(axios.put).not.toHaveBeenCalled();
    cleanup();
    await openProjectPane(project({ members: OWNER, allowed_pipe_classes: null }), { projectDetailsFailed: false, onRetryProjectDetails });
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  const hintShown = () => screen.queryByText(HINT) || document.querySelector(`[title="${HINT}"]`);

  it.each([[false], [true]])('no owner-only hint while details are missing (failed=%s)', async (failed) => {
    await openProjectPane(project({}), { projectDetailsFailed: failed });
    expect(hintShown()).toBeNull();
  });

  it('a loaded plain member still gets the owner-only hint', async () => {
    await openProjectPane(project({ members: MEMBER, allowed_pipe_classes: [1, 2] }));
    expect(hintShown()).toBeTruthy();
  });

  it.each([
    ['toggling a class', (boxes) => fireEvent.click(boxes[0]), 'allowed_pipe_classes', [2]],
    ['Set All', () => fireEvent.click(screen.getByRole('button', { name: 'All' })), 'allowed_pipe_classes', null],
    ['Set None', () => fireEvent.click(screen.getByRole('button', { name: 'None' })), 'allowed_pipe_classes', []],
    ['custom dimensions', () => fireEvent.click(screen.getByRole('button', { name: 'No' })), 'allow_custom_pipes', false],
  ])('a save response after %s only updates the project that is still active', async (_n, act, key, value) => {
    const setActiveProject = vi.fn();
    const mine = project({ members: OWNER, allowed_pipe_classes: [1, 2] });
    const boxes = await openProjectPane(mine, { setActiveProject });
    act(boxes);
    await waitFor(() => expect(setActiveProject).toHaveBeenCalledTimes(1));
    const updater = setActiveProject.mock.calls[0][0];
    const other = project({ id: 'p2', members: OWNER, allowed_pipe_classes: [3] });
    expect(updater(other)).toBe(other);
    expect(updater(null)).toBeNull();
    expect(updater(mine)[key]).toEqual(value);
  });
});
