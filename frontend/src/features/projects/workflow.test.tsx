import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { problem, stubApi, userDto } from '../../test/fakeApi';
import { renderRoute } from '../../test/renderRoute';

const signedIn = { 'GET /api/v1/users/me': Response.json(userDto()) };

function projectDto(role: 'owner' | 'contributor' | 'viewer' = 'owner') {
  return {
    id: 'p1',
    organization_id: 'o1',
    workspace_id: 'w1',
    name: 'Core Platform',
    created_at: '2026-11-24T12:00:00Z',
    updated_at: '2026-11-24T12:00:00Z',
    current_user_role: role,
  };
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  return typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : {};
}

describe('Project workflow customization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates, updates and removes Statuses with replacement for Workspace Owners', async () => {
    const user = userEvent.setup();
    let statuses = [
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
      {
        id: 's3',
        project_id: 'p1',
        name: 'Done',
        status_group: 'completed',
        position: 2,
        created_at: '2026-11-24T12:00:00Z',
      },
    ];

    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto('owner')),
      'GET /api/v1/projects/p1/statuses': () => Response.json({ items: statuses }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/transition-rules': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
      'POST /api/v1/projects/p1/statuses': ({ body }) => {
        const parsed = parseBody(body);
        const created = {
          id: 's4',
          project_id: 'p1',
          name: parsed.name as string,
          status_group: parsed.status_group as string,
          position: 3,
          created_at: '2026-11-25T09:00:00Z',
        };
        statuses = [...statuses, created];
        return Response.json(created, { status: 201 });
      },
      'PATCH /api/v1/projects/p1/statuses/s4': ({ body }) => {
        const parsed = parseBody(body);
        statuses = statuses.map((s) =>
          s.id === 's4'
            ? {
                ...s,
                name: parsed.name as string,
                status_group: parsed.status_group as string,
              }
            : s,
        );
        return Response.json(statuses.find((s) => s.id === 's4'));
      },
      'DELETE /api/v1/projects/p1/statuses/s4?replacement_status_id=s1': () => {
        statuses = statuses.filter((s) => s.id !== 's4');
        return new Response(null, { status: 204 });
      },
    });

    renderRoute('/projects/p1');
    expect(
      await screen.findByRole('heading', { name: 'Core Platform', level: 1 }),
    ).toBeInTheDocument();

    // Create Status
    const statusesSection = screen.getByRole('region', { name: 'Statuses' });
    await user.click(await within(statusesSection).findByRole('button', { name: 'New Status' }));
    const createForm = screen.getByRole('form', { name: 'New Status' });
    await user.type(within(createForm).getByLabelText('Name'), 'QA');
    await user.selectOptions(within(createForm).getByLabelText('Status Group'), 'started');
    await user.click(within(createForm).getByRole('button', { name: 'Create Status' }));
    expect(await within(statusesSection).findByText('QA')).toBeInTheDocument();

    // Rename Status
    await user.click(within(statusesSection).getByRole('button', { name: 'Edit Status QA' }));
    const editForm = screen.getByRole('form', { name: 'Edit Status QA' });
    await user.clear(within(editForm).getByLabelText('Name'));
    await user.type(within(editForm).getByLabelText('Name'), 'In Review');
    await user.click(within(editForm).getByRole('button', { name: 'Save Status' }));
    expect(await within(statusesSection).findByText('In Review')).toBeInTheDocument();

    // Remove Status with replacement
    await user.click(
      within(statusesSection).getByRole('button', { name: 'Remove Status In Review' }),
    );
    const removeForm = screen.getByRole('form', { name: 'Remove Status In Review' });
    await user.selectOptions(
      within(removeForm).getByLabelText('Move Work Items from In Review to'),
      's1',
    );
    await user.click(within(removeForm).getByRole('button', { name: 'Confirm remove' }));
    expect(within(statusesSection).queryByText('In Review')).not.toBeInTheDocument();
  });

  it('creates, updates and removes Work Item Types and Transition Rules', async () => {
    const user = userEvent.setup();
    let types = [
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
    ];
    let rules: {
      project_id: string;
      from_status_id: string;
      to_status_id: string;
      created_at: string;
    }[] = [];

    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto('owner')),
      'GET /api/v1/projects/p1/statuses': Response.json({
        items: [
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
        ],
      }),
      'GET /api/v1/projects/p1/work-item-types': () => Response.json({ items: types }),
      'GET /api/v1/projects/p1/transition-rules': () => Response.json({ items: rules }),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
      'POST /api/v1/projects/p1/work-item-types': ({ body }) => {
        const parsed = parseBody(body);
        const created = {
          id: 't3',
          project_id: 'p1',
          name: parsed.name as string,
          estimate_unit: parsed.estimate_unit as string,
          position: 2,
          allowed_child_type_ids: parsed.allowed_child_type_ids as string[],
          created_at: '2026-11-25T09:00:00Z',
        };
        types = [...types, created];
        return Response.json(created, { status: 201 });
      },
      'PATCH /api/v1/projects/p1/work-item-types/t3': ({ body }) => {
        const parsed = parseBody(body);
        types = types.map((t) =>
          t.id === 't3'
            ? {
                ...t,
                name: parsed.name as string,
                allowed_child_type_ids: parsed.allowed_child_type_ids as string[],
              }
            : t,
        );
        return Response.json(types.find((t) => t.id === 't3'));
      },
      'DELETE /api/v1/projects/p1/work-item-types/t3?replacement_type_id=t1': () => {
        types = types.filter((t) => t.id !== 't3');
        return new Response(null, { status: 204 });
      },
      'POST /api/v1/projects/p1/transition-rules': ({ body }) => {
        const parsed = parseBody(body);
        const rule = {
          project_id: 'p1',
          from_status_id: parsed.from_status_id as string,
          to_status_id: parsed.to_status_id as string,
          created_at: '2026-11-25T09:00:00Z',
        };
        rules = [...rules, rule];
        return Response.json(rule, { status: 201 });
      },
      'DELETE /api/v1/projects/p1/transition-rules/s1/s2': () => {
        rules = [];
        return new Response(null, { status: 204 });
      },
    });

    renderRoute('/projects/p1');
    expect(
      await screen.findByRole('heading', { name: 'Core Platform', level: 1 }),
    ).toBeInTheDocument();

    // Create Work Item Type with child checkbox
    const typesSection = screen.getByRole('region', { name: 'Work Item Types' });
    await user.click(
      await within(typesSection).findByRole('button', { name: 'New Work Item Type' }),
    );
    const typeForm = screen.getByRole('form', { name: 'New Work Item Type' });
    await user.type(within(typeForm).getByLabelText('Name'), 'Spike');
    await user.selectOptions(within(typeForm).getByLabelText('Estimate unit'), 'hours');
    await user.click(within(typeForm).getByLabelText('Task'));
    await user.click(within(typeForm).getByRole('button', { name: 'Create Work Item Type' }));
    expect(await within(typesSection).findByText('Spike')).toBeInTheDocument();

    // Edit & Remove Work Item Type
    await user.click(
      within(typesSection).getByRole('button', { name: 'Edit Work Item Type Spike' }),
    );
    const editType = screen.getByRole('form', { name: 'Edit Work Item Type Spike' });
    await user.clear(within(editType).getByLabelText('Name'));
    await user.type(within(editType).getByLabelText('Name'), 'Research');
    await user.click(within(editType).getByRole('button', { name: 'Save Work Item Type' }));
    expect(await within(typesSection).findByText('Research')).toBeInTheDocument();

    await user.click(
      within(typesSection).getByRole('button', { name: 'Remove Work Item Type Research' }),
    );
    const removeType = screen.getByRole('form', { name: 'Remove Work Item Type Research' });
    await user.click(within(removeType).getByRole('button', { name: 'Confirm remove' }));
    expect(within(typesSection).queryByText('Research')).not.toBeInTheDocument();

    // Add and remove Transition Rule
    expect(
      await screen.findByText(
        'No Transition Rules yet. Work Items can move freely between any Statuses.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New Transition Rule' }));
    const ruleForm = screen.getByRole('form', { name: 'New Transition Rule' });
    await user.click(within(ruleForm).getByRole('button', { name: 'Add Transition Rule' }));
    const removeRuleBtn = await screen.findByRole('button', {
      name: 'Remove Transition Rule Backlog to Done',
    });
    await user.click(removeRuleBtn);
    expect(
      await screen.findByText(
        'No Transition Rules yet. Work Items can move freely between any Statuses.',
      ),
    ).toBeInTheDocument();
  });

  it('hides customization controls from Contributors and displays API errors', async () => {
    stubApi({
      ...signedIn,
      'GET /api/v1/projects/p1': Response.json(projectDto('contributor')),
      'GET /api/v1/projects/p1/statuses': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/work-item-types': Response.json({ items: [] }),
      'GET /api/v1/projects/p1/transition-rules': problem(
        500,
        'internal-error',
        'Rules unavailable',
      ),
      'GET /api/v1/projects/p1/work-items?page=1&page_size=20': Response.json({
        items: [],
        page: 1,
        total_pages: 1,
      }),
    });

    renderRoute('/projects/p1');
    expect(
      await screen.findByRole('heading', { name: 'Core Platform', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Work Item Type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Transition Rule' })).not.toBeInTheDocument();
    expect(await screen.findByText('Rules unavailable.')).toBeInTheDocument();
  });
});
