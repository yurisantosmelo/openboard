import { fireEvent, screen, within } from '@testing-library/react';
import { clearNavigationContext } from '@/app/navigationContext';
import { stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

function pageOf(items: object[]) {
  return Response.json({
    items,
    page: 1,
    page_size: 20,
    total_items: items.length,
    total_pages: 1,
  });
}

function projectDto(overrides: object = {}) {
  return {
    id: 'p1',
    organization_id: 'o1',
    workspace_id: 'w1',
    name: 'Core Platform',
    created_at: '2026-11-24T12:00:00Z',
    updated_at: '2026-11-24T12:00:00Z',
    current_user_role: 'owner',
    ...overrides,
  };
}

const statuses = [
  {
    id: 's1',
    project_id: 'p1',
    name: 'Backlog',
    status_group: 'not_committed',
    position: 0,
    created_at: '2026-11-24T12:00:00Z',
  },
  {
    id: 's2',
    project_id: 'p1',
    name: 'In Progress',
    status_group: 'started',
    position: 1,
    created_at: '2026-11-24T12:00:00Z',
  },
];

const workItemTypes = [
  {
    id: 't1',
    project_id: 'p1',
    name: 'Task',
    estimate_unit: 'hours',
    position: 0,
    allowed_child_type_ids: [],
    created_at: '2026-11-24T12:00:00Z',
  },
];

function workItemDto(overrides: object = {}) {
  return {
    id: 'wi1',
    organization_id: 'o1',
    project_id: 'p1',
    work_item_type_id: 't1',
    status_id: 's1',
    parent_id: null,
    era_id: null,
    assignee_id: null,
    assignee_username: '',
    assignee_name: '',
    title: 'Ship board drag and drop',
    description: 'Allow moving cards between columns',
    priority: 'high',
    story_points: null,
    hours: 2,
    created_by: 'u1',
    created_at: '2026-11-25T08:00:00Z',
    updated_at: '2026-11-25T08:00:00Z',
    current_user_role: 'owner',
    ...overrides,
  };
}

function projectApiStubs(projectId = 'p1', initialItems = [workItemDto()]) {
  let items = [...initialItems];
  return {
    getItems: () => items,
    routes: {
      [`GET /api/v1/projects/${projectId}`]: Response.json(projectDto({ id: projectId })),
      [`GET /api/v1/projects/${projectId}/statuses`]: Response.json({ items: statuses }),
      [`GET /api/v1/projects/${projectId}/work-item-types`]: Response.json({
        items: workItemTypes,
      }),
      [`GET /api/v1/projects/${projectId}/transition-rules`]: Response.json({ items: [] }),
      [`GET /api/v1/projects/${projectId}/eras`]: Response.json({ items: [] }),
      [`GET /api/v1/projects/${projectId}/views`]: Response.json({ items: [] }),
      [`GET /api/v1/projects/${projectId}/teams`]: Response.json({ items: [] }),
      'GET /api/v1/workspaces/w1/teams': Response.json({ items: [] }),
      [`GET /api/v1/projects/${projectId}/work-items?page=1&page_size=20`]: () => pageOf(items),
      [`POST /api/v1/projects/${projectId}/work-items`]: ({ body }: RequestInit) => {
        const parsed =
          typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {};
        const created = workItemDto({
          id: 'wi-created',
          title: parsed.title,
          description: parsed.description ?? '',
          status_id: parsed.status_id ?? 's1',
          work_item_type_id: parsed.work_item_type_id ?? 't1',
        });
        items = [created, ...items];
        return Response.json(created, { status: 201 });
      },
      'POST /api/v1/work-items/wi1/transitions': ({ body }: RequestInit) => {
        const parsed =
          typeof body === 'string'
            ? (JSON.parse(body) as { status_id: string })
            : { status_id: 's2' };
        items = items.map((item) =>
          item.id === 'wi1' ? { ...item, status_id: parsed.status_id } : item,
        );
        return Response.json(items.find((item) => item.id === 'wi1'));
      },
    },
  };
}

describe('Direct-to-Board navigation, Header Switchers, Board Drag-and-Drop and Quick Modal', () => {
  beforeEach(() => {
    clearNavigationContext();
  });

  afterEach(() => {
    clearNavigationContext();
    vi.unstubAllGlobals();
  });

  it('lands directly on the first Project Board when opening Home', async () => {
    const projectStub = projectApiStubs('p1');
    stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u1', name: 'Thamirys', username: 'thamirys' }),
      ),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([
        { id: 'o1', name: 'Acme', created_at: '2026-11-24T12:00:00Z', current_user_role: 'owner' },
      ]),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': pageOf([
        {
          id: 'w1',
          organization_id: 'o1',
          name: 'Product',
          visibility: 'open',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-24T12:00:00Z',
          current_user_role: 'owner',
        },
      ]),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([projectDto()]),
      ...projectStub.routes,
    });

    const { router } = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Board', level: 1 })).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Ship board drag and drop' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/p1');
  });

  it('switches Organizations and Workspaces from header dropdowns and supports Add Organization / Add Workspace', async () => {
    const p1Stub = projectApiStubs('p1');
    const p2Stub = projectApiStubs('p2', [
      workItemDto({ id: 'wi2', project_id: 'p2', title: 'Globex Launch' }),
    ]);
    const fetchMock = stubApi({
      'GET /api/v1/users/me': Response.json(userDto({ is_administrator: true })),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([
        { id: 'o1', name: 'Acme', created_at: '2026-11-24T12:00:00Z', current_user_role: 'owner' },
        {
          id: 'o2',
          name: 'Globex',
          created_at: '2026-11-24T12:00:00Z',
          current_user_role: 'owner',
        },
      ]),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': pageOf([
        {
          id: 'w1',
          organization_id: 'o1',
          name: 'Product',
          visibility: 'open',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-24T12:00:00Z',
          current_user_role: 'owner',
        },
        {
          id: 'w2',
          organization_id: 'o1',
          name: 'Design',
          visibility: 'restricted',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-24T12:00:00Z',
          current_user_role: 'owner',
        },
      ]),
      'GET /api/v1/workspaces?organization_id=o2&page=1&page_size=20': pageOf([
        {
          id: 'w3',
          organization_id: 'o2',
          name: 'Core',
          visibility: 'open',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-24T12:00:00Z',
          current_user_role: 'owner',
        },
      ]),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([projectDto()]),
      'GET /api/v1/projects?workspace_id=w3&page=1&page_size=20': pageOf([
        projectDto({ id: 'p2', organization_id: 'o2', workspace_id: 'w3', name: 'Globex Board' }),
      ]),
      'POST /api/v1/workspaces': Response.json(
        {
          id: 'w-new',
          organization_id: 'o2',
          name: 'QA Lab',
          visibility: 'restricted',
          created_at: '2026-11-25T12:00:00Z',
          updated_at: '2026-11-25T12:00:00Z',
          current_user_role: 'owner',
        },
        { status: 201 },
      ),
      'GET /api/v1/workspaces/w-new': Response.json({
        id: 'w-new',
        organization_id: 'o2',
        name: 'QA Lab',
        visibility: 'restricted',
        created_at: '2026-11-25T12:00:00Z',
        updated_at: '2026-11-25T12:00:00Z',
        current_user_role: 'owner',
      }),
      'GET /api/v1/projects?workspace_id=w-new&page=1&page_size=20': pageOf([]),
      'GET /api/v1/workspaces/w-new/teams': Response.json({ items: [] }),
      'GET /api/v1/workspaces/w-new/memberships?page=1&page_size=20': pageOf([]),
      'GET /api/v1/workspaces/w3/teams': Response.json({ items: [] }),
      ...p1Stub.routes,
      ...p2Stub.routes,
    });

    const { user, router } = renderRoute('/projects/p1');
    await screen.findByRole('link', { name: 'Ship board drag and drop' });

    // Switch Organization from header dropdown -> jumps straight into Globex's first Board
    await user.click(screen.getByRole('button', { name: 'Switch Organization' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Globex' }));
    expect(await screen.findByRole('link', { name: 'Globex Launch' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/p2');

    // Open Workspace switcher and create a new Workspace via + Add Workspace dialog
    await user.click(screen.getByRole('button', { name: 'Switch Workspace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add Workspace' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'QA Lab');
    await user.click(within(dialog).getByRole('button', { name: 'Create Workspace' }));

    expect(await screen.findByRole('heading', { name: 'QA Lab', level: 1 })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('drags a board card across columns with grab cursor and creates a Work Item in the 2-column modal using Ctrl+Enter', async () => {
    const p1Stub = projectApiStubs('p1');
    const fetchMock = stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u1', name: 'Thamirys', username: 'thamirys' }),
      ),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([projectDto()]),
      ...p1Stub.routes,
    });

    const { user } = renderRoute('/projects/p1');
    const board = await screen.findByRole('region', { name: 'Work Items board' });
    const cardLink = await within(board).findByRole('link', { name: 'Ship board drag and drop' });
    const cardArticle = cardLink.closest('article');
    expect(cardArticle).not.toBeNull();
    expect(cardArticle).toHaveAttribute('draggable', 'true');
    expect(cardArticle).toHaveClass('cursor-grab');

    // Drag card from Backlog column to In Progress column
    const inProgressColumn = within(board).getByRole('region', { name: 'In Progress' });
    const dataMap = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: (type: string, value: string) => {
        dataMap.set(type, value);
      },
      getData: (type: string) => dataMap.get(type) ?? '',
    };

    if (!cardArticle) throw new Error('expected draggable card article');
    fireEvent.dragStart(cardArticle, { dataTransfer });
    fireEvent.dragOver(inProgressColumn, { dataTransfer });
    fireEvent.drop(inProgressColumn, { dataTransfer });
    fireEvent.dragEnd(cardArticle, { dataTransfer });

    expect(
      await within(inProgressColumn).findByRole('link', { name: 'Ship board drag and drop' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/work-items/wi1/transitions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ status_id: 's2' }) }),
    );

    // Open 2-column modal from In Progress column "+" button and save via Ctrl+Enter
    await user.click(
      within(inProgressColumn).getByRole('button', { name: 'Add Work Item to In Progress' }),
    );
    const dialog = await screen.findByRole('dialog');
    const form = within(dialog).getByRole('form', { name: 'New Work Item' });
    expect(within(form).getByLabelText('Status')).toHaveValue('s2');

    const titleInput = within(form).getByLabelText('Title');
    await user.type(titleInput, 'Quick Ctrl+Enter card');
    await user.type(within(form).getByLabelText('Description'), 'Created via keyboard shortcut');
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(
      await within(inProgressColumn).findByRole('link', { name: 'Quick Ctrl+Enter card' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
