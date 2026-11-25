import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

const signedIn = { 'GET /api/v1/users/me': Response.json(userDto()) };

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  return typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {};
}

const project = {
  id: 'p1',
  organization_id: 'o1',
  workspace_id: 'w1',
  name: 'Core Platform',
  created_at: '2026-11-24T12:00:00Z',
  updated_at: '2026-11-24T12:00:00Z',
  current_user_role: 'contributor',
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
];

const types = [
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

describe('Project Eras and Work Item Links', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates, starts, closes and deletes Eras on ProjectPage', async () => {
    const user = userEvent.setup();
    let eras = [
      {
        id: 'e2',
        project_id: 'p1',
        name: 'Era 2',
        goal: 'Scale',
        start_date: '2026-11-15',
        end_date: '2026-11-28',
        state: 'planned',
        closed_at: null as string | null,
        created_at: '2026-11-24T12:00:00Z',
        updated_at: '2026-11-24T12:00:00Z',
      },
    ];

    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(project),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: types }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/views': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/teams': Response.json({ items: [] }),
      'GET /api/v1/workspaces/w1/teams': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/eras': () => Response.json({ items: eras }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
      'POST /api/v1/projects/p1/eras': ({ body }) => {
        const parsed = parseBody(body);
        const created = {
          id: 'e1',
          project_id: 'p1',
          name: parsed.name as string,
          goal: (parsed.goal as string | undefined) ?? '',
          start_date: parsed.start_date as string,
          end_date: parsed.end_date as string,
          state: 'planned',
          closed_at: null,
          created_at: '2026-11-25T10:00:00Z',
          updated_at: '2026-11-25T10:00:00Z',
        };
        eras = [created, ...eras];
        return Response.json(created, { status: 201 });
      },
      'POST /api/v1/projects/p1/eras/e1/start': () => {
        eras = eras.map((e) => (e.id === 'e1' ? { ...e, state: 'active' } : e));
        return Response.json(eras.find((e) => e.id === 'e1'));
      },
      'POST /api/v1/projects/p1/eras/e1/close': () => {
        eras = eras.map((e) =>
          e.id === 'e1' ? { ...e, state: 'completed', closed_at: '2026-11-14T12:00:00Z' } : e,
        );
        return Response.json(eras.find((e) => e.id === 'e1'));
      },
      'DELETE /api/v1/projects/p1/eras/e2': () => {
        eras = eras.filter((e) => e.id !== 'e2');
        return new Response(null, { status: 204 });
      },
    });

    renderRoute('/projects/p1');
    expect(
      await screen.findByRole('heading', { name: 'Core Platform', level: 1 }),
    ).toBeInTheDocument();

    const erasSection = screen.getByRole('region', { name: 'Eras' });
    await user.click(within(erasSection).getByRole('button', { name: 'New Era' }));
    const createForm = screen.getByRole('form', { name: 'New Era' });
    await user.type(within(createForm).getByLabelText('Name'), 'Era 1');
    await user.type(within(createForm).getByLabelText('Goal'), 'MVP');
    await user.type(within(createForm).getByLabelText('Start date'), '2026-11-01');
    await user.type(within(createForm).getByLabelText('End date'), '2026-11-14');
    await user.click(within(createForm).getByRole('button', { name: 'Create Era' }));
    expect(await within(erasSection).findByText('Era 1')).toBeInTheDocument();

    // Start Era 1 -> Close Era 1 into Era 2 -> Delete Planned Era 2
    await user.click(within(erasSection).getByRole('button', { name: 'Start Era Era 1' }));
    const closeBtn = await within(erasSection).findByRole('button', { name: 'Close Era Era 1' });
    await user.click(closeBtn);
    const closeForm = screen.getByRole('form', { name: 'Close Era Era 1' });
    await user.click(within(closeForm).getByRole('button', { name: 'Confirm close' }));
    expect(await within(erasSection).findByText('Completed')).toBeInTheDocument();

    await user.click(within(erasSection).getByRole('button', { name: 'Delete Era Era 2' }));
    expect(within(erasSection).queryByText('Era 2')).not.toBeInTheDocument();
  });

  it('adds, renders directional labels, removes Links and assigns Era on WorkItemPage', async () => {
    const user = userEvent.setup();
    let item1 = {
      id: 'wi1',
      organization_id: 'o1',
      project_id: 'p1',
      work_item_type_id: 't1',
      status_id: 's1',
      parent_id: null,
      era_id: null as string | null,
      assignee_id: null,
      title: 'Auth API',
      description: '',
      priority: 'medium',
      story_points: null,
      hours: 4,
      created_by: 'u1',
      created_at: '2026-11-25T08:00:00Z',
      updated_at: '2026-11-25T08:00:00Z',
      current_user_role: 'contributor',
    };
    const item2 = { ...item1, id: 'wi2', title: 'Login UI' };
    let links = [
      {
        id: 'l-in',
        project_id: 'p1',
        source_work_item_id: 'wi2',
        source_title: 'Login UI',
        target_work_item_id: 'wi1',
        target_title: 'Auth API',
        kind: 'blocks',
        created_at: '2026-11-25T09:00:00Z',
      },
    ];

    stubApi({
      ...signedIn,
      'GET /api/v1/work-items/wi1': () => Response.json(item1),
      'GET /api/v1/work-items/wi1/links': () => Response.json({ items: links }),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: types }),
      'GET /api/v1/projects/p1/eras': Response.json({
        items: [
          {
            id: 'e1',
            project_id: 'p1',
            name: 'Era 1',
            goal: '',
            start_date: '2026-11-01',
            end_date: '2026-11-14',
            state: 'active',
            closed_at: null,
            created_at: '2026-11-25T08:00:00Z',
            updated_at: '2026-11-25T08:00:00Z',
          },
        ],
      }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': Response.json({
        items: [item1, item2],
        page: 1,
        total_pages: 1,
      }),
      'PATCH /api/v1/work-items/wi1': ({ body }) => {
        const patch = parseBody(body);
        item1 = { ...item1, era_id: (patch.era_id as string | null) ?? null };
        return Response.json(item1);
      },
      'POST /api/v1/work-items/wi1/links': ({ body }) => {
        const parsed = parseBody(body);
        const created = {
          id: 'l-new',
          project_id: 'p1',
          source_work_item_id: 'wi1',
          source_title: 'Auth API',
          target_work_item_id: parsed.target_work_item_id as string,
          target_title: 'Login UI',
          kind: parsed.kind as string,
          created_at: '2026-11-25T10:00:00Z',
        };
        links = [...links, created];
        return Response.json(created, { status: 201 });
      },
      'DELETE /api/v1/work-items/wi1/links/l-new': () => {
        links = links.filter((l) => l.id !== 'l-new');
        return new Response(null, { status: 204 });
      },
    });

    renderRoute('/work-items/wi1');
    expect(await screen.findByRole('heading', { name: 'Auth API', level: 1 })).toBeInTheDocument();

    // Assign Era 1
    await user.selectOptions(await screen.findByLabelText('Era'), 'e1');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();

    // Existing incoming Blocks link renders as "Blocked by"
    const linksSection = screen.getByRole('region', { name: 'Links' });
    expect(await within(linksSection).findByText('Blocked by')).toBeInTheDocument();

    // Add a Relates To link and remove it
    await user.click(within(linksSection).getByRole('button', { name: 'Add Link' }));
    const linkForm = screen.getByRole('form', { name: 'New Link' });
    await user.selectOptions(within(linkForm).getByLabelText('Kind'), 'relates_to');
    await user.click(within(linkForm).getByRole('button', { name: 'Add Link' }));
    const removeBtn = await within(linksSection).findByRole('button', {
      name: 'Remove Link Relates To Login UI',
    });
    await user.click(removeBtn);
    expect(within(linksSection).queryByText('Relates To')).not.toBeInTheDocument();
  });
});
