import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

const signedIn = {
  'GET /api/v1/users/me': Response.json(userDto({ id: 'u1', username: 'ada', name: 'Ada' })),
};

interface TeamStub {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface AssignmentStub {
  team_id: string;
  user_id: string;
  username: string;
  name: string;
  created_at: string;
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  return typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {};
}

describe('Workspace Teams, Project Teams and Move Project', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a Team, assigns and removes a User, and deletes a Team on WorkspacePage', async () => {
    const user = userEvent.setup();
    let teams: TeamStub[] = [];
    let assignments: AssignmentStub[] = [];

    stubApi({
      ...signedIn,
      'GET /api/v1/workspaces/w1': Response.json({
        id: 'w1',
        organization_id: 'o1',
        name: 'Engineering',
        visibility: 'open',
        created_at: '2026-11-24T12:00:00Z',
        updated_at: '2026-11-24T12:00:00Z',
        current_user_role: 'owner',
      }),
      'GET /api/v1/projects?workspace_id=w1&page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
      'GET /api/v1/workspaces/w1/memberships?page=1&page_size=20': Response.json({
        items: [
          {
            workspace_id: 'w1',
            organization_id: 'o1',
            user_id: 'u2',
            username: 'grace',
            name: 'Grace Hopper',
            role: 'contributor',
            created_at: '2026-11-24T12:00:00Z',
          },
        ],
        page: 1,
        total_pages: 1,
      }),
      'GET /api/v1/workspaces/w1/teams': () => Response.json({ items: teams }),
      'POST /api/v1/workspaces/w1/teams': ({ body }) => {
        const p = parseBody(body);
        const created: TeamStub = {
          id: 'team-1',
          workspace_id: 'w1',
          name: p.name as string,
          created_at: '2026-11-25T12:00:00Z',
          updated_at: '2026-11-25T12:00:00Z',
        };
        teams = [...teams, created];
        return Response.json(created, { status: 201 });
      },
      'GET /api/v1/workspaces/w1/teams/team-1/assignments': () =>
        Response.json({ items: assignments }),
      'POST /api/v1/workspaces/w1/teams/team-1/assignments': () => {
        const a: AssignmentStub = {
          team_id: 'team-1',
          user_id: 'u2',
          username: 'grace',
          name: 'Grace Hopper',
          created_at: '2026-11-25T12:00:00Z',
        };
        assignments = [...assignments, a];
        return Response.json(a, { status: 201 });
      },
      'DELETE /api/v1/workspaces/w1/teams/team-1/assignments/u2': () => {
        assignments = [];
        return new Response(null, { status: 204 });
      },
      'DELETE /api/v1/workspaces/w1/teams/team-1': () => {
        teams = [];
        return new Response(null, { status: 204 });
      },
    });

    renderRoute('/workspaces/w1');
    const teamsRegion = await screen.findByRole('region', { name: 'Teams' });
    await user.click(within(teamsRegion).getByRole('button', { name: 'New Team' }));
    await user.type(within(teamsRegion).getByLabelText('Team name'), 'Core Squad');
    await user.click(within(teamsRegion).getByRole('button', { name: 'Create Team' }));

    const teamToggle = await within(teamsRegion).findByRole('button', { name: 'Core Squad' });
    await user.click(teamToggle);

    await user.selectOptions(within(teamsRegion).getByLabelText('User for Core Squad'), 'u2');
    await user.click(within(teamsRegion).getByRole('button', { name: 'Assign' }));
    expect(await within(teamsRegion).findByText('Grace Hopper (@grace)')).toBeInTheDocument();

    await user.click(
      within(teamsRegion).getByRole('button', { name: 'Remove Grace Hopper from Core Squad' }),
    );
    expect(
      await within(teamsRegion).findByText('No Users assigned to this Team yet.'),
    ).toBeInTheDocument();

    await user.click(within(teamsRegion).getByRole('button', { name: 'Delete Core Squad' }));
    expect(
      within(teamsRegion).queryByRole('button', { name: 'Core Squad' }),
    ).not.toBeInTheDocument();
  });

  it('associates Project Teams and moves a Project to another Workspace on ProjectPage', async () => {
    const user = userEvent.setup();
    const wsTeam: TeamStub = {
      id: 'team-1',
      workspace_id: 'w1',
      name: 'Backend Squad',
      created_at: '2026-11-25T12:00:00Z',
      updated_at: '2026-11-25T12:00:00Z',
    };
    let projectTeams: TeamStub[] = [];
    let currentWorkspaceId = 'w1';

    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': () =>
        Response.json({
          id: 'p1',
          organization_id: 'o1',
          workspace_id: currentWorkspaceId,
          name: 'Core Platform',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-24T12:00:00Z',
          current_user_role: 'owner',
        }),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/views': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
      'GET /api/v1/workspaces/w1/teams': Response.json({ items: [wsTeam] }),
      'GET /api/v1/workspaces/w2/teams': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/teams': () => Response.json({ items: projectTeams }),
      'POST /api/v1/projects/p1/teams': () => {
        projectTeams = [wsTeam];
        return Response.json(wsTeam, { status: 201 });
      },
      'DELETE /api/v1/projects/p1/teams/team-1': () => {
        projectTeams = [];
        return new Response(null, { status: 204 });
      },
      'GET /api/v1/workspaces?organization_id=o1&page=1&page_size=20': Response.json({
        items: [
          {
            id: 'w1',
            organization_id: 'o1',
            name: 'Engineering',
            visibility: 'open',
            created_at: '2026-11-24T12:00:00Z',
            updated_at: '2026-11-24T12:00:00Z',
            current_user_role: 'owner',
          },
          {
            id: 'w2',
            organization_id: 'o1',
            name: 'Platform',
            visibility: 'open',
            created_at: '2026-11-24T12:00:00Z',
            updated_at: '2026-11-24T12:00:00Z',
            current_user_role: 'owner',
          },
        ],
        page: 1,
        total_pages: 1,
      }),
      'POST /api/v1/projects/p1/move': () => {
        currentWorkspaceId = 'w2';
        projectTeams = [];
        return Response.json({
          id: 'p1',
          organization_id: 'o1',
          workspace_id: 'w2',
          name: 'Core Platform',
          created_at: '2026-11-24T12:00:00Z',
          updated_at: '2026-11-25T12:30:00Z',
          current_user_role: 'owner',
        });
      },
    });

    renderRoute('/projects/p1');
    const ptRegion = await screen.findByRole('region', { name: 'Project Teams' });
    await user.selectOptions(await within(ptRegion).findByLabelText('Team'), 'team-1');
    await user.click(within(ptRegion).getByRole('button', { name: 'Add Team' }));
    expect(await within(ptRegion).findByText('Backend Squad')).toBeInTheDocument();

    const moveForm = await screen.findByRole('form', { name: 'Move Project' });
    await user.selectOptions(within(moveForm).getByLabelText('Destination Workspace'), 'w2');
    await user.click(within(moveForm).getByRole('button', { name: 'Move Project' }));
    expect(await within(moveForm).findByRole('status')).toHaveTextContent('Project moved.');
  });
});
