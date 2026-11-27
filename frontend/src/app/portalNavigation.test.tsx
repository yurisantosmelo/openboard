import { screen, within } from '@testing-library/react';
import { stubApi, userDto } from '../test/fakeApi';
import { renderRoute } from '../test/renderRoute';

function pageOf(items: object[], page = 1, totalPages = 1) {
  return Response.json({ items, page, total_pages: totalPages });
}

function orgDto(overrides: object = {}) {
  return {
    id: 'o1',
    name: 'Acme',
    created_at: '2026-11-24T12:00:00Z',
    current_user_role: 'owner',
    ...overrides,
  };
}

function workspaceDto(overrides: object = {}) {
  return {
    id: 'w1',
    organization_id: 'o1',
    name: 'Product',
    visibility: 'open',
    created_at: '2026-11-24T12:00:00Z',
    updated_at: '2026-11-24T12:00:00Z',
    current_user_role: 'owner',
    ...overrides,
  };
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

function projectShellStubs(project: ReturnType<typeof projectDto>) {
  return {
    [`GET /api/v1/projects/${project.id}`]: Response.json(project),
    [`GET /api/v1/projects/${project.id}/statuses`]: Response.json({
      items: [
        {
          id: 's1',
          project_id: project.id,
          name: 'To Do',
          status_group: 'planned',
          position: 0,
          created_at: '2026-11-24T12:00:00Z',
        },
      ],
    }),
    [`GET /api/v1/projects/${project.id}/work-item-types`]: Response.json({
      items: [
        {
          id: 't1',
          project_id: project.id,
          name: 'Task',
          estimate_unit: 'hours',
          position: 0,
          allowed_child_type_ids: [],
          created_at: '2026-11-24T12:00:00Z',
        },
      ],
    }),
    [`GET /api/v1/projects/${project.id}/transition-rules`]: Response.json({ items: [] }),
    [`GET /api/v1/projects/${project.id}/eras`]: Response.json({ items: [] }),
    [`GET /api/v1/projects/${project.id}/views`]: Response.json({ items: [] }),
    [`GET /api/v1/projects/${project.id}/teams`]: Response.json({ items: [] }),
    [`GET /api/v1/projects/${project.id}/work-items?page=1&page_size=20`]: pageOf([]),
    [`GET /api/v1/workspaces/${project.workspace_id}/teams`]: Response.json({ items: [] }),
  };
}

describe('Role-separated Management Portal and Work Shell', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('lands Administrators on the Portal, supports creating Workspaces & Projects, and opens a clean Project shell with a Portal link', async () => {
    const p1 = projectDto({ id: 'p1', name: 'Core Platform' });
    const p2 = projectDto({ id: 'p2', name: 'Mobile App' });
    let workspaces = [workspaceDto({ id: 'w1', name: 'Product' })];

    const fetchMock = stubApi({
      'GET /api/v1/users/me': Response.json(userDto({ is_administrator: true })),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([orgDto()]),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': () => pageOf(workspaces),
      'POST /api/v1/workspaces': () => {
        const created = workspaceDto({ id: 'w2', name: 'QA Lab', visibility: 'restricted' });
        workspaces = [...workspaces, created];
        return Response.json(created, { status: 201 });
      },
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([p1]),
      'GET /api/v1/projects?workspace_id=w2&page=1&page_size=20': pageOf([]),
      'POST /api/v1/projects': Response.json(
        projectDto({ id: 'p2', workspace_id: 'w2', name: 'Mobile App' }),
        { status: 201 },
      ),
      ...projectShellStubs(p1),
      ...projectShellStubs(projectDto({ id: 'p2', workspace_id: 'w2', name: 'Mobile App' })),
    });

    const { user, router } = renderRoute('/');

    // Administrator stays on Portal at / (never auto-redirected into a Board)
    expect(
      await screen.findByRole('heading', { name: 'Organizations', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('button', { name: 'New Organization' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage Users' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Core Platform' })).toBeInTheDocument();

    // Create a Workspace directly from the Portal
    await user.click(screen.getByRole('button', { name: 'New Workspace in Acme' }));
    const wsDialog = await screen.findByRole('dialog');
    await user.type(within(wsDialog).getByLabelText('Name'), 'QA Lab');
    await user.click(within(wsDialog).getByRole('button', { name: 'Create Workspace' }));

    expect(await screen.findByRole('link', { name: 'QA Lab' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces',
      expect.objectContaining({ method: 'POST' }),
    );

    // Create a Project inside QA Lab from the Portal -> opens the new Project Board
    await user.click(screen.getByRole('button', { name: 'New Project in QA Lab' }));
    const projDialog = await screen.findByRole('dialog');
    await user.type(within(projDialog).getByLabelText('Name'), p2.name);
    await user.click(within(projDialog).getByRole('button', { name: 'Create Project' }));

    expect(await screen.findByRole('heading', { name: 'Board', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/p2');

    // Inside Project shell: no structural management clutter, only a link back to Portal in user menu
    expect(screen.queryByRole('button', { name: 'New Project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Workspace & Teams' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Administrator' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Management Portal' }));
    expect(
      await screen.findByRole('heading', { name: 'Organizations', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/organizations');
  });

  it('scopes the Portal for Workspace Owners to only the Workspaces they manage', async () => {
    const ownedWs = workspaceDto({ id: 'w2', name: 'Engineering', current_user_role: 'owner' });
    const contribWs = workspaceDto({
      id: 'w1',
      name: 'Marketing',
      current_user_role: 'contributor',
    });
    const engProject = projectDto({ id: 'p2', workspace_id: 'w2', name: 'API Gateway' });

    stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u2', name: 'Marina', username: 'marina', is_administrator: false }),
      ),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([
        orgDto({ id: 'o1', name: 'Acme', current_user_role: 'contributor' }),
      ]),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': pageOf([contribWs, ownedWs]),
      'GET /api/v1/projects?workspace_id=w2&page=1&page_size=20': pageOf([engProject]),
    });

    const { router } = renderRoute('/');

    expect(
      await screen.findByRole('heading', { name: 'Organizations', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('button', { name: 'New Organization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Workspace in Acme' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage Users' })).not.toBeInTheDocument();

    expect(await screen.findByRole('link', { name: 'Engineering' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Project in Engineering' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'API Gateway' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Marketing' })).not.toBeInTheDocument();
  });

  it('sends Contributors straight to their Project, blocks /organizations, and lets them switch Projects in the sidebar without header dropdowns when in a single Workspace', async () => {
    const p1 = projectDto({ id: 'p1', name: 'Core Platform', current_user_role: 'contributor' });
    const p2 = projectDto({ id: 'p2', name: 'Design System', current_user_role: 'contributor' });

    stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u3', name: 'Bruno', username: 'bruno', is_administrator: false }),
      ),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([
        orgDto({ id: 'o1', name: 'Acme', current_user_role: 'contributor' }),
      ]),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': pageOf([
        workspaceDto({ id: 'w1', name: 'Product', current_user_role: 'contributor' }),
      ]),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([p1, p2]),
      ...projectShellStubs(p1),
      ...projectShellStubs(p2),
    });

    const { user, router } = renderRoute('/organizations');

    // Redirected away from /organizations straight into first Project
    expect(await screen.findByRole('heading', { name: 'Board', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/p1');

    // No Portal link, no management actions, no switcher dropdowns for single Org/Workspace
    expect(screen.queryByRole('link', { name: 'Management Portal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch Organization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch Workspace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Project' })).not.toBeInTheDocument();

    // Switch between Projects of the same Workspace via sidebar
    await user.click(await screen.findByRole('link', { name: 'Design System' }));
    expect(router.state.location.pathname).toBe('/projects/p2');
  });

  it('shows read-only Organization/Workspace switchers when a Contributor belongs to multiple Workspaces', async () => {
    const p1 = projectDto({
      id: 'p1',
      workspace_id: 'w1',
      name: 'Core Platform',
      current_user_role: 'contributor',
    });
    const p2 = projectDto({
      id: 'p2',
      workspace_id: 'w2',
      name: 'Brand Kit',
      current_user_role: 'contributor',
    });

    stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u3', name: 'Bruno', username: 'bruno', is_administrator: false }),
      ),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([
        orgDto({ id: 'o1', name: 'Acme', current_user_role: 'contributor' }),
      ]),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': pageOf([
        workspaceDto({ id: 'w1', name: 'Product', current_user_role: 'contributor' }),
        workspaceDto({ id: 'w2', name: 'Design', current_user_role: 'contributor' }),
      ]),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([p1]),
      'GET /api/v1/projects?workspace_id=w2&page=1&page_size=20': pageOf([p2]),
      ...projectShellStubs(p1),
      ...projectShellStubs(p2),
    });

    const { user, router } = renderRoute('/projects/p1');
    await screen.findByRole('heading', { name: 'Board', level: 1 });

    // Single Org -> no Org switcher; two Workspaces -> read-only Workspace switcher
    expect(screen.queryByRole('button', { name: 'Switch Organization' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Switch Workspace' }));
    expect(screen.queryByRole('menuitem', { name: 'Add Workspace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Workspace & Teams' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('menuitem', { name: 'Design' }));
    expect(router.state.location.pathname).toBe('/projects/p2');
  });

  it('shows a clean read-only empty state when a Contributor has no Projects yet', async () => {
    stubApi({
      'GET /api/v1/users/me': Response.json(
        userDto({ id: 'u3', name: 'Bruno', username: 'bruno', is_administrator: false }),
      ),
      'GET /api/v1/organizations?page=1&page_size=20': pageOf([
        orgDto({ id: 'o1', name: 'Acme', current_user_role: 'contributor' }),
      ]),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': pageOf([
        workspaceDto({ id: 'w1', name: 'Product', current_user_role: 'contributor' }),
      ]),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': pageOf([]),
    });

    renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Welcome, Bruno' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'There are no active Projects in your Workspace yet. Ask a Workspace Owner to create one.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Organization' })).not.toBeInTheDocument();
  });
});
