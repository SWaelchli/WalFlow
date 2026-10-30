import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Sidebar from './Sidebar';
import { UnitProvider } from '../../context/UnitContext';

afterEach(cleanup);

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
