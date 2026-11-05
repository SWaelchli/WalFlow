import { describe, it, expect } from 'vitest';
import { activeProjectFromDetail, pipeConnectionBlockMessage } from './activeProject';

describe('pipeConnectionBlockMessage', () => {
  const ME = { id: 'u1' };
  const SIGN_IN = "Sign in to load this project's settings before connecting pipes.";
  it.each([
    ['rules loaded', { projectRulesLoaded: true, projectDetailsFailed: true, currentUser: null }, null],
    ['not signed in', { projectRulesLoaded: false, projectDetailsFailed: false, currentUser: null }, SIGN_IN],
    ['not signed in beats a failed load', { projectRulesLoaded: false, projectDetailsFailed: true, currentUser: null }, SIGN_IN],
    ['load failed', { projectRulesLoaded: false, projectDetailsFailed: true, currentUser: ME }, "Could not load this project's settings. Use Retry in Settings › Project before connecting pipes."],
    ['still loading', { projectRulesLoaded: false, projectDetailsFailed: false, currentUser: ME }, "This project's settings are still loading. Try again in a moment."],
  ])('%s', (_n, args, expected) => {
    expect(pipeConnectionBlockMessage(args)).toBe(expected);
  });
});

describe('activeProjectFromDetail', () => {
  it('keeps the saved pipe classes, the custom-dimension flag and the members of the project', () => {
    const members = [{ user_id: 'u1', role: 'owner' }];
    const detail = { id: 'p1', title: 'P', description: 'd', allowed_pipe_classes: [1], allow_custom_pipes: false, members, updated_at: 'x' };
    expect(activeProjectFromDetail(detail)).toEqual({
      id: 'p1', title: 'P', description: 'd', allowed_pipe_classes: [1], allow_custom_pipes: false, members,
    });
    expect(activeProjectFromDetail({ ...detail, allowed_pipe_classes: null, allow_custom_pipes: undefined }))
      .toMatchObject({ allowed_pipe_classes: null, allow_custom_pipes: true });
  });
});
