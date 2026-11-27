import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  ProjectShellContext,
  useProjectShell,
  type ProjectShellState,
} from '@/app/project-shell-context';
import { ProjectShellProvider } from '@/app/ProjectShellProvider';
import { GlobalHeader } from '@/components/global-header';
import type {
  Project,
  ProjectEra,
  ProjectStatus,
  ProjectView,
  ProjectWorkItemType,
} from '@/features/projects';
import type { WorkItem } from '@/features/work-items/api/workItemsApi';
import {
  activeEraOf,
  collectPaletteParticipants,
  filterPaletteCommands,
  filterPaletteProjects,
  filterPaletteViews,
  filterPaletteWorkItems,
  formatShortKey,
  INITIAL_PALETTE_FILTERS,
  parsePaletteQuery,
  projectCode,
  toggleListValue,
  typeNameOf,
  type CommandEntry,
} from './command-palette-types';

const NOW_ISO = new Date().toISOString();
const TEN_DAYS_AGO_ISO = new Date(Date.now() - 10 * 86_400_000).toISOString();
const FORTY_DAYS_AGO_ISO = new Date(Date.now() - 40 * 86_400_000).toISOString();

const STATUSES: ProjectStatus[] = [
  {
    id: 'st-backlog',
    projectId: 'p1',
    name: 'Backlog',
    statusGroup: 'not_committed',
    position: 0,
    createdAt: '2026-11-15T00:00:00Z',
  },
  {
    id: 'st-todo',
    projectId: 'p1',
    name: 'To Do',
    statusGroup: 'planned',
    position: 1,
    createdAt: '2026-11-15T00:00:00Z',
  },
  {
    id: 'st-prog',
    projectId: 'p1',
    name: 'In Progress',
    statusGroup: 'started',
    position: 2,
    createdAt: '2026-11-15T00:00:00Z',
  },
  {
    id: 'st-done',
    projectId: 'p1',
    name: 'Done',
    statusGroup: 'completed',
    position: 3,
    createdAt: '2026-11-15T00:00:00Z',
  },
];

const TYPES: ProjectWorkItemType[] = [
  {
    id: 't-story',
    projectId: 'p1',
    name: 'Story',
    estimateUnit: 'story_points',
    position: 0,
    allowedChildTypeIds: [],
    createdAt: '2026-11-15T00:00:00Z',
  },
  {
    id: 't-bug',
    projectId: 'p1',
    name: 'Bug',
    estimateUnit: 'hours',
    position: 1,
    allowedChildTypeIds: [],
    createdAt: '2026-11-15T00:00:00Z',
  },
  {
    id: 't-task',
    projectId: 'p1',
    name: 'Task',
    estimateUnit: 'none',
    position: 2,
    allowedChildTypeIds: [],
    createdAt: '2026-11-15T00:00:00Z',
  },
];

const ERAS: ProjectEra[] = [
  {
    id: 'era-14',
    projectId: 'p1',
    name: 'Sprint 14',
    goal: 'Ship Command Palette',
    state: 'active',
    startDate: '2026-11-15',
    endDate: '2026-11-29',
    closedAt: null,
    createdAt: '2026-11-15T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
  },
  {
    id: 'era-15',
    projectId: 'p1',
    name: 'Sprint 15',
    goal: 'Polish search',
    state: 'planned',
    startDate: '2026-11-30',
    endDate: '2026-12-14',
    closedAt: null,
    createdAt: '2026-11-15T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
  },
];

const PRIMARY_PROJECT: Project = {
  id: 'p1',
  organizationId: 'o1',
  workspaceId: 'w1',
  name: 'Core Platform',
  createdAt: '2026-11-24T12:00:00Z',
  updatedAt: '2026-11-24T12:00:00Z',
  currentUserRole: 'owner',
};

const PROJECTS: Project[] = [
  PRIMARY_PROJECT,
  {
    id: 'p2',
    organizationId: 'o1',
    workspaceId: 'w1',
    name: 'Design System',
    createdAt: '2026-11-24T12:00:00Z',
    updatedAt: '2026-11-24T12:00:00Z',
    currentUserRole: 'contributor',
  },
];

const VIEWS: ProjectView[] = [
  {
    id: 'v1',
    projectId: 'p1',
    name: 'Sprint 14 Board',
    layout: 'board',
    visibility: 'shared',
    filters: {},
    createdBy: 'u1',
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
  },
  {
    id: 'v2',
    projectId: 'p1',
    name: 'My Backlog List',
    layout: 'list',
    visibility: 'personal',
    filters: {},
    createdBy: 'u1',
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
  },
];

const FIRST_WORK_ITEM: WorkItem = {
  id: 'abcdef123456',
  organizationId: 'o1',
  projectId: 'p1',
  title: 'Implement OIDC token refresh',
  description: 'Rotate refresh tokens on session renewal',
  statusId: 'st-prog',
  workItemTypeId: 't-story',
  priority: 'urgent',
  assigneeId: 'u1',
  assigneeUsername: 'alfredo',
  assigneeName: 'Alfredo Melo',
  parentId: null,
  eraId: 'era-14',
  storyPoints: 5,
  hours: null,
  createdBy: 'u1',
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
  currentUserRole: 'owner',
};

const WORK_ITEMS: WorkItem[] = [
  FIRST_WORK_ITEM,
  {
    id: '987654fedcba',
    organizationId: 'o1',
    projectId: 'p1',
    title: 'Fix Liquibase index deadlock',
    description: 'Concurrent migration lock on startup',
    statusId: 'st-todo',
    workItemTypeId: 't-bug',
    priority: 'high',
    assigneeId: 'u2',
    assigneeUsername: 'bruno',
    assigneeName: 'Bruno Silva',
    parentId: null,
    eraId: null,
    storyPoints: null,
    hours: 3,
    createdBy: 'u2',
    createdAt: TEN_DAYS_AGO_ISO,
    updatedAt: TEN_DAYS_AGO_ISO,
    currentUserRole: 'owner',
  },
  {
    id: '112233445566',
    organizationId: 'o1',
    projectId: 'p1',
    title: 'Archive deprecated API routes',
    description: 'Remove v0 endpoints',
    statusId: 'st-done',
    workItemTypeId: 't-task',
    priority: 'low',
    assigneeId: null,
    assigneeUsername: '',
    assigneeName: '',
    parentId: null,
    eraId: null,
    storyPoints: null,
    hours: null,
    createdBy: 'u1',
    createdAt: FORTY_DAYS_AGO_ISO,
    updatedAt: FORTY_DAYS_AGO_ISO,
    currentUserRole: 'owner',
  },
];

function makeShell(overrides: Partial<ProjectShellState> = {}): ProjectShellState {
  return {
    project: PRIMARY_PROJECT,
    activeViewMode: 'board',
    activeViewId: null,
    views: VIEWS,
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

function seedClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['current-user'], {
    id: 'u1',
    username: 'alfredo',
    name: 'Alfredo Melo',
    isAdministrator: true,
    mustChangePassword: false,
  });
  client.setQueryData(['work-items', 'p1', {}, 1], {
    items: WORK_ITEMS,
    page: 1,
    pageSize: 50,
    totalCount: WORK_ITEMS.length,
    totalPages: 1,
  });
  client.setQueryData(['project-statuses', 'p1'], STATUSES);
  client.setQueryData(['project-work-item-types', 'p1'], TYPES);
  client.setQueryData(['project-eras', 'p1'], ERAS);
  client.setQueryData(['project', 'p1'], PRIMARY_PROJECT);
  client.setQueryData(['work-item', 'abcdef123456'], FIRST_WORK_ITEM);
  client.setQueryData(['work-item-links', 'abcdef123456'], []);
  client.setQueryData(['projects', 'w1', 1, false], {
    items: PROJECTS,
    page: 1,
    pageSize: 50,
    totalCount: PROJECTS.length,
    totalPages: 1,
  });
  return client;
}

function renderPaletteApp(shell: ProjectShellState | null = makeShell()) {
  const client = seedClient();
  return {
    shell,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/projects/p1']}>
          <ProjectShellContext.Provider value={{ shell, setShell: () => undefined }}>
            <GlobalHeader />
            <Routes>
              <Route path="/projects/:projectId" element={<div>Project route</div>} />
              <Route path="/work-items/:workItemId" element={<div>Work item route</div>} />
              <Route path="/organizations" element={<div>Organizations route</div>} />
            </Routes>
          </ProjectShellContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe('command-palette-types pure helpers', () => {
  const statusById = new Map(STATUSES.map((s) => [s.id, s]));

  it('parses query prefixes and formats keys and project codes', () => {
    expect(parsePaletteQuery('  > theme  ')).toEqual({ prefix: '>', term: 'theme' });
    expect(parsePaletteQuery('#abc')).toEqual({ prefix: '#', term: 'abc' });
    expect(parsePaletteQuery('@alfredo')).toEqual({ prefix: '@', term: 'alfredo' });
    expect(parsePaletteQuery('/sprint')).toEqual({ prefix: '/', term: 'sprint' });
    expect(parsePaletteQuery('OIDC')).toEqual({ prefix: null, term: 'oidc' });

    expect(formatShortKey('abcdef123456')).toMatch(/^\d{8}$/);
    expect(formatShortKey('abcdef123456')).toBe(formatShortKey('abcdef123456'));
    expect(projectCode('Core Platform')).toBe('CP');
    expect(projectCode('Platform')).toBe('PL');
    expect(projectCode('   ')).toBe('P');
    expect(toggleListValue(['a', 'b'], 'b')).toEqual(['a']);
    expect(toggleListValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(activeEraOf(ERAS)?.id).toBe('era-14');
    expect(typeNameOf(TYPES, 't-bug')).toBe('Bug');
    expect(typeNameOf(TYPES, 'unknown')).toBe('Item');
  });

  it('filters work items across prefixes, time windows, eras, assignees and facets', () => {
    const nowMs = Date.now();
    expect(
      filterPaletteWorkItems({
        items: WORK_ITEMS,
        parsed: parsePaletteQuery('@bruno'),
        filters: INITIAL_PALETTE_FILTERS,
        statusById,
        nowMs,
      }).map((i) => i.id),
    ).toEqual(['987654fedcba']);

    expect(
      filterPaletteWorkItems({
        items: WORK_ITEMS,
        parsed: parsePaletteQuery(`#${formatShortKey('abcdef123456')}`),
        filters: INITIAL_PALETTE_FILTERS,
        statusById,
        nowMs,
      }).map((i) => i.id),
    ).toEqual(['abcdef123456']);

    expect(
      filterPaletteWorkItems({
        items: WORK_ITEMS,
        parsed: parsePaletteQuery(''),
        filters: { ...INITIAL_PALETTE_FILTERS, updated: 'today' },
        statusById,
        nowMs,
      }).map((i) => i.id),
    ).toEqual(['abcdef123456']);

    expect(
      filterPaletteWorkItems({
        items: WORK_ITEMS,
        parsed: parsePaletteQuery(''),
        filters: { ...INITIAL_PALETTE_FILTERS, updated: '7d' },
        statusById,
        nowMs,
      }).map((i) => i.id),
    ).toEqual(['abcdef123456']);

    expect(
      filterPaletteWorkItems({
        items: WORK_ITEMS,
        parsed: parsePaletteQuery(''),
        filters: { ...INITIAL_PALETTE_FILTERS, updated: '30d' },
        statusById,
        nowMs,
      }).map((i) => i.id),
    ).toEqual(['abcdef123456', '987654fedcba']);

    expect(
      filterPaletteWorkItems({
        items: [{ ...FIRST_WORK_ITEM, updatedAt: 'not-a-date' }],
        parsed: parsePaletteQuery(''),
        filters: { ...INITIAL_PALETTE_FILTERS, updated: 'today' },
        statusById,
        nowMs,
      }),
    ).toHaveLength(1);

    expect(
      filterPaletteWorkItems({
        items: WORK_ITEMS,
        parsed: parsePaletteQuery(''),
        filters: {
          ...INITIAL_PALETTE_FILTERS,
          eraMode: 'active',
          assignedToMe: true,
          assigneeIds: ['u1'],
          statusGroups: ['started'],
          typeIds: ['t-story'],
          priorities: ['urgent'],
          projectIds: ['p1'],
        },
        statusById,
        activeEraId: 'era-14',
        currentUserId: 'u1',
        nowMs,
      }).map((i) => i.id),
    ).toEqual(['abcdef123456']);

    expect(
      filterPaletteWorkItems({
        items: WORK_ITEMS,
        parsed: parsePaletteQuery(''),
        filters: { ...INITIAL_PALETTE_FILTERS, eraMode: 'none' },
        statusById,
        activeEraId: 'era-14',
        nowMs,
      }),
    ).toHaveLength(2);
  });

  it('filters projects, views, commands and collects participants', () => {
    expect(
      filterPaletteProjects(PROJECTS, parsePaletteQuery('design'), []).map((p) => p.id),
    ).toEqual(['p2']);
    expect(filterPaletteProjects(PROJECTS, parsePaletteQuery(''), ['p1']).map((p) => p.id)).toEqual(
      ['p1'],
    );

    expect(
      filterPaletteViews(VIEWS, parsePaletteQuery(''), {
        ...INITIAL_PALETTE_FILTERS,
        viewVisibility: 'personal',
        viewLayouts: ['list'],
      }).map((v) => v.id),
    ).toEqual(['v2']);

    const commands: CommandEntry[] = [
      {
        id: 'a',
        group: 'CREATE',
        glyph: '+',
        label: 'Create Work Item',
        shortcut: 'C',
        description: 'Open modal',
        scope: 'Core',
        roleRequired: 'Contributor',
        run: vi.fn(),
      },
      {
        id: 'b',
        group: 'PREFERENCES',
        glyph: '◐',
        label: 'Toggle Theme',
        shortcut: 'T D',
        description: 'Dark mode',
        scope: 'Instance',
        roleRequired: 'Any',
        run: vi.fn(),
      },
    ];
    expect(filterPaletteCommands(commands, parsePaletteQuery('> dark')).map((c) => c.id)).toEqual([
      'b',
    ]);

    const participants = collectPaletteParticipants(WORK_ITEMS, {
      id: 'u1',
      name: 'Alfredo Melo',
      username: 'alfredo',
    });
    expect(participants.map((p) => p.id)).toEqual(['u1', 'u2']);
  });
});

describe('CommandPalette overlay', () => {
  it('opens horizontally centered from GlobalHeader click or Ctrl + / and displays All tab results', async () => {
    const user = userEvent.setup();
    renderPaletteApp();

    await user.click(screen.getByRole('button', { name: 'Global search work items' }));
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    expect(dialog).toHaveClass('left-1/2', '-translate-x-1/2', 'max-w-[760px]');

    expect(within(dialog).getByText('RECENTLY VIEWED')).toBeInTheDocument();
    expect(within(dialog).getByText('Implement OIDC token refresh')).toBeInTheDocument();
    expect(within(dialog).getByText('RECENT PROJECTS & VIEWS')).toBeInTheDocument();
    expect(within(dialog).getByText('QUICK COMMANDS')).toBeInTheDocument();
    expect(within(dialog).getByText('LAST UPDATED')).toBeInTheDocument();

    const filtersAside = within(dialog).getByLabelText('Search filters');
    await user.click(within(filtersAside).getByRole('button', { name: 'Today' }));
    await user.click(within(filtersAside).getByLabelText('Started'));
    await user.click(within(filtersAside).getByLabelText(/Core Platform/i));
    await user.click(within(filtersAside).getByLabelText('Assigned to me'));
    await user.click(within(filtersAside).getByLabelText(/Alfredo Melo/i));
    expect(within(dialog).getByText('Implement OIDC token refresh')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(await screen.findByText('Work item route')).toBeInTheDocument();
  });

  it('supports Work Items tab filters, prefix switching and Ctrl+Enter creation', async () => {
    const user = userEvent.setup();
    const shell = makeShell();
    renderPaletteApp(shell);

    await user.keyboard('{Control>}/{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });

    await user.click(within(dialog).getByRole('tab', { name: /Work Items/i }));
    expect(within(dialog).getByText('WORK ITEM TYPE')).toBeInTheDocument();
    expect(within(dialog).getByText(/Sprint 14 · 5 pts/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Bug' }));
    expect(within(dialog).getByText('Fix Liquibase index deadlock')).toBeInTheDocument();
    expect(within(dialog).queryByText('Implement OIDC token refresh')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Bug' }));
    await user.click(within(dialog).getByRole('button', { name: 'Urgent' }));
    expect(within(dialog).getByText('Implement OIDC token refresh')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Urgent' }));

    await user.click(within(dialog).getByLabelText('Active Era (Sprint 14)'));
    expect(within(dialog).getByText('Implement OIDC token refresh')).toBeInTheDocument();
    expect(within(dialog).queryByText('Fix Liquibase index deadlock')).not.toBeInTheDocument();

    await user.click(within(dialog).getByLabelText('No Era (Backlog)'));
    expect(within(dialog).getByText('Fix Liquibase index deadlock')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('No Era (Backlog)'));

    await user.click(within(dialog).getByLabelText('Assigned to me'));
    expect(within(dialog).getByText('Implement OIDC token refresh')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Assigned to me'));

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(shell.onStartCreateWorkItem).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('supports Projects & Views tab filters, Saved View selection and Go to all chips', async () => {
    const user = userEvent.setup();
    const shell = makeShell();
    renderPaletteApp(shell);

    await user.keyboard('{Control>}/{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });

    await user.click(within(dialog).getByRole('button', { name: 'Projects' }));
    expect(within(dialog).getByRole('tab', { name: 'Projects & Views' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(dialog).getByText('Current')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Personal' }));
    expect(within(dialog).getByText('My Backlog List')).toBeInTheDocument();
    expect(within(dialog).queryByText('Sprint 14 Board')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'List' }));
    expect(within(dialog).getByText('My Backlog List')).toBeInTheDocument();

    await user.click(within(dialog).getByText('My Backlog List'));
    expect(shell.onSelectSavedView).toHaveBeenCalledWith(VIEWS[1]);

    await user.keyboard('{Control>}/{/Control}');
    const reopened = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.click(within(reopened).getByRole('button', { name: 'Eras' }));
    expect(shell.onOpenConfigTab).toHaveBeenCalledWith('eras');
  });

  it('auto-switches to Commands tab on > prefix, updates inspector and runs commands', async () => {
    const user = userEvent.setup();
    const shell = makeShell();
    renderPaletteApp(shell);

    await user.keyboard('{Control>}/{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    const input = within(dialog).getByLabelText('Command palette search');

    await user.type(input, '> list');
    expect(within(dialog).getByRole('tab', { name: 'Commands' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(dialog).getByText('SELECTED COMMAND')).toBeInTheDocument();
    expect(within(dialog).getByText('SEARCH PREFIXES')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Run "Switch to List View"/i }));
    expect(shell.onSelectLayout).toHaveBeenCalledWith('list');

    await user.keyboard('{Control>}/{/Control}');
    const second = await screen.findByRole('dialog', { name: 'Command palette' });
    const secondInput = within(second).getByLabelText('Command palette search');
    await user.type(secondInput, 'oidc');
    await user.click(within(second).getByRole('button', { name: 'Clear palette search' }));
    expect(secondInput).toHaveValue('');
    await user.type(secondInput, 'oidc');
    await user.click(
      within(second).getByRole('button', { name: /Open full Work Items search for "oidc"/i }),
    );
    expect(shell.onSearchChange).toHaveBeenCalledWith('oidc');
    expect(shell.onSelectLayout).toHaveBeenCalledWith('list');
  });

  it('works outside a Project shell with global commands and portal navigation', async () => {
    const user = userEvent.setup();
    renderPaletteApp(null);

    await user.keyboard('{Control>}/{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.click(within(dialog).getByRole('tab', { name: 'Commands' }));
    expect(
      within(dialog).getByRole('button', { name: /Toggle Light \/ Dark Theme/i }),
    ).toBeInTheDocument();
    const portalCmd = within(dialog).getByRole('button', {
      name: /Organizations & Workspaces/i,
    });
    expect(portalCmd).toBeInTheDocument();

    await user.click(portalCmd);
    expect(await screen.findByText('Organizations route')).toBeInTheDocument();
  });

  it('opens the maximizable 01C Work Item card dialog when selecting a card from Command Palette', async () => {
    const user = userEvent.setup();
    const shell = makeShell();
    const client = seedClient();

    function ShellBridge() {
      return (
        <ProjectShellProvider>
          <SeedShell shell={shell} />
          <GlobalHeader />
        </ProjectShellProvider>
      );
    }

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/projects/p1']}>
          <ShellBridge />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.keyboard('{Control>}/{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.click(within(palette).getByText('Implement OIDC token refresh'));

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    const cardDialog = await screen.findByRole('dialog', { name: 'Work Item details' });
    expect(cardDialog).toHaveAttribute('data-maximized', 'false');
    expect(within(cardDialog).getByText(formatShortKey('abcdef123456'))).toBeInTheDocument();
    expect(
      within(cardDialog).queryByRole('link', { name: 'Open full page' }),
    ).not.toBeInTheDocument();

    const maxBtn = within(cardDialog).getByRole('button', { name: 'Maximize work item' });
    await user.click(maxBtn);
    expect(cardDialog).toHaveAttribute('data-maximized', 'true');
    expect(
      within(cardDialog).getByRole('button', { name: 'Restore work item size' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(cardDialog).getByRole('button', { name: 'Restore work item size' }));
    expect(cardDialog).toHaveAttribute('data-maximized', 'false');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Work Item details' })).not.toBeInTheDocument();
  });
});

function SeedShell({ shell }: { shell: ProjectShellState }) {
  const ctx = useProjectShell();
  useEffect(() => {
    ctx.setShell(shell);
  }, [ctx, shell]);
  return null;
}
