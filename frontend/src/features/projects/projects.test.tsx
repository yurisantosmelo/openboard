import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { problem, stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

const signedIn = { 'GET /api/v1/users/me': Response.json(userDto()) };

function projectDto(overrides: object = {}) {
  return {
    id: 'p1',
    organization_id: 'o1',
    workspace_id: 'w2',
    name: 'Core Platform',
    created_at: '2026-11-24T12:00:00Z',
    updated_at: '2026-11-24T12:00:00Z',
    current_user_role: 'owner',
    ...overrides,
  };
}

function workspaceDto(overrides: object = {}) {
  return {
    id: 'w2',
    organization_id: 'o1',
    name: 'Engineering',
    visibility: 'restricted',
    created_at: '2026-11-20T12:00:00Z',
    current_user_role: 'owner',
    ...overrides,
  };
}

function pageOf(items: object[], page = 1, totalPages = 1) {
  return Response.json({ items, page, total_pages: totalPages });
}

const defaultStatuses = [
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
    name: 'Done',
    status_group: 'completed',
    position: 1,
    created_at: '2026-11-24T12:00:00Z',
  },
];

const defaultWorkItemTypes = [
  {
    id: 't1',
    project_id: 'p1',
    name: 'Epic',
    estimate_unit: 'none',
    position: 0,
    allowed_child_type_ids: ['t2'],
    created_at: '2026-11-24T12:00:00Z',
  },
  {
    id: 't2',
    project_id: 'p1',
    name: 'User Story',
    estimate_unit: 'story_points',
    position: 1,
    allowed_child_type_ids: ['t3'],
    created_at: '2026-11-24T12:00:00Z',
  },
  {
    id: 't3',
    project_id: 'p1',
    name: 'Task',
    estimate_unit: 'hours',
    position: 2,
    allowed_child_type_ids: [],
    created_at: '2026-11-24T12:00:00Z',
  },
];

describe('Projects on WorkspacePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists and creates Projects for Workspace Owners and reports conflicts', async () => {
    const user = userEvent.setup();
    let created = false;
    let firstAttempt = true;

    stubApi({
      ...signedIn,
      'GET /api/v1/workspaces/w2': Response.json(workspaceDto()),
      'GET /api/v1/workspaces/w2/memberships?page=1&page_size=20': pageOf([]),
      'GET /api/v1/projects?workspace_id=w2&page=1&page_size=20': () =>
        pageOf(created ? [projectDto()] : []),
      'POST /api/v1/projects': () => {
        if (firstAttempt) {
          firstAttempt = false;
          return problem(409, 'project-name-taken', 'Project name already in use');
        }
        created = true;
        return Response.json(projectDto(), { status: 201 });
      },
    });

    renderRoute('/workspaces/w2');
    expect(await screen.findByText('No Projects yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New Project' }));
    const form = screen.getByRole('form', { name: 'New Project' });
    await user.type(within(form).getByLabelText('Name'), 'Core Platform');
    await user.click(within(form).getByRole('button', { name: 'Create Project' }));
    expect(
      await within(form).findByText('A Project with this name already exists in this Workspace.'),
    ).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Create Project' }));
    const link = await screen.findByRole('link', { name: 'Core Platform' });
    expect(link).toHaveAttribute('href', '/projects/p1');
  });

  it('shows server error alert and lets the Owner cancel creation', async () => {
    const user = userEvent.setup();
    stubApi({
      ...signedIn,
      'GET /api/v1/workspaces/w2': Response.json(workspaceDto()),
      'GET /api/v1/workspaces/w2/memberships?page=1&page_size=20': pageOf([]),
      'GET /api/v1/projects?workspace_id=w2&page=1&page_size=20': pageOf([]),
      'POST /api/v1/projects': problem(500, 'internal-error', 'Server failure'),
    });

    renderRoute('/workspaces/w2');
    await user.click(await screen.findByRole('button', { name: 'New Project' }));
    const form = screen.getByRole('form', { name: 'New Project' });
    await user.type(within(form).getByLabelText('Name'), 'Core');
    await user.click(within(form).getByRole('button', { name: 'Create Project' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Server failure');

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'New Project' })).not.toBeInTheDocument();
  });

  it('hides New Project from non-owners', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/workspaces/w2': Response.json(workspaceDto({ current_user_role: 'viewer' })),
      'GET /api/v1/projects?workspace_id=w2&page=1&page_size=20': pageOf([]),
    });

    renderRoute('/workspaces/w2');
    expect(
      await screen.findByText('Projects created in this Workspace will appear here.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Project' })).not.toBeInTheDocument();
  });
});

describe('ProjectPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('displays default Statuses, Work Item Types and allows Workspace Owner to rename', async () => {
    const user = userEvent.setup();
    let failOnce = true;

    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto()),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: defaultStatuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: defaultWorkItemTypes }),
      'GET /api/v1/projects?workspace_id=w2&page=1&page_size=20': pageOf([]),
      'PATCH /api/v1/projects/p1': () => {
        if (failOnce) {
          failOnce = false;
          return problem(422, 'validation-error', 'Invalid', {
            errors: [{ field: 'name', code: 'invalid', message: 'name is invalid' }],
          });
        }
        return Response.json(projectDto({ name: 'Platform v2' }));
      },
    });

    renderRoute('/projects/p1');
    expect(
      await screen.findByRole('heading', { name: 'Core Platform', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Not Committed')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(await screen.findByText('Children: User Story')).toBeInTheDocument();
    expect(screen.getByText('No children')).toBeInTheDocument();
    expect(screen.getByText('Story Points')).toBeInTheDocument();
    expect(screen.getByText('Hours')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Workspace' })).toHaveAttribute(
      'href',
      '/workspaces/w2',
    );

    const form = screen.getByRole('form', { name: 'Project settings' });
    await user.clear(within(form).getByLabelText('Name'));
    await user.type(within(form).getByLabelText('Name'), 'Platform v2');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await within(form).findByText('name is invalid')).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByRole('heading', { name: 'Platform v2', level: 1 }),
    ).toBeInTheDocument();
    expect(await within(form).findByRole('status')).toHaveTextContent('Changes saved.');
  });

  it('hides Settings from Contributors and reports API errors', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto({ current_user_role: 'contributor' })),
      'GET /api/v1/projects/p1/statuses': problem(500, 'internal-error', 'Statuses unavailable'),
      'GET /api/v1/projects/p1/work-item-types': problem(
        500,
        'internal-error',
        'Types unavailable',
      ),
    });

    renderRoute('/projects/p1');
    expect(
      await screen.findByRole('heading', { name: 'Core Platform', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Project settings' })).not.toBeInTheDocument();
    expect(await screen.findByText('Statuses unavailable.')).toBeInTheDocument();
    expect(await screen.findByText('Types unavailable.')).toBeInTheDocument();
  });

  it('reports a Project that cannot be opened', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': problem(404, 'not-found', 'Resource not found'),
    });

    renderRoute('/projects/p1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Resource not found');
  });

  it('shows non-field error alert on rename failure', async () => {
    const user = userEvent.setup();
    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto()),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: defaultStatuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: defaultWorkItemTypes }),
      'PATCH /api/v1/projects/p1': problem(500, 'internal-error', 'Rename failed'),
    });

    renderRoute('/projects/p1');
    const form = await screen.findByRole('form', { name: 'Project settings' });
    await user.clear(within(form).getByLabelText('Name'));
    await user.type(within(form).getByLabelText('Name'), 'Platform v2');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Rename failed');
  });
});
