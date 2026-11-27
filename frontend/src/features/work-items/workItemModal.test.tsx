import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ProjectStatus, ProjectWorkItemType } from '@/features/projects';
import type { WorkItem } from './api/workItemsApi';
import { CreateWorkItemDialog } from './components/CreateWorkItemForm';
import { WorkItemsBoardView } from './components/WorkItemsBoardView';

const statuses: ProjectStatus[] = [
  {
    id: 's0',
    projectId: 'p1',
    name: 'Backlog',
    statusGroup: 'not_committed',
    position: 0,
    createdAt: '2026-11-24T00:00:00Z',
  },
  {
    id: 's1',
    projectId: 'p1',
    name: 'Planned',
    statusGroup: 'planned',
    position: 1,
    createdAt: '2026-11-24T00:00:00Z',
  },
  {
    id: 's2',
    projectId: 'p1',
    name: 'In Progress',
    statusGroup: 'started',
    position: 2,
    createdAt: '2026-11-24T00:00:00Z',
  },
  {
    id: 's3',
    projectId: 'p1',
    name: 'In Review',
    statusGroup: 'started',
    position: 3,
    createdAt: '2026-11-24T00:00:00Z',
  },
  {
    id: 's4',
    projectId: 'p1',
    name: 'Done',
    statusGroup: 'completed',
    position: 4,
    createdAt: '2026-11-24T00:00:00Z',
  },
];

const types: ProjectWorkItemType[] = [
  {
    id: 't1',
    projectId: 'p1',
    name: 'Epic',
    estimateUnit: 'none',
    position: 0,
    allowedChildTypeIds: [],
    createdAt: '2026-11-24T00:00:00Z',
  },
];

const sampleItem: WorkItem = {
  id: 'wi1',
  organizationId: 'o1',
  projectId: 'p1',
  workItemTypeId: 't1',
  statusId: 's2',
  parentId: null,
  eraId: null,
  assigneeId: 'u1',
  assigneeUsername: 'alfredo',
  assigneeName: 'Alfredo Melo',
  title: 'Custom OpenBoard UI components',
  description: '',
  priority: 'urgent',
  storyPoints: 8,
  hours: null,
  createdBy: 'u1',
  createdAt: '2026-11-25T00:00:00Z',
  updatedAt: '2026-11-25T00:00:00Z',
  currentUserRole: 'owner',
};

describe('BoardColumn semantic tones and WorkItemModal maximize toggle', () => {
  it('renders semantic column tones and assignee full name directly on floating cards', () => {
    const { container } = render(
      <MemoryRouter>
        <WorkItemsBoardView
          items={[sampleItem]}
          statuses={statuses}
          eras={[]}
          typeNames={new Map([['t1', 'Epic']])}
          canWrite={true}
          busy={false}
          onTransition={vi.fn()}
          onStartCreate={vi.fn()}
        />
      </MemoryRouter>,
    );

    const tones = Array.from(container.querySelectorAll('[data-slot="board-column"]')).map((el) =>
      el.getAttribute('data-column-tone'),
    );
    expect(tones).toEqual(['neutral', 'planned', 'in-progress', 'in-review', 'done']);
    expect(screen.getByText('Alfredo Melo')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('toggles WorkItemModal between compact and maximized using icon-only buttons without text labels', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreateWorkItemDialog
            open={true}
            onOpenChange={vi.fn()}
            projectId="p1"
            statuses={statuses}
            workItemTypes={types}
            existingItems={[sampleItem]}
            participants={[{ id: 'u1', name: 'Alfredo Melo', username: 'alfredo' }]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).not.toHaveAttribute('data-maximized');

    const maxBtn = screen.getByRole('button', { name: 'Maximize editor' });
    expect(maxBtn).toHaveTextContent('');
    await user.click(maxBtn);
    expect(dialog).toHaveAttribute('data-maximized', 'true');

    const minBtn = screen.getByRole('button', { name: 'Minimize editor' });
    expect(minBtn).toHaveTextContent('');
    await user.click(minBtn);
    expect(dialog).not.toHaveAttribute('data-maximized');
  });

  it('inserts markdown formatting, displays project and Era dates, and supports Create & Open', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreateWorkItemDialog
            open={true}
            onOpenChange={vi.fn()}
            projectId="p1"
            projectName="Core Platform"
            statuses={statuses}
            workItemTypes={types}
            existingItems={[sampleItem]}
            eras={[
              {
                id: 'e1',
                projectId: 'p1',
                name: 'Sprint 14',
                goal: 'Ship UI',
                startDate: '2026-11-18',
                endDate: '2026-12-01',
                state: 'active',
                closedAt: null,
                createdAt: '2026-11-18T00:00:00Z',
                updatedAt: '2026-11-18T00:00:00Z',
              },
            ]}
            participants={[{ id: 'u1', name: 'Alfredo Melo', username: 'alfredo' }]}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Core Platform')).toBeInTheDocument();
    expect(screen.getByText('Markdown enabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create & Open' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Era'), 'e1');
    expect(screen.getByText('2026-11-18')).toBeInTheDocument();
    expect(screen.getByText('2026-12-01')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(screen.getByLabelText('Description')).toHaveValue('**bold**');

    // Collapsible Planning & Details toggle
    await user.click(screen.getByRole('button', { name: 'Planning & Details' }));
    expect(screen.queryByText('2026-11-18')).not.toBeInTheDocument();
  });
});
