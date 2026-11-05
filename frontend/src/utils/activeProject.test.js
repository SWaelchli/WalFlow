import { describe, it, expect } from 'vitest';
import { activeProjectFromDetail } from './activeProject';

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
