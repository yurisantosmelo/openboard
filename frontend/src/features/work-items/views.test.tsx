import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

const signedIn = {
  'GET /api/v1/users/me': Response.json(userDto({ id: 'u1', username: 'ada', name: 'Ada' })),
};

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

const types = [
  {
    id: 't1',
    project_id: 'p1',
    name: 'User Story',
    estimate_unit: 'story_points',
    position: 0,
    allowed_child_type_ids: [],
    created_at: '2026-11-24T12:00:00Z',
  },
];

const eras = [
  {
    id: 'e1',
    project_id: 'p1',
    name: 'Era 1',
    goal: 'MVP',
    start_date: '2026-11-01',
    end_date: '2026-11-14',
    state: 'active',
    closed_at: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
];

const workItems = [
  {
    id: 'wi1',
    organization_id: 'o1',
    project_id: 'p1',
    work_item_type_id: 't1',
    status_id: 's1',
    parent_id: null,
    era_id: 'e1',
    assignee_id: null,
    assignee_username: '',
    assignee_name: '',
    title: 'Ship Saved Views',
    description: '',
    priority: 'high',
    story_points: 5,
    hours: null,
    created_by: 'u1',
    created_at: '2026-11-25T08:00:00Z',
    updated_at: '2026-11-25T08:00:00Z',
    current_user_role: 'contributor',
  },
  {
    id: 'wi2',
    organization_id: 'o1',
    project_id: 'p1',
    work_item_type_id: 't1',
    status_id: 's2',
    parent_id: null,
    era_id: null,
    assignee_id: null,
    assignee_username: '',
    assignee_name: '',
    title: 'Backlog Cleanup',
    description: '',
    priority: 'low',
    story_points: 2,
    hours: null,
    created_by: 'u1',
    created_at: '2026-11-26T08:00:00Z',
    updated_at: '2026-11-26T08:00:00Z',
    current_user_role: 'contributor',
  },
];

interface ViewStub {
  id: string;
  project_id: string;
  name: string;
  layout: string;
  visibility: string;
  filters: Record<string, string>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  return typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {};
}

describe('Saved Views and Layouts on ProjectPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('switches across Table, Timeline and Calendar layouts and manages Personal/Shared Views', async () => {
    const user = userEvent.setup();
    let views: ViewStub[] = [];

    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json({
        id: 'p1',
        organization_id: 'o1',
        workspace_id: 'w1',
        name: 'Core Platform',
        created_at: '2026-11-24T12:00:00Z',
        updated_at: '2026-11-24T12:00:00Z',
        current_user_role: 'contributor',
      }),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: types }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: eras }),
      'GET /api/v1/projects/p1/teams': Response.json({ items: [] }),
      'GET /api/v1/workspaces/w1/teams': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/views': () => Response.json({ items: views }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': () =>
        Response.json({ items: workItems, page: 1, total_pages: 1 }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20&priority=high': () =>
        Response.json({ items: [workItems[0]], page: 1, total_pages: 1 }),
      'POST /api/v1/projects/p1/views': ({ body }) => {
        const p = parseBody(body);
        const created: ViewStub = {
          id: 'v1',
          project_id: 'p1',
          name: p.name as string,
          layout: p.layout as string,
          visibility: 'personal',
          filters: (p.filters as Record<string, string> | undefined) ?? {},
          created_by: 'u1',
          created_at: '2026-11-25T12:00:00Z',
          updated_at: '2026-11-25T12:00:00Z',
        };
        views = [...views, created];
        return Response.json(created, { status: 201 });
      },
      'PATCH /api/v1/projects/p1/views/v1': ({ body }) => {
        const p = parseBody(body);
        views = views.map((v) =>
          v.id === 'v1'
            ? {
                ...v,
                ...(p.layout ? { layout: p.layout as string } : {}),
                ...(p.visibility ? { visibility: p.visibility as string } : {}),
                ...(p.filters ? { filters: p.filters as Record<string, string> } : {}),
              }
            : v,
        );
        return Response.json(views[0]);
      },
      'DELETE /api/v1/projects/p1/views/v1': () => {
        views = [];
        return new Response(null, { status: 204 });
      },
    });

    renderRoute('/projects/p1');
    expect(await screen.findByRole('link', { name: 'Ship Saved Views' })).toBeInTheDocument();

    // Switch through Table, Timeline and Calendar layouts
    await user.click(screen.getByRole('button', { name: 'Table' }));
    expect(await screen.findByRole('region', { name: 'Work Items table' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    const timeline = await screen.findByRole('region', { name: 'Work Items timeline' });
    expect(within(timeline).getByRole('heading', { name: 'Era 1' })).toBeInTheDocument();
    expect(within(timeline).getByRole('heading', { name: 'Unscheduled' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('region', { name: 'Work Items calendar' })).toBeInTheDocument();

    // Filter high priority and save as a Personal View
    await user.selectOptions(screen.getByLabelText('Filter by Priority'), 'high');
    const viewsBar = screen.getByRole('region', { name: 'Saved Views' });
    await user.click(within(viewsBar).getByRole('button', { name: 'Save View' }));
    await user.type(within(viewsBar).getByLabelText('View name'), 'High Focus');
    await user.click(within(viewsBar).getByRole('button', { name: 'Save Personal View' }));

    expect(await within(viewsBar).findByRole('button', { name: 'High Focus' })).toBeInTheDocument();

    // Share View, update layout, then delete it
    await user.click(within(viewsBar).getByRole('button', { name: 'Share View' }));
    expect(
      await within(viewsBar).findByRole('button', { name: 'Make Personal' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(within(viewsBar).getByRole('button', { name: 'Update View' }));

    await user.click(within(viewsBar).getByRole('button', { name: 'Delete View' }));
    expect(within(viewsBar).queryByRole('button', { name: 'High Focus' })).not.toBeInTheDocument();
  });

  it('lets Workspace Viewers apply Shared Views without showing edit controls', async () => {
    const user = userEvent.setup();
    const sharedView: ViewStub = {
      id: 'v-shared',
      project_id: 'p1',
      name: 'Team Table',
      layout: 'table',
      visibility: 'shared',
      filters: { priority: 'high' },
      created_by: 'u-other',
      created_at: '2026-11-25T12:00:00Z',
      updated_at: '2026-11-25T12:00:00Z',
    };

    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json({
        id: 'p1',
        organization_id: 'o1',
        workspace_id: 'w1',
        name: 'Core Platform',
        created_at: '2026-11-24T12:00:00Z',
        updated_at: '2026-11-24T12:00:00Z',
        current_user_role: 'viewer',
      }),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: types }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': Response.json({ items: eras }),
      'GET /api/v1/projects/p1/teams': Response.json({ items: [] }),
      'GET /api/v1/workspaces/w1/teams': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/views': Response.json({ items: [sharedView] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': Response.json({
        items: workItems,
        page: 1,
        total_pages: 1,
      }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20&priority=high': Response.json({
        items: [workItems[0]],
        page: 1,
        total_pages: 1,
      }),
    });

    renderRoute('/projects/p1');
    const viewsBar = await screen.findByRole('region', { name: 'Saved Views' });
    expect(within(viewsBar).queryByRole('button', { name: 'Save View' })).not.toBeInTheDocument();

    await user.click(await within(viewsBar).findByRole('button', { name: 'Team Table' }));
    expect(await screen.findByRole('region', { name: 'Work Items table' })).toBeInTheDocument();
    expect(within(viewsBar).queryByRole('button', { name: 'Delete View' })).not.toBeInTheDocument();
  });
});
