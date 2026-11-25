import { screen, waitFor, within } from '@testing-library/react';
import { problem, stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

const ACME = 'o1';
const organizationsUrl = (page = '1') => `GET /api/v1/organizations?page=${page}&page_size=20`;
const workspacesUrl = () => `GET /api/v1/workspaces?organization_id=${ACME}&page=1&page_size=20`;
const membershipsUrl = (page = '1') =>
  `GET /api/v1/organizations/${ACME}/memberships?page=${page}&page_size=20`;
const workspaceMembershipsUrl = (workspaceId = 'w2', page = '1') =>
  `GET /api/v1/workspaces/${workspaceId}/memberships?page=${page}&page_size=20`;
const projectsUrl = (workspaceId = 'w2', page = '1') =>
  `GET /api/v1/projects?workspace_id=${workspaceId}&page=${page}&page_size=20`;

const signedIn = { 'GET /api/v1/users/me': Response.json(userDto()) };

function pageOf(items: object[], page = 1, totalPages = 1) {
  return Response.json({
    items,
    page,
    page_size: 20,
    total_items: items.length,
    total_pages: totalPages,
  });
}

const acme = (role = 'owner') => ({
  id: ACME,
  name: 'Acme',
  created_at: '2026-11-17T12:00:00Z',
  current_user_role: role,
});

const workspaceDto = (overrides: object = {}) => ({
  id: 'w1',
  organization_id: ACME,
  name: 'Default',
  visibility: 'open',
  created_at: '2026-11-17T12:00:00Z',
  updated_at: '2026-11-17T12:00:00Z',
  current_user_role: 'contributor',
  ...overrides,
});

const membershipDto = (overrides: object = {}) => ({
  organization_id: ACME,
  user_id: 'u1',
  username: 'admin',
  name: 'Administrator',
  role: 'owner',
  created_at: '2026-11-17T12:00:00Z',
  ...overrides,
});

const workspaceMembershipDto = (overrides: object = {}) => ({
  workspace_id: 'w2',
  organization_id: ACME,
  user_id: 'u2',
  username: 'ana',
  name: 'Ana Silva',
  role: 'viewer',
  created_at: '2026-11-17T12:00:00Z',
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Organizations on the home page', () => {
  it('lists the Organizations with the role of the signed-in User', async () => {
    stubApi({ ...signedIn, [organizationsUrl()]: pageOf([acme('contributor')]) });
    renderRoute('/');

    const link = await screen.findByRole('link', { name: 'Acme' });
    expect(link).toHaveAttribute('href', `/organizations/${ACME}`);
    expect(screen.getByText('Organization Contributor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('names the Organization Owner role', async () => {
    stubApi({ ...signedIn, [organizationsUrl()]: pageOf([acme()]) });
    renderRoute('/');

    expect(await screen.findByText('Organization Owner')).toBeInTheDocument();
  });

  it('explains when there are no Organizations', async () => {
    stubApi({ ...signedIn, [organizationsUrl()]: pageOf([]) });
    renderRoute('/');

    expect(
      await screen.findByRole('heading', { name: 'No Organizations yet' }),
    ).toBeInTheDocument();
  });

  it('reports a failure to load', async () => {
    stubApi({ ...signedIn, [organizationsUrl()]: problem(500, 'internal-error', 'Unexpected') });
    renderRoute('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected');
  });

  it('moves between pages', async () => {
    stubApi({
      ...signedIn,
      [organizationsUrl()]: pageOf([acme()], 1, 2),
      [organizationsUrl('2')]: pageOf([{ ...acme(), id: 'o2', name: 'Globex' }], 2, 2),
    });
    const { user } = renderRoute('/');

    await screen.findByRole('link', { name: 'Acme' });
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('link', { name: 'Globex' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(await screen.findByRole('link', { name: 'Acme' })).toBeInTheDocument();
  });
});

describe('Creating an Organization', () => {
  const notAdministrator = {
    'GET /api/v1/users/me': Response.json(userDto({ is_administrator: false })),
  };

  it('is not offered to those who are not Administrators', async () => {
    stubApi({ ...notAdministrator, [organizationsUrl()]: pageOf([]) });
    renderRoute('/');

    expect(
      await screen.findByText(
        'You will see an Organization here once an Organization Owner adds you to it.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Organization' })).not.toBeInTheDocument();
  });

  it('invites Administrators to create the first Organization', async () => {
    stubApi({ ...signedIn, [organizationsUrl()]: pageOf([]) });
    renderRoute('/');

    expect(
      await screen.findByText('Create the first Organization to start organizing work.'),
    ).toBeInTheDocument();
  });

  async function openForm(routes: Parameters<typeof stubApi>[0]) {
    const fetchMock = stubApi({ ...signedIn, [organizationsUrl()]: pageOf([]), ...routes });
    const rendered = renderRoute('/');
    await rendered.user.click(await screen.findByRole('button', { name: 'New Organization' }));
    return { fetchMock, ...rendered };
  }

  it('creates the Organization and opens it', async () => {
    const { fetchMock, user } = await openForm({
      'POST /api/v1/organizations': Response.json(acme(), { status: 201 }),
      [`GET /api/v1/organizations/${ACME}`]: Response.json(acme()),
      [workspacesUrl()]: pageOf([workspaceDto()]),
      [membershipsUrl()]: pageOf([membershipDto()]),
    });

    await user.type(screen.getByLabelText('Name'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    expect(await screen.findByRole('heading', { name: 'Acme', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Default' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/organizations',
      expect.objectContaining({ body: JSON.stringify({ name: 'Acme' }) }),
    );
  });

  it('shows an invalid name on the field', async () => {
    const { user } = await openForm({
      'POST /api/v1/organizations': problem(422, 'validation-error', 'Validation failed', {
        errors: [{ field: 'name', code: 'invalid', message: 'name must not be blank' }],
      }),
    });

    await user.type(screen.getByLabelText('Name'), ' ');
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('name must not be blank');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['a refused request', problem(403, 'forbidden', 'Not allowed')],
    ['an unreachable server', undefined],
  ])('reports %s above the form', async (_case, reply) => {
    const { user } = await openForm(reply ? { 'POST /api/v1/organizations': reply } : {});

    await user.type(screen.getByLabelText('Name'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Create Organization' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('closes the form on cancel', async () => {
    const { user } = await openForm({});

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'New Organization' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Organization' })).toBeInTheDocument();
  });
});

describe('Organization page', () => {
  const organizationRoutes = (
    role = 'owner',
    workspaces = [workspaceDto()],
    memberships = [membershipDto()],
  ) => ({
    ...signedIn,
    [`GET /api/v1/organizations/${ACME}`]: Response.json(acme(role)),
    [workspacesUrl()]: pageOf(workspaces),
    ...(role === 'owner' && { [membershipsUrl()]: pageOf(memberships) }),
  });

  it('shows the Workspaces and their visibility', async () => {
    stubApi(
      organizationRoutes('contributor', [
        workspaceDto(),
        workspaceDto({ id: 'w2', name: 'Legal', visibility: 'restricted' }),
      ]),
    );
    renderRoute(`/organizations/${ACME}`);

    expect(await screen.findByRole('heading', { name: 'Acme', level: 1 })).toBeInTheDocument();
    const legal = await screen.findByRole('link', { name: 'Legal' });
    expect(legal).toHaveAttribute('href', '/workspaces/w2');
    expect(within(legal.closest('li') as HTMLElement).getByText('Restricted')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('offers creation only to those who manage the Organization', async () => {
    stubApi(organizationRoutes('contributor'));
    renderRoute(`/organizations/${ACME}`);

    await screen.findByRole('link', { name: 'Default' });
    expect(screen.queryByRole('button', { name: 'New Workspace' })).not.toBeInTheDocument();
  });

  it('explains when no Workspace can be entered', async () => {
    stubApi(organizationRoutes('contributor', []));
    renderRoute(`/organizations/${ACME}`);

    expect(
      await screen.findByRole('heading', { name: 'No Workspaces to show' }),
    ).toBeInTheDocument();
  });

  it('reports an Organization that cannot be seen', async () => {
    stubApi({
      ...signedIn,
      [`GET /api/v1/organizations/${ACME}`]: problem(404, 'not-found', 'Resource not found'),
    });
    renderRoute(`/organizations/${ACME}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Resource not found');
  });

  async function openForm(routes: Parameters<typeof stubApi>[0]) {
    const fetchMock = stubApi(routes);
    const rendered = renderRoute(`/organizations/${ACME}`);
    await rendered.user.click(await screen.findByRole('button', { name: 'New Workspace' }));
    return { fetchMock, ...rendered };
  }

  it('creates a Restricted Workspace by default and refreshes the list', async () => {
    let created = false;
    const { fetchMock, user } = await openForm({
      ...organizationRoutes(),
      [workspacesUrl()]: () =>
        pageOf(
          created ? [workspaceDto(), workspaceDto({ id: 'w2', name: 'Legal' })] : [workspaceDto()],
        ),
      'POST /api/v1/workspaces': () => {
        created = true;
        return Response.json(workspaceDto({ id: 'w2', name: 'Legal' }), { status: 201 });
      },
    });

    expect(screen.getByRole('button', { name: 'Restricted' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(screen.getByLabelText('Name'), 'Legal');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    expect(await screen.findByRole('link', { name: 'Legal' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces',
      expect.objectContaining({
        body: JSON.stringify({ organization_id: ACME, name: 'Legal', visibility: 'restricted' }),
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('form', { name: 'New Workspace' })).not.toBeInTheDocument();
    });
  });

  it('creates an Open Workspace when asked', async () => {
    const { fetchMock, user } = await openForm({
      ...organizationRoutes(),
      'POST /api/v1/workspaces': Response.json(workspaceDto(), { status: 201 }),
    });

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Everyone in the Organization can enter.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Sales');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/workspaces',
        expect.objectContaining({
          body: JSON.stringify({ organization_id: ACME, name: 'Sales', visibility: 'open' }),
        }),
      );
    });
  });

  it.each([
    [
      'a name already in use',
      problem(409, 'workspace-name-taken', 'Workspace name already in use'),
      'Another Workspace in this Organization already uses this name.',
    ],
    [
      'an invalid name',
      problem(422, 'validation-error', 'Validation failed', {
        errors: [{ field: 'name', code: 'invalid', message: 'name must not be blank' }],
      }),
      'name must not be blank',
    ],
  ])('shows %s on the field', async (_case, reply, message) => {
    const { user } = await openForm({
      ...organizationRoutes(),
      'POST /api/v1/workspaces': reply,
    });

    await user.type(screen.getByLabelText('Name'), 'Legal');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveAccessibleDescription(message);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['a refused request', problem(403, 'forbidden', 'Not allowed')],
    ['an unreachable server', undefined],
  ])('reports %s above the form', async (_case, reply) => {
    const { user } = await openForm({
      ...organizationRoutes(),
      ...(reply && { 'POST /api/v1/workspaces': reply }),
    });

    await user.type(screen.getByLabelText('Name'), 'Legal');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('closes the form on cancel', async () => {
    const { user } = await openForm(organizationRoutes());

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'New Workspace' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Workspace' })).toBeInTheDocument();
  });
});

describe('Workspace page', () => {
  it('shows the details of the Workspace', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/workspaces/w2': Response.json(
        workspaceDto({ id: 'w2', name: 'Legal', visibility: 'restricted' }),
      ),
      [projectsUrl()]: pageOf([]),
      'GET /api/v1/workspaces/w2/teams': Response.json({ items: [] }),
    });
    renderRoute('/workspaces/w2');

    expect(await screen.findByRole('heading', { name: 'Legal', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Details' })).toHaveTextContent('Restricted');
    expect(screen.getByRole('link', { name: 'Back to Organization' })).toHaveAttribute(
      'href',
      `/organizations/${ACME}`,
    );
  });

  it('reports a Workspace that cannot be entered', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/workspaces/w2': problem(404, 'not-found', 'Resource not found'),
    });
    renderRoute('/workspaces/w2');

    expect(await screen.findByRole('alert')).toHaveTextContent('Resource not found');
  });
});

describe('Workspace settings', () => {
  const legalDto = (overrides: object = {}) =>
    workspaceDto({
      id: 'w2',
      name: 'Legal',
      visibility: 'restricted',
      current_user_role: 'owner',
      ...overrides,
    });

  async function openSettings(routes: Parameters<typeof stubApi>[0] = {}) {
    const fetchMock = stubApi({
      ...signedIn,
      'GET /api/v1/workspaces/w2': Response.json(legalDto()),
      [projectsUrl()]: pageOf([]),
      'GET /api/v1/workspaces/w2/teams': Response.json({ items: [] }),
      [workspaceMembershipsUrl()]: pageOf([]),
      ...routes,
    });
    const rendered = renderRoute('/workspaces/w2');
    await screen.findByRole('form', { name: 'Workspace settings' });
    return { fetchMock, ...rendered };
  }

  it.each(['contributor', 'viewer'])('is not shown to a Workspace %s', async (role) => {
    stubApi({
      ...signedIn,
      'GET /api/v1/workspaces/w2': Response.json(legalDto({ current_user_role: role })),
      [projectsUrl()]: pageOf([]),
      'GET /api/v1/workspaces/w2/teams': Response.json({ items: [] }),
    });
    renderRoute('/workspaces/w2');

    await screen.findByRole('heading', { name: 'Legal', level: 1 });
    expect(screen.queryByRole('form', { name: 'Workspace settings' })).not.toBeInTheDocument();
  });

  it('saves only what changed and shows the result', async () => {
    const { fetchMock, user } = await openSettings({
      'PATCH /api/v1/workspaces/w2': Response.json(legalDto({ name: 'Legal team' })),
      [workspacesUrl()]: pageOf([]),
    });
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Legal team');
    await user.click(save);

    expect(await screen.findByRole('status')).toHaveTextContent('Changes saved.');
    expect(screen.getByRole('heading', { name: 'Legal team', level: 1 })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/w2',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Legal team' }) }),
    );
    expect(save).toBeDisabled();
  });

  it('changes the visibility', async () => {
    const { fetchMock, user } = await openSettings({
      'PATCH /api/v1/workspaces/w2': Response.json(legalDto({ visibility: 'open' })),
      [workspacesUrl()]: pageOf([]),
    });
    const settings = screen.getByRole('form', { name: 'Workspace settings' });

    await user.click(within(settings).getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Changes saved.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/w2',
      expect.objectContaining({ body: JSON.stringify({ visibility: 'open' }) }),
    );
  });

  it('shows a name already in use on the field', async () => {
    const { user } = await openSettings({
      'PATCH /api/v1/workspaces/w2': problem(409, 'workspace-name-taken', 'Taken'),
    });

    await user.type(screen.getByLabelText('Name'), ' team');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveAccessibleDescription(
        'Another Workspace in this Organization already uses this name.',
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports other failures above the form', async () => {
    const { user } = await openSettings({
      'PATCH /api/v1/workspaces/w2': problem(403, 'forbidden', 'Not allowed'),
    });

    await user.type(screen.getByLabelText('Name'), ' team');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed');
  });
});

describe('Organization Memberships', () => {
  const routes = (role = 'owner', memberships = [membershipDto()]) => ({
    ...signedIn,
    [`GET /api/v1/organizations/${ACME}`]: Response.json(acme(role)),
    [workspacesUrl()]: pageOf([workspaceDto()]),
    ...(role === 'owner' && { [membershipsUrl()]: pageOf(memberships) }),
  });

  async function openForm(overrides: Parameters<typeof stubApi>[0] = {}) {
    const fetchMock = stubApi({ ...routes(), ...overrides });
    const rendered = renderRoute(`/organizations/${ACME}`);
    await rendered.user.click(await screen.findByRole('button', { name: 'Add person' }));
    return { fetchMock, ...rendered };
  }

  it('is not shown to an Organization Contributor', async () => {
    stubApi(routes('contributor'));
    renderRoute(`/organizations/${ACME}`);

    await screen.findByRole('link', { name: 'Default' });
    expect(
      screen.queryByRole('heading', { name: 'Organization Memberships' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add person' })).not.toBeInTheDocument();
  });

  it('lists Organization Memberships and moves between pages', async () => {
    stubApi({
      ...routes(),
      [membershipsUrl()]: pageOf([membershipDto()], 1, 2),
      [membershipsUrl('2')]: pageOf(
        [
          membershipDto({
            user_id: 'u2',
            username: 'ana.silva',
            name: 'Ana Silva',
            role: 'contributor',
          }),
        ],
        2,
        2,
      ),
    });
    const { user } = renderRoute(`/organizations/${ACME}`);

    const section = (
      await screen.findByRole('heading', { name: 'Organization Memberships' })
    ).closest('section') as HTMLElement;
    expect(await within(section).findByText('Administrator')).toBeInTheDocument();
    expect(within(section).getByText('@admin')).toBeInTheDocument();
    expect(within(section).getByText('Organization Owner')).toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Next' }));

    expect(await within(section).findByText('Ana Silva')).toBeInTheDocument();
    expect(within(section).getByText('@ana.silva')).toBeInTheDocument();
    expect(within(section).getByText('Organization Contributor')).toBeInTheDocument();
  });

  it('adds a new User, shows the Temporary Password once and lets the Owner dismiss it', async () => {
    let added = false;
    const ana = membershipDto({
      user_id: 'u2',
      username: 'ana.silva',
      name: 'Ana Silva',
      role: 'contributor',
    });
    const { fetchMock, user } = await openForm({
      [membershipsUrl()]: () => pageOf(added ? [membershipDto(), ana] : [membershipDto()]),
      [`POST /api/v1/organizations/${ACME}/memberships`]: () => {
        added = true;
        return Response.json(
          { ...ana, temporary_password: 'one-time-secret-pass' },
          { status: 201 },
        );
      },
    });
    const form = screen.getByRole('form', { name: 'Add Organization Membership' });

    expect(within(form).getByRole('button', { name: 'Organization Contributor' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(within(form).getByLabelText('Name'), 'Ana Silva');
    await user.type(within(form).getByLabelText('Username'), 'ana.silva');
    await user.click(within(form).getByRole('button', { name: 'Add person' }));

    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('one-time-secret-pass');
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/organizations/${ACME}/memberships`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'ana.silva',
          name: 'Ana Silva',
          role: 'contributor',
        }),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('one-time-secret-pass')).not.toBeInTheDocument();
  });

  it('links an existing User as Organization Owner without showing a Temporary Password', async () => {
    const { fetchMock, user } = await openForm({
      [`POST /api/v1/organizations/${ACME}/memberships`]: Response.json(
        membershipDto({ user_id: 'u2', username: 'ana', name: 'Ana', role: 'owner' }),
        { status: 201 },
      ),
    });
    const form = screen.getByRole('form', { name: 'Add Organization Membership' });

    await user.type(within(form).getByLabelText('Name'), 'Ana');
    await user.type(within(form).getByLabelText('Username'), 'ana');
    await user.click(within(form).getByRole('button', { name: 'Organization Owner' }));
    await user.click(within(form).getByRole('button', { name: 'Add person' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('form', { name: 'Add Organization Membership' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/organizations/${ACME}/memberships`,
      expect.objectContaining({
        body: JSON.stringify({ username: 'ana', name: 'Ana', role: 'owner' }),
      }),
    );
  });

  it.each([
    [
      'a User already in the Organization',
      problem(409, 'organization-membership-exists', 'Already belongs'),
      'Username',
      'This User already belongs to this Organization.',
    ],
    [
      'a Deactivated User',
      problem(409, 'user-deactivated', 'A Deactivated User cannot receive new Memberships'),
      'Username',
      'A Deactivated User cannot receive new Memberships.',
    ],
    [
      'an invalid Username',
      problem(422, 'validation-error', 'Validation failed', {
        errors: [{ field: 'username', code: 'invalid', message: 'invalid username' }],
      }),
      'Username',
      'invalid username',
    ],
    [
      'an invalid Name',
      problem(422, 'validation-error', 'Validation failed', {
        errors: [{ field: 'name', code: 'invalid', message: 'invalid name' }],
      }),
      'Name',
      'invalid name',
    ],
  ])('shows %s on the field', async (_case, reply, fieldLabel, message) => {
    const { user } = await openForm({
      [`POST /api/v1/organizations/${ACME}/memberships`]: reply,
    });
    const form = screen.getByRole('form', { name: 'Add Organization Membership' });

    await user.type(within(form).getByLabelText('Name'), 'Ana');
    await user.type(within(form).getByLabelText('Username'), 'ana');
    await user.click(within(form).getByRole('button', { name: 'Add person' }));

    await waitFor(() => {
      expect(within(form).getByLabelText(fieldLabel)).toHaveAccessibleDescription(message);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['a refused request', problem(403, 'forbidden', 'Not allowed')],
    ['an unreachable server', undefined],
  ])('reports %s above the form', async (_case, reply) => {
    const { user } = await openForm(
      reply ? { [`POST /api/v1/organizations/${ACME}/memberships`]: reply } : {},
    );
    const form = screen.getByRole('form', { name: 'Add Organization Membership' });

    await user.type(within(form).getByLabelText('Name'), 'Ana');
    await user.type(within(form).getByLabelText('Username'), 'ana');
    await user.click(within(form).getByRole('button', { name: 'Add person' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('closes the form on cancel', async () => {
    const { user } = await openForm();
    const form = screen.getByRole('form', { name: 'Add Organization Membership' });

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('form', { name: 'Add Organization Membership' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add person' })).toBeInTheDocument();
  });

  it('changes a Membership role and refreshes the list', async () => {
    const ana = membershipDto({
      user_id: 'u2',
      username: 'ana',
      name: 'Ana',
      role: 'contributor',
    });
    let anaRole: 'contributor' | 'owner' = 'contributor';
    const fetchMock = stubApi({
      ...routes(),
      [membershipsUrl()]: () => pageOf([membershipDto(), { ...ana, role: anaRole }]),
      [`PATCH /api/v1/organizations/${ACME}/memberships/u2`]: () => {
        anaRole = 'owner';
        return Response.json({ ...ana, role: 'owner' });
      },
      [`PATCH /api/v1/organizations/${ACME}/memberships/u1`]: Response.json(
        membershipDto({ role: 'contributor' }),
      ),
    });
    const { user } = renderRoute(`/organizations/${ACME}`);

    await user.click(await screen.findByRole('button', { name: 'Make Organization Owner: Ana' }));
    expect(
      await screen.findByRole('button', { name: 'Make Organization Contributor: Ana' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/organizations/${ACME}/memberships/u2`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'owner' }) }),
    );

    await user.click(
      screen.getByRole('button', { name: 'Make Organization Contributor: Administrator' }),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/organizations/${ACME}/memberships/u1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ role: 'contributor' }),
        }),
      );
    });
  });

  it('removes a Membership and refreshes the list', async () => {
    const ana = membershipDto({
      user_id: 'u2',
      username: 'ana',
      name: 'Ana',
      role: 'contributor',
    });
    let removed = false;
    const fetchMock = stubApi({
      ...routes(),
      [membershipsUrl()]: () => pageOf(removed ? [membershipDto()] : [membershipDto(), ana]),
      [`DELETE /api/v1/organizations/${ACME}/memberships/u2`]: () => {
        removed = true;
        return new Response(null, { status: 204 });
      },
    });
    const { user } = renderRoute(`/organizations/${ACME}`);

    await user.click(await screen.findByRole('button', { name: 'Remove Ana' }));

    await waitFor(() => {
      expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/organizations/${ACME}/memberships/u2`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('reports when the last Organization Owner cannot be demoted or removed', async () => {
    const lastOwner = problem(
      409,
      'last-organization-owner',
      'An Organization must keep at least one Organization Owner',
    );
    stubApi({
      ...routes(),
      [`PATCH /api/v1/organizations/${ACME}/memberships/u1`]: lastOwner,
      [`DELETE /api/v1/organizations/${ACME}/memberships/u1`]: lastOwner,
    });
    const { user } = renderRoute(`/organizations/${ACME}`);

    await user.click(
      await screen.findByRole('button', {
        name: 'Make Organization Contributor: Administrator',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An Organization must keep at least one Organization Owner.',
    );

    await user.click(screen.getByRole('button', { name: 'Remove Administrator' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An Organization must keep at least one Organization Owner.',
    );
  });
});

describe('Workspace Memberships', () => {
  const legal = (role = 'owner') =>
    workspaceDto({
      id: 'w2',
      name: 'Legal',
      visibility: 'restricted',
      current_user_role: role,
    });

  const routes = (role = 'owner', memberships = [workspaceMembershipDto()]) => ({
    ...signedIn,
    'GET /api/v1/workspaces/w2': Response.json(legal(role)),
    [projectsUrl()]: pageOf([]),
    'GET /api/v1/workspaces/w2/teams': Response.json({ items: [] }),
    ...(role === 'owner' && { [workspaceMembershipsUrl()]: pageOf(memberships) }),
  });

  async function openForm(overrides: Parameters<typeof stubApi>[0] = {}) {
    const fetchMock = stubApi({ ...routes(), ...overrides });
    const rendered = renderRoute('/workspaces/w2');
    await rendered.user.click(await screen.findByRole('button', { name: 'Add person' }));
    return { fetchMock, ...rendered };
  }

  it.each(['contributor', 'viewer'])('is not shown to a Workspace %s', async (role) => {
    stubApi(routes(role));
    renderRoute('/workspaces/w2');

    await screen.findByRole('heading', { name: 'Legal', level: 1 });
    expect(
      screen.queryByRole('heading', { name: 'Workspace Memberships' }),
    ).not.toBeInTheDocument();
  });

  it('lists Workspace Memberships and moves between pages', async () => {
    stubApi({
      ...routes(),
      [workspaceMembershipsUrl()]: pageOf([workspaceMembershipDto()], 1, 2),
      [workspaceMembershipsUrl('w2', '2')]: pageOf(
        [
          workspaceMembershipDto({
            user_id: 'u3',
            username: 'bruno',
            name: 'Bruno',
            role: 'contributor',
          }),
        ],
        2,
        2,
      ),
    });
    const { user } = renderRoute('/workspaces/w2');

    const section = (await screen.findByRole('heading', { name: 'Workspace Memberships' })).closest(
      'section',
    ) as HTMLElement;
    expect(await within(section).findByText('Ana Silva')).toBeInTheDocument();
    expect(within(section).getByText('@ana')).toBeInTheDocument();
    expect(
      within(section).getByRole('button', { name: 'Set Ana Silva as Workspace Viewer' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(section).getByRole('button', { name: 'Next' }));
    expect(await within(section).findByText('Bruno')).toBeInTheDocument();
  });

  it('adds a User from the Organization and refreshes the list', async () => {
    const bruno = workspaceMembershipDto({
      user_id: 'u3',
      username: 'bruno',
      name: 'Bruno',
      role: 'owner',
    });
    let added = false;
    const { fetchMock, user } = await openForm({
      [workspaceMembershipsUrl()]: () =>
        pageOf(added ? [workspaceMembershipDto(), bruno] : [workspaceMembershipDto()]),
      'POST /api/v1/workspaces/w2/memberships': () => {
        added = true;
        return Response.json(bruno, { status: 201 });
      },
    });
    const form = screen.getByRole('form', { name: 'Add Workspace Membership' });

    expect(within(form).getByRole('button', { name: 'Workspace Contributor' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(within(form).getByLabelText('Username'), 'bruno');
    await user.click(within(form).getByRole('button', { name: 'Workspace Owner' }));
    await user.click(within(form).getByRole('button', { name: 'Add person' }));

    expect(await screen.findByText('Bruno')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/w2/memberships',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'bruno', role: 'owner' }),
      }),
    );
  });

  it.each([
    [
      'a User already in the Workspace',
      problem(409, 'workspace-membership-exists', 'Already belongs'),
      'This User already belongs to this Workspace.',
    ],
    [
      'a Deactivated User',
      problem(409, 'user-deactivated', 'A Deactivated User cannot receive new Memberships'),
      'A Deactivated User cannot receive new Memberships.',
    ],
    [
      'a User outside the Organization',
      problem(422, 'validation-error', 'Validation failed', {
        errors: [
          {
            field: 'username',
            code: 'not_found',
            message: 'user does not belong to this organization',
          },
        ],
      }),
      'user does not belong to this organization',
    ],
  ])('shows %s on the Username field', async (_case, reply, message) => {
    const { user } = await openForm({ 'POST /api/v1/workspaces/w2/memberships': reply });
    const form = screen.getByRole('form', { name: 'Add Workspace Membership' });

    await user.type(within(form).getByLabelText('Username'), 'carla');
    await user.click(within(form).getByRole('button', { name: 'Add person' }));

    await waitFor(() => {
      expect(within(form).getByLabelText('Username')).toHaveAccessibleDescription(message);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['a refused request', problem(403, 'forbidden', 'Not allowed')],
    ['an unreachable server', undefined],
  ])('reports %s above the form', async (_case, reply) => {
    const { user } = await openForm(
      reply ? { 'POST /api/v1/workspaces/w2/memberships': reply } : {},
    );
    const form = screen.getByRole('form', { name: 'Add Workspace Membership' });

    await user.type(within(form).getByLabelText('Username'), 'bruno');
    await user.click(within(form).getByRole('button', { name: 'Add person' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('closes the form on cancel', async () => {
    const { user } = await openForm();
    const form = screen.getByRole('form', { name: 'Add Workspace Membership' });

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('form', { name: 'Add Workspace Membership' }),
    ).not.toBeInTheDocument();
  });

  it('changes a Workspace Membership role and removes a Membership', async () => {
    let role: 'viewer' | 'owner' = 'viewer';
    let removed = false;
    const fetchMock = stubApi({
      ...routes(),
      [workspaceMembershipsUrl()]: () => pageOf(removed ? [] : [workspaceMembershipDto({ role })]),
      'PATCH /api/v1/workspaces/w2/memberships/u2': () => {
        role = 'owner';
        return Response.json(workspaceMembershipDto({ role: 'owner' }));
      },
      'DELETE /api/v1/workspaces/w2/memberships/u2': () => {
        removed = true;
        return new Response(null, { status: 204 });
      },
    });
    const { user } = renderRoute('/workspaces/w2');

    await user.click(
      await screen.findByRole('button', { name: 'Set Ana Silva as Workspace Owner' }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Set Ana Silva as Workspace Owner' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/w2/memberships/u2',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'owner' }) }),
    );

    await user.click(screen.getByRole('button', { name: 'Remove Ana Silva' }));
    await waitFor(() => {
      expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspaces/w2/memberships/u2',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('reports role update and remove failures above the list', async () => {
    stubApi({
      ...routes(),
      'PATCH /api/v1/workspaces/w2/memberships/u2': problem(403, 'forbidden', 'Not allowed'),
      'DELETE /api/v1/workspaces/w2/memberships/u2': problem(404, 'not-found', 'Gone'),
    });
    const { user } = renderRoute('/workspaces/w2');

    await user.click(
      await screen.findByRole('button', { name: 'Set Ana Silva as Workspace Owner' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.');

    await user.click(screen.getByRole('button', { name: 'Remove Ana Silva' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gone.');
  });
});
