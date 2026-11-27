import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ProjectEra, ProjectStatus } from '@/features/projects';
import type { WorkItem } from './api/workItemsApi';
import {
  WorkItemsListView,
  WorkItemsTableView,
  WorkItemsTimelineView,
} from './components/WorkItemsLayouts';

const statuses: ProjectStatus[] = [
  {
    id: 's1',
    projectId: 'p1',
    name: 'Planned',
    statusGroup: 'planned',
    position: 0,
    createdAt: '2026-11-24T00:00:00Z',
  },
  {
    id: 's2',
    projectId: 'p1',
    name: 'In Progress',
    statusGroup: 'started',
    position: 1,
    createdAt: '2026-11-24T00:00:00Z',
  },
  {
    id: 's3',
    projectId: 'p1',
    name: 'Done',
    statusGroup: 'completed',
    position: 2,
    createdAt: '2026-11-24T00:00:00Z',
  },
];

const eras: ProjectEra[] = [
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
];

const items: WorkItem[] = [
  {
    id: 'wi1',
    organizationId: 'o1',
    projectId: 'p1',
    workItemTypeId: 't1',
    statusId: 's2',
    parentId: null,
    eraId: 'e1',
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
  },
  {
    id: 'wi2',
    organizationId: 'o1',
    projectId: 'p1',
    workItemTypeId: 't2',
    statusId: 's1',
    parentId: null,
    eraId: null,
    assigneeId: null,
    assigneeUsername: '',
    assigneeName: '',
    title: 'Cursor-based pagination API',
    description: '',
    priority: 'none',
    storyPoints: null,
    hours: 4,
    createdBy: 'u1',
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
    currentUserRole: 'owner',
  },
];

const typeNames = new Map([
  ['t1', 'Epic'],
  ['t2', 'Task'],
]);

const statusNames = new Map([
  ['s1', 'Planned'],
  ['s2', 'In Progress'],
  ['s3', 'Done'],
]);

describe('OpenBoard List, Table and Timeline views', () => {
  it('groups items by status in ListView, supports collapse, selection and quick add', async () => {
    const user = userEvent.setup();
    const onStartCreate = vi.fn();
    const onTransition = vi.fn();

    render(
      <MemoryRouter>
        <WorkItemsListView
          items={items}
          statuses={statuses}
          eras={eras}
          typeNames={typeNames}
          statusNames={statusNames}
          canWrite={true}
          busy={false}
          onTransition={onTransition}
          onStartCreate={onStartCreate}
        />
      </MemoryRouter>,
    );

    const inProgress = screen.getByRole('region', { name: 'In Progress' });
    expect(
      within(inProgress).getByRole('link', { name: 'Custom OpenBoard UI components' }),
    ).toBeInTheDocument();

    // Select a row
    const cb = within(inProgress).getByRole('checkbox', {
      name: 'Select Custom OpenBoard UI components',
    });
    await user.click(cb);
    expect(cb).toBeChecked();

    // Collapse group hides its rows
    await user.click(within(inProgress).getByRole('button', { name: /In Progress/ }));
    expect(
      within(inProgress).queryByRole('link', { name: 'Custom OpenBoard UI components' }),
    ).not.toBeInTheDocument();

    // Trigger Add item on Planned group
    const planned = screen.getByRole('region', { name: 'Planned' });
    await user.click(within(planned).getByRole('button', { name: 'Add item' }));
    expect(onStartCreate).toHaveBeenCalledWith('s1');
  });

  it('supports row selection, select-all and estimate summary in TableView', async () => {
    const user = userEvent.setup();
    const onStartCreate = vi.fn();

    render(
      <MemoryRouter>
        <WorkItemsTableView
          items={items}
          statuses={statuses}
          eras={eras}
          typeNames={typeNames}
          statusNames={statusNames}
          canWrite={true}
          busy={false}
          onTransition={vi.fn()}
          onStartCreate={onStartCreate}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Sum: 8 pts · 4 h')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 items')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Select all work items' }));
    expect(screen.getByText('Showing 2 items · 2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New work item' }));
    expect(onStartCreate).toHaveBeenCalledTimes(1);
  });

  it('renders split-pane TimelineView with zoom scales, Today marker and semantic bars', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <MemoryRouter>
        <WorkItemsTimelineView
          items={items}
          statuses={statuses}
          eras={eras}
          typeNames={typeNames}
          statusNames={statusNames}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Sprint 14' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unscheduled' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="timeline-bar"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-slot="timeline-today-line"]').length).toBeGreaterThan(
      0,
    );

    await user.click(screen.getByRole('button', { name: 'Days' }));
    expect(screen.getByRole('button', { name: 'Days' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Months' }));
    expect(screen.getByRole('button', { name: 'Months' })).toHaveAttribute('aria-pressed', 'true');
  });
});
