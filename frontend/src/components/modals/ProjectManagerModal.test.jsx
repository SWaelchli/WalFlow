import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import ProjectManagerModal from './ProjectManagerModal';

vi.mock('axios');
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ isAuthenticated: true, currentUser: { id: 'u1', username: 'me' } }) }));
vi.mock('../../utils/dialogs', async (importOriginal) => ({ ...(await importOriginal()), notify: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const project = { id: 'p1', title: 'Plant', description: '', role: 'owner', diagrams: [], members: [] };

describe('create drawing form', () => {
  it('posts a blank diagram, not a copy of the open canvas', async () => {
    axios.get = vi.fn((url) => Promise.resolve({ data: url === '/api/projects' ? [project] : url.includes('lock-status') ? { is_locked: false } : project }));
    axios.post = vi.fn().mockResolvedValue({ data: { id: 'd9', title: 'Fresh' } });
    const openCanvas = {
      nodes: [{ id: 'tank_1', type: 'tank', position: { x: 1, y: 2 }, data: { label: 'T1' } }],
      edges: [{ id: 'e1', source: 'tank_1', target: 'tank_2' }],
      globalSettings: { some: 'setting' },
      cases: [{ id: 'case_x', name: 'X' }],
      activeCaseId: 'case_x',
    };
    render(<ProjectManagerModal isOpen onClose={() => {}} initialProjectId="p1" currentFlowData={openCanvas} />);

    fireEvent.change(await screen.findByPlaceholderText(/drawing title/i), { target: { value: 'Fresh' } });
    fireEvent.submit(screen.getByRole('button', { name: /create drawing/i }).closest('form'));

    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe('/api/diagrams');
    expect(body.project_id).toBe('p1');
    const data = JSON.parse(body.diagram_data);
    expect(data.nodes).toEqual([]);
    expect(data.edges).toEqual([]);
    expect(data.cases).toHaveLength(1);
    expect(data.active_case_id).toBe('case_base');
  });
});
