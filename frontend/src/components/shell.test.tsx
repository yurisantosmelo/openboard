import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ProjectShellContext, type ProjectShellState } from '@/app/project-shell-context';
import { GlobalHeader } from './global-header';
import { ProjectSidebar } from './project-sidebar';
import { SidebarNavItem } from './ui/sidebar-nav-item';
import { ViewSwitcher } from './ui/view-switcher';

function makeShell(overrides: Partial<ProjectShellState> = {}): ProjectShellState {
  return {
    project: {
      id: 'p1',
      organizationId: 'o1',
      workspaceId: 'w1',
      name: 'Core Platform',
      createdAt: '2026-11-24T12:00:00Z',
      updatedAt: '2026-11-24T12:00:00Z',
      currentUserRole: 'owner',
    },
    activeViewMode: 'board',
    activeViewId: null,
    views: [
      {
        id: 'v1',
        projectId: 'p1',
        name: 'Sprint 14 Focus',
        layout: 'board',
        visibility: 'shared',
        filters: {},
        createdBy: 'u1',
        createdAt: '2026-11-25T00:00:00Z',
        updatedAt: '2026-11-25T00:00:00Z',
      },
    ],
    searchQuery: '',
    configOpen: false,
    configTab: 'workflow',
    canWrite: true,
    canCreateWorkItem: true,
    onSelectLayout: vi.fn(),
    onSelectSavedView: vi.fn(),
    onRequestSaveView: vi.fn(),
    onSearchChange: vi.fn(),
    onToggleConfig: vi.fn(),
    onOpenConfigTab: vi.fn(),
    onStartCreateWorkItem: vi.fn(),
    ...overrides,
  };
}

function renderWithShell(ui: React.ReactNode, shell: ProjectShellState | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProjectShellContext.Provider value={{ shell, setShell: () => undefined }}>
          {ui}
        </ProjectShellContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OpenBoard navigation shell', () => {
  it('renders SidebarNavItem with vertical active/inactive indicators and optional counts', () => {
    const { container } = render(
      <div>
        <SidebarNavItem active count={24}>
          Boards
        </SidebarNavItem>
        <SidebarNavItem count={11}>Backlogs</SidebarNavItem>
        <SidebarNavItem tone="muted">Wiki</SidebarNavItem>
      </div>,
    );

    const indicators = container.querySelectorAll('[data-slot="sidebar-nav-indicator"]');
    expect(indicators).toHaveLength(3);
    expect(indicators[0]).toHaveClass('bg-primary');
    expect(indicators[1]).toHaveClass('bg-input');
    expect(indicators[2]).toHaveClass('bg-input');
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('switches layouts via ViewSwitcher', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ViewSwitcher value="board" onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(onChange).toHaveBeenCalledWith('timeline');
  });

  it('renders ProjectSidebar WORK, SAVED VIEWS, PROJECTS and footer actions', async () => {
    const user = userEvent.setup();
    const shell = makeShell();
    renderWithShell(<ProjectSidebar />, shell);

    expect(screen.getByText('CP')).toBeInTheDocument();
    expect(screen.getByText('WORK')).toBeInTheDocument();
    expect(screen.getByText('SAVED VIEWS')).toBeInTheDocument();
    expect(screen.getByText('PROJECTS')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Work Items' }));
    expect(shell.onSelectLayout).toHaveBeenCalledWith('list');

    await user.click(screen.getByRole('button', { name: 'Boards' }));
    expect(shell.onSelectLayout).toHaveBeenCalledWith('board');

    await user.click(screen.getByRole('button', { name: 'Eras' }));
    expect(shell.onOpenConfigTab).toHaveBeenCalledWith('eras');

    await user.click(screen.getByRole('button', { name: 'All Work Items' }));
    expect(shell.onSelectSavedView).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole('button', { name: 'Sprint 14 Focus' }));
    expect(shell.onSelectSavedView).toHaveBeenCalledWith(shell.views[0]);

    await user.click(screen.getByRole('button', { name: 'Teams' }));
    expect(shell.onOpenConfigTab).toHaveBeenCalledWith('teams');

    await user.click(screen.getByRole('button', { name: 'Workflow & Settings' }));
    expect(shell.onOpenConfigTab).toHaveBeenCalledWith('settings');
  });

  it('returns null from ProjectSidebar when outside a Project shell', () => {
    const { container } = renderWithShell(<ProjectSidebar />, null);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders GlobalHeader with Ctrl + / command palette, utilities and avatar menu', async () => {
    const user = userEvent.setup();
    const shell = makeShell({ searchQuery: '' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['current-user'], {
      id: 'u1',
      username: 'alfredo',
      name: 'Alfredo Melo',
      isAdministrator: true,
      mustChangePassword: false,
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ProjectShellContext.Provider value={{ shell, setShell: () => undefined }}>
            <GlobalHeader />
          </ProjectShellContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Global search work items' })).toBeInTheDocument();
    expect(screen.getByText('Ctrl + /')).toBeInTheDocument();

    await user.keyboard('{Control>}/{/Control}');
    const paletteInput = await screen.findByLabelText('Command palette search');
    expect(paletteInput).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Command palette search')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Help and keyboard shortcuts' }));
    expect(await screen.findByText('Keyboard shortcuts')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Alfredo Melo' }));
    expect(await screen.findByText('@alfredo')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Management Portal' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Project configuration' }));
    expect(shell.onToggleConfig).toHaveBeenCalledTimes(1);
  });

  it('clears the GlobalHeader search query via the clear button and renders single-word initials', async () => {
    const user = userEvent.setup();
    const shell = makeShell({ searchQuery: 'CORE' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['current-user'], {
      id: 'u2',
      username: 'bruno',
      name: 'Bruno',
      isAdministrator: false,
      mustChangePassword: false,
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ProjectShellContext.Provider value={{ shell, setShell: () => undefined }}>
            <GlobalHeader />
          </ProjectShellContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('BR')).toBeInTheDocument();
    expect(screen.getByText('CORE')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(shell.onSearchChange).toHaveBeenCalledWith('');
  });
});
