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

  it('lands Contributors directly on the first Project Board when opening Home', async () => {
    const projectStub = projectApiStubs('p1');
    stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u1', name: 'Thamirys', username: 'thamirys', is_administrator: false }),
      ),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([
        {
          id: 'o1',
          name: 'Acme',
          created_at: '2026-11-24T12:00:00Z',
          current_user_role: 'contributor',
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
          current_user_role: 'contributor',
        },
      ]),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([
        projectDto({ current_user_role: 'contributor' }),
      ]),
      ...projectStub.routes,
    });

    const { router } = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Board', level: 1 })).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Ship board drag and drop' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/p1');
  });

  it('switches Organizations and Workspaces from read-only header dropdowns when multiple exist', async () => {
    const p1Stub = projectApiStubs('p1');
    const p2Stub = projectApiStubs('p2', [
      workItemDto({ id: 'wi2', project_id: 'p2', title: 'Globex Launch' }),
    ]);
    const p3Stub = projectApiStubs('p3', [
      workItemDto({ id: 'wi3', project_id: 'p3', title: 'Design Polish' }),
    ]);
    stubApi({
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
      'GET /api/v1/projects?workspace_id=w2&page=1&page_size=20': pageOf([
        projectDto({ id: 'p3', organization_id: 'o1', workspace_id: 'w2', name: 'Design Hub' }),
      ]),
      'GET /api/v1/projects?workspace_id=w3&page=1&page_size=20': pageOf([
        projectDto({ id: 'p2', organization_id: 'o2', workspace_id: 'w3', name: 'Globex Board' }),
      ]),
      'GET /api/v1/workspaces/w2/teams': Response.json({ items: [] }),
      'GET /api/v1/workspaces/w3/teams': Response.json({ items: [] }),
      ...p1Stub.routes,
      ...p2Stub.routes,
      ...p3Stub.routes,
    });

    const { user, router } = renderRoute('/projects/p1');
    await screen.findByRole('link', { name: 'Ship board drag and drop' });

    // Switch Workspace within Acme -> jumps straight into Design's first Board
    await user.click(await screen.findByRole('button', { name: 'Switch Workspace' }));
    expect(screen.queryByRole('menuitem', { name: 'Add Workspace' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Design' }));
    expect(await screen.findByRole('link', { name: 'Design Polish' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/p3');

    // Switch Organization -> jumps straight into Globex's first Board
    await user.click(screen.getByRole('button', { name: 'Switch Organization' }));
    expect(screen.queryByRole('menuitem', { name: 'Add Organization' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: 'Globex' }));
    expect(await screen.findByRole('link', { name: 'Globex Launch' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/p2');
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

  it('creates a Work Item from column + New work item and inline + Add item in List View for any status', async () => {
    let counter = 0;
    let items: ReturnType<typeof workItemDto>[] = [];
    const customStatuses = [
      ...statuses,
      {
        id: 's3',
        project_id: 'p1',
        name: 'QA Review',
        status_group: 'started',
        position: 2,
        created_at: '2026-11-24T12:00:00Z',
      },
    ];

    const fetchMock = stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u1', name: 'Thamirys', username: 'thamirys' }),
      ),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([projectDto()]),
      'GET /api/v1/projects/p1': Response.json(projectDto()),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: customStatuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: workItemTypes }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/views': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/teams': Response.json({ items: [] }),
      'GET /api/v1/workspaces/w1/teams': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': () => pageOf(items),
      'POST /api/v1/projects/p1/work-items': ({ body }: RequestInit) => {
        counter += 1;
        const parsed =
          typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {};
        const created = workItemDto({
          id: `wi-new-${String(counter)}`,
          title: parsed.title,
          description: parsed.description ?? '',
          status_id: parsed.status_id ?? 's1',
          work_item_type_id: parsed.work_item_type_id ?? 't1',
        });
        items = [created, ...items];
        return Response.json(created, { status: 201 });
      },
    });

    const { user } = renderRoute('/projects/p1');

    // Click "+ New work item" button at the bottom of the Backlog column
    const board = await screen.findByRole('region', { name: 'Work Items board' });
    const backlogCol = within(board).getByRole('region', { name: 'Backlog' });
    await user.click(within(backlogCol).getByRole('button', { name: 'New work item' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title'), 'Board column item');
    await user.click(within(dialog).getByRole('button', { name: 'Create Work Item' }));
    expect(
      await within(backlogCol).findByRole('link', { name: 'Board column item' }),
    ).toBeInTheDocument();

    // Switch to List View -> inline + Add item works on Backlog and custom status QA Review
    await user.click(screen.getByRole('button', { name: 'List' }));
    const listRegion = await screen.findByRole('region', { name: 'Work Items list' });

    const backlogGroup = within(listRegion).getByRole('region', { name: 'Backlog' });
    await user.click(within(backlogGroup).getByRole('button', { name: 'Add item' }));
    const backlogInput = within(backlogGroup).getByLabelText('New Work Item title in Backlog');
    await user.type(backlogInput, 'Top inline backlog item{Enter}');
    expect(
      await within(backlogGroup).findByRole('link', { name: 'Top inline backlog item' }),
    ).toHaveAttribute('href', '/work-items/wi-new-2');

    const qaGroup = within(listRegion).getByRole('region', { name: 'QA Review' });
    await user.click(within(qaGroup).getByRole('button', { name: 'Add item' }));
    const qaInput = within(qaGroup).getByLabelText('New Work Item title in QA Review');
    await user.type(qaInput, 'Custom status inline item{Enter}');
    expect(
      await within(qaGroup).findByRole('link', { name: 'Custom status inline item' }),
    ).toHaveAttribute('href', '/work-items/wi-new-3');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/p1/work-items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          work_item_type_id: 't1',
          title: 'Custom status inline item',
          description: '',
          priority: 'none',
          status_id: 's3',
        }),
      }),
    );
  });

  it('opens the maximizable 01C Work Item card dialog when clicking any Board card and supports maximize/restore/full-page', async () => {
    let currentItem = workItemDto();
    const p1Stub = projectApiStubs('p1', [currentItem]);

    stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u1', name: 'Thamirys', username: 'thamirys' }),
      ),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([projectDto()]),
      ...p1Stub.routes,
      'GET /api/v1/work-items/wi1': () => Response.json(currentItem),
      'GET /api/v1/work-items/wi1/links': Response.json({ items: [] }),
      'PATCH /api/v1/work-items/wi1': ({ body }: RequestInit) => {
        const parsed =
          typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {};
        currentItem = {
          ...currentItem,
          title: typeof parsed.title === 'string' ? parsed.title : currentItem.title,
        };
        return Response.json(currentItem);
      },
    });

    const { user, router } = renderRoute('/projects/p1');
    const board = await screen.findByRole('region', { name: 'Work Items board' });
    const cardLink = await within(board).findByRole('link', { name: 'Ship board drag and drop' });
    const cardArticle = cardLink.closest('article');
    if (!cardArticle) throw new Error('expected board card article');

    // Click card body (not just the link) -> opens new 01C maximizable dialog
    await user.click(within(cardArticle).getByText('Task'));
    const dialog = await screen.findByRole('dialog', { name: 'Work Item details' });
    const backdrop = document.querySelector('[data-slot="work-item-detail-backdrop"]');
    expect(backdrop).toHaveClass('z-[55]');
    expect(dialog).toHaveClass('z-[60]');
    expect(router.state.location.pathname).toBe('/projects/p1');
    expect(dialog).toHaveAttribute('data-maximized', 'false');
    expect(within(dialog).getByText('Task · WI1')).toBeInTheDocument();

    // Maximize and restore
    await user.click(within(dialog).getByRole('button', { name: 'Maximize work item' }));
    expect(dialog).toHaveAttribute('data-maximized', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Restore work item size' }));
    expect(dialog).toHaveAttribute('data-maximized', 'false');

    // Save & Close updates the Work Item and closes the dialog
    const titleInput = within(dialog).getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Ship maximizable card modal');
    await user.click(within(dialog).getByRole('button', { name: 'Save & Close' }));
    expect(screen.queryByRole('dialog', { name: 'Work Item details' })).not.toBeInTheDocument();

    // Clicking the card title link reopens the modal, and Open full page navigates to /work-items/wi1
    await user.click(cardLink);
    const reopened = await screen.findByRole('dialog', { name: 'Work Item details' });
    await user.click(within(reopened).getByRole('link', { name: 'Open full page' }));
    expect(router.state.location.pathname).toBe('/work-items/wi1');

    const fullEditor = await screen.findByRole('form', { name: 'Work Item details' });
    expect(fullEditor).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Maximize work item' }));
    expect(screen.getByRole('button', { name: 'Restore work item size' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
