import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

const signedInAdmin = {
  'GET /api/v1/users/me': Response.json(
    userDto({ id: 'u1', username: 'admin', name: 'Admin', is_administrator: true }),
  ),
};

describe('Lifecycle (Archived & Pending Deletion) UI', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows archived Workspaces and restores Pending Deletion Organizations and Workspaces', async () => {
    const user = userEvent.setup();
    let pendingOrgs = [
      {
        id: 'o-del',
        name: 'Old Corp',
        created_at: '2026-11-20T12:00:00Z',
        deleted_at: '2026-11-25T12:00:00Z',
        purge_after: '2026-12-25T12:00:00Z',
        current_user_role: 'owner',
      },
    ];
    let pendingWorkspaces = [
      {
        id: 'w-del',
        organization_id: 'o1',
        name: 'Legacy Ops',
        visibility: 'open',
        created_at: '2026-11-20T12:00:00Z',
        updated_at: '2026-11-25T12:00:00Z',
        archived_at: null,
        deleted_at: '2026-11-25T12:00:00Z',
        purge_after: '2026-12-25T12:00:00Z',
        current_user_role: 'owner',
      },
    ];

    stubApi({
      ...signedInAdmin,
      'GET /api/v1/organizations?page=1&page_size=20': Response.json({
        items: [{ id: 'o1', name: 'Acme', current_user_role: 'owner' }],
        page: 1,
        total_pages: 1,
      }),
      'GET /api/v1/organizations?pending_deletion=true&page=1&page_size=20': () =>
        Response.json({ items: pendingOrgs, page: 1, total_pages: 1 }),
      'POST /api/v1/organizations/o-del/restore': () => {
        pendingOrgs = [];
        return Response.json({ id: 'o-del', name: 'Old Corp', current_user_role: 'owner' });
      },
      'GET /api/v1/organizations/o1': Response.json({
        id: 'o1',
        name: 'Acme',
        current_user_role: 'owner',
      }),
      'GET /api/v1/organizations/o1/memberships?page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': Response.json({
        items: [
          {
            id: 'w1',
            organization_id: 'o1',
            name: 'Default',
            visibility: 'open',
            created_at: '2026-11-20T12:00:00Z',
            archived_at: null,
            current_user_role: 'owner',
          },
        ],
        page: 1,
        total_pages: 1,
      }),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20&include_archived=true':
        Response.json({
          items: [
            {
              id: 'w1',
              organization_id: 'o1',
              name: 'Default',
              visibility: 'open',
              created_at: '2026-11-20T12:00:00Z',
              archived_at: null,
              current_user_role: 'owner',
            },
            {
              id: 'w-arch',
              organization_id: 'o1',
              name: 'Old Design',
              visibility: 'open',
              created_at: '2026-11-20T12:00:00Z',
              archived_at: '2026-11-25T10:00:00Z',
              current_user_role: 'owner',
            },
          ],
          page: 1,
          total_pages: 1,
        }),
      'GET /api/v1/workspaces?organization_id=o1&pending_deletion=true&page=1&page_size=20': () =>
        Response.json({ items: pendingWorkspaces, page: 1, total_pages: 1 }),
      'POST /api/v1/workspaces/w-del/restore': () => {
        pendingWorkspaces = [];
        return Response.json({
          id: 'w-del',
          organization_id: 'o1',
          name: 'Legacy Ops',
          visibility: 'open',
          created_at: '2026-11-20T12:00:00Z',
          archived_at: null,
          current_user_role: 'owner',
        });
      },
    });

    // Restore Pending Deletion Organization on HomePage
    renderRoute('/');
    await user.click(await screen.findByRole('button', { name: 'View Pending Deletion' }));
    await user.click(await screen.findByRole('button', { name: 'Restore Organization Old Corp' }));
    expect(await screen.findByText('No Organizations in Pending Deletion.')).toBeInTheDocument();

    // Navigate to OrganizationPage -> Show archived Workspace + restore Pending Deletion Workspace
    await user.click(screen.getByRole('link', { name: 'Acme' }));
    await user.click(await screen.findByRole('button', { name: 'Show archived' }));
    expect(await screen.findByRole('link', { name: 'Old Design' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View Pending Deletion' }));
    await user.click(await screen.findByRole('button', { name: 'Restore Workspace Legacy Ops' }));
    expect(await screen.findByText('No Workspaces in Pending Deletion.')).toBeInTheDocument();
  });

  it('archives and restores a Project and enforces read-only mode on ProjectPage', async () => {
    const user = userEvent.setup();
    let archivedAt: string | null = null;

    stubApi({
      ...signedInAdmin,
      'GET /api/v1/projects/p1': () =>
        Response.json({
          id: 'p1',
          organization_id: 'o1',
          workspace_id: 'w1',
          name: 'Core Platform',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-24T12:00:00Z',
          archived_at: archivedAt,
          workspace_archived: false,
          is_read_only: Boolean(archivedAt),
          current_user_role: 'owner',
        }),
      'POST /api/v1/projects/p1/archive': () => {
        archivedAt = '2026-11-25T15:00:00Z';
        return Response.json({
          id: 'p1',
          organization_id: 'o1',
          workspace_id: 'w1',
          name: 'Core Platform',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-25T15:00:00Z',
          archived_at: archivedAt,
          workspace_archived: false,
          is_read_only: true,
          current_user_role: 'owner',
        });
      },
      'POST /api/v1/projects/p1/unarchive': () => {
        archivedAt = null;
        return Response.json({
          id: 'p1',
          organization_id: 'o1',
          workspace_id: 'w1',
          name: 'Core Platform',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-25T15:01:00Z',
          archived_at: null,
          workspace_archived: false,
          is_read_only: false,
          current_user_role: 'owner',
        });
      },
      'GET /api/v1/projects/p1/statuses': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/views': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/teams': Response.json({ items: [] }),
      'GET /api/v1/workspaces/w1/teams': Response.json({ items: [] }),
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
    });

    renderRoute('/projects/p1');
    await user.click(await screen.findByRole('button', { name: 'Configure' }));
    const configPanel = screen.getByRole('complementary', { name: 'Project configuration' });
    await user.click(within(configPanel).getByRole('tab', { name: 'Settings' }));
    await user.click(within(configPanel).getByRole('button', { name: 'Archive Project' }));

    expect(await screen.findByText('This Project is Archived and read-only.')).toBeInTheDocument();
    expect(
      within(configPanel).queryByRole('form', { name: 'Project settings' }),
    ).not.toBeInTheDocument();

    await user.click(within(configPanel).getByRole('button', { name: 'Restore Project' }));
    expect(
      await within(configPanel).findByRole('form', { name: 'Project settings' }),
    ).toBeInTheDocument();
  });
});
