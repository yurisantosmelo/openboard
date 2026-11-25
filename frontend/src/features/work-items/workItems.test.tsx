import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { problem, stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

const signedIn = {
  'GET /api/v1/users/me': Response.json(userDto({ id: 'u1', username: 'ada', name: 'Ada' })),
};

function projectDto(overrides: object = {}) {
  return {
    id: 'p1',
    organization_id: 'o1',
    workspace_id: 'w1',
    name: 'Core Platform',
    created_at: '2026-11-24T12:00:00Z',
    updated_at: '2026-11-24T12:00:00Z',
    current_user_role: 'contributor',
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
    name: 'User Story',
    estimate_unit: 'story_points',
    position: 0,
    allowed_child_type_ids: ['t2'],
    created_at: '2026-11-24T12:00:00Z',
  },
  {
    id: 't2',
    project_id: 'p1',
    name: 'Task',
    estimate_unit: 'hours',
    position: 1,
    allowed_child_type_ids: [],
    created_at: '2026-11-24T12:00:00Z',
  },
  {
    id: 't3',
    project_id: 'p1',
    name: 'Epic',
    estimate_unit: 'none',
    position: 2,
    allowed_child_type_ids: ['t1'],
    created_at: '2026-11-24T12:00:00Z',
  },
];

interface WorkItemDtoStub {
  id: string;
  organization_id: string;
  project_id: string;
  work_item_type_id: string;
  status_id: string;
  parent_id: string | null;
  assignee_id: string | null;
  assignee_username: string;
  assignee_name: string;
  title: string;
  description: string;
  priority: string;
  story_points: number | null;
  hours: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  current_user_role: string;
}

function workItemDto(overrides: Partial<WorkItemDtoStub> = {}): WorkItemDtoStub {
  return {
    id: 'wi1',
    organization_id: 'o1',
    project_id: 'p1',
    work_item_type_id: 't1',
    status_id: 's1',
    parent_id: null,
    assignee_id: null,
    assignee_username: '',
    assignee_name: '',
    title: 'Implement OAuth',
    description: 'Support SSO flow',
    priority: 'high',
    story_points: 5,
    hours: null,
    created_by: 'u1',
    created_at: '2026-11-25T08:00:00Z',
    updated_at: '2026-11-25T08:00:00Z',
    current_user_role: 'contributor',
    ...overrides,
  };
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  return typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {};
}

function pageOf(items: object[], page = 1, totalPages = 1) {
  return Response.json({ items, page, total_pages: totalPages });
}

describe('Work Items on ProjectPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a Work Item, switches to Board view, filters and transitions Status', async () => {
    const user = userEvent.setup();
    let items = [workItemDto()];

    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto()),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: workItemTypes }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': () => pageOf(items),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20&priority=urgent': () =>
        pageOf(items.filter((i) => i.priority === 'urgent')),
      'POST /api/v1/projects/p1/work-items': ({ body }) => {
        const parsed = parseBody(body);
        const created = workItemDto({
          id: 'wi2',
          work_item_type_id: parsed.work_item_type_id as string,
          parent_id: (parsed.parent_id as string | null | undefined) ?? null,
          title: parsed.title as string,
          priority: parsed.priority as string,
          story_points: null,
          hours: (parsed.hours as number | null | undefined) ?? null,
        });
        items = [created, ...items];
        return Response.json(created, { status: 201 });
      },
      'POST /api/v1/work-items/wi1/transitions': () => {
        items = items.map((i) => (i.id === 'wi1' ? { ...i, status_id: 's2' } : i));
        return Response.json(items.find((i) => i.id === 'wi1'));
      },
    });

    renderRoute('/projects/p1');
    expect(
      await screen.findByRole('heading', { name: 'Core Platform', level: 1 }),
    ).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Implement OAuth' });
    expect(link).toHaveAttribute('href', '/work-items/wi1');
    expect(screen.getByText('5 pts')).toBeInTheDocument();

    // Create a Task child under the User Story with Hours estimate
    await user.click(screen.getByRole('button', { name: 'New Work Item' }));
    const form = screen.getByRole('form', { name: 'New Work Item' });
    await user.type(within(form).getByLabelText('Title'), 'Write unit tests');
    await user.selectOptions(within(form).getByLabelText('Work Item Type'), 't2');
    await user.selectOptions(within(form).getByLabelText('Priority'), 'urgent');
    await user.type(within(form).getByLabelText('Hours'), '3');
    await user.selectOptions(within(form).getByLabelText('Parent'), 'wi1');
    await user.click(within(form).getByRole('button', { name: 'Create Work Item' }));

    expect(await screen.findByRole('link', { name: 'Write unit tests' })).toBeInTheDocument();
    expect(screen.getByText('3 h')).toBeInTheDocument();

    // Switch to Board view and transition Status
    await user.click(screen.getByRole('button', { name: 'Board' }));
    const board = await screen.findByRole('region', { name: 'Work Items board' });
    expect(within(board).getByRole('heading', { name: 'Backlog' })).toBeInTheDocument();
    await user.selectOptions(within(board).getByLabelText('Status for Implement OAuth'), 's2');
    expect(
      within(within(board).getByRole('region', { name: 'In Progress' })).getByRole('link', {
        name: 'Implement OAuth',
      }),
    ).toBeInTheDocument();

    // Filter by Priority
    await user.click(screen.getByRole('button', { name: 'List' }));
    await user.selectOptions(screen.getByLabelText('Filter by Priority'), 'urgent');
    expect(await screen.findByRole('link', { name: 'Write unit tests' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Implement OAuth' })).not.toBeInTheDocument();
  });

  it('hides creation and transition controls from Workspace Viewers', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto({ current_user_role: 'viewer' })),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: workItemTypes }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': pageOf([
        workItemDto({ current_user_role: 'viewer' }),
      ]),
    });

    renderRoute('/projects/p1');
    expect(await screen.findByRole('link', { name: 'Implement OAuth' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Work Item' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status for Implement OAuth')).not.toBeInTheDocument();
  });
});

describe('WorkItemPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('edits details, transitions status, assigns/unassigns and deletes a Work Item', async () => {
    const user = userEvent.setup();
    let current = workItemDto();
    const epic = workItemDto({
      id: 'wi-epic',
      work_item_type_id: 't3',
      title: 'Auth Epic',
      story_points: null,
    });

    stubApi({
      ...signedIn,
      'GET /api/v1/work-items/wi1': () => Response.json(current),
      'GET /api/v1/work-items/wi1/links': Response.json({ items: [] }),
      'GET /api/v1/projects/p1': Response.json(projectDto()),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: workItemTypes }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': () => pageOf([current, epic]),
      'PATCH /api/v1/work-items/wi1': ({ body }) => {
        const patch = parseBody(body);
        current = {
          ...current,
          ...(patch.title !== undefined ? { title: patch.title as string } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority as string } : {}),
          ...(patch.story_points !== undefined
            ? { story_points: patch.story_points as number }
            : {}),
          ...(patch.parent_id !== undefined ? { parent_id: patch.parent_id as string | null } : {}),
          ...('assignee_id' in patch
            ? {
                assignee_id: patch.assignee_id as string | null,
                assignee_username: patch.assignee_id ? 'ada' : '',
                assignee_name: patch.assignee_id ? 'Ada' : '',
              }
            : {}),
        };
        return Response.json(current);
      },
      'POST /api/v1/work-items/wi1/transitions': () => {
        current = { ...current, status_id: 's2' };
        return Response.json(current);
      },
      'DELETE /api/v1/work-items/wi1': new Response(null, { status: 204 }),
    });

    renderRoute('/work-items/wi1');
    expect(
      await screen.findByRole('heading', { name: 'Implement OAuth', level: 1 }),
    ).toBeInTheDocument();

    // Update details
    const form = screen.getByRole('form', { name: 'Work Item details' });
    await user.clear(within(form).getByLabelText('Title'));
    await user.type(within(form).getByLabelText('Title'), 'Implement OIDC');
    await user.selectOptions(within(form).getByLabelText('Priority'), 'urgent');
    await user.selectOptions(within(form).getByLabelText('Parent'), 'wi-epic');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await within(form).findByRole('status')).toHaveTextContent('Changes saved.');
    expect(screen.getByRole('heading', { name: 'Implement OIDC', level: 1 })).toBeInTheDocument();

    // Transition status
    await user.selectOptions(screen.getByLabelText('Status'), 's2');
    expect(screen.getByLabelText('Status')).toHaveValue('s2');

    // Assign to me & unassign
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));
    expect(await screen.findByRole('button', { name: 'Unassign' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(await screen.findByText('Unassigned')).toBeInTheDocument();

    // Delete navigates back to ProjectPage
    await user.click(screen.getByRole('button', { name: 'Delete Work Item' }));
    expect(
      await screen.findByRole('heading', { name: 'Core Platform', level: 1 }),
    ).toBeInTheDocument();
  });

  it('renders read-only mode for Viewers and reports 404 errors', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/work-items/wi1': Response.json(workItemDto({ current_user_role: 'viewer' })),
      'GET /api/v1/work-items/wi1/links': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: workItemTypes }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': pageOf([]),
    });

    renderRoute('/work-items/wi1');
    expect(
      await screen.findByRole('heading', { name: 'Implement OAuth', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Work Item' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeDisabled();
  });

  it('displays an alert when the Work Item cannot be found', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/work-items/missing': problem(404, 'not-found', 'Resource not found'),
    });

    renderRoute('/work-items/missing');
    expect(await screen.findByRole('alert')).toHaveTextContent('Resource not found');
  });

  it('surfaces validation and server errors on create and edit', async () => {
    const user = userEvent.setup();
    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto()),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: workItemTypes }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': pageOf([]),
      'POST /api/v1/projects/p1/work-items': problem(422, 'validation-error', 'Invalid', {
        errors: [{ field: 'estimate', code: 'invalid', message: 'estimate must be non-negative' }],
      }),
    });

    renderRoute('/projects/p1');
    await user.click(await screen.findByRole('button', { name: 'New Work Item' }));
    const form = screen.getByRole('form', { name: 'New Work Item' });
    await user.type(within(form).getByLabelText('Title'), 'Bad story');
    await user.click(within(form).getByRole('button', { name: 'Create Work Item' }));
    expect(await within(form).findByText('estimate must be non-negative')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'New Work Item' })).not.toBeInTheDocument();
  });
});
