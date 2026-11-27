import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectView } from '@/features/projects';
import { BoardSwitcher } from './components/BoardSwitcher';

const sampleViews: ProjectView[] = [
  {
    id: 'v1',
    projectId: 'p1',
    name: 'Platform API',
    layout: 'board',
    visibility: 'shared',
    filters: {},
    createdBy: 'u1',
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
  },
  {
    id: 'v2',
    projectId: 'p1',
    name: 'Design System v2',
    layout: 'list',
    visibility: 'personal',
    filters: { priority: 'high' },
    createdBy: 'u1',
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
  },
];

describe('BoardSwitcher', () => {
  it('opens dropdown, filters boards via search input, and selects a board', async () => {
    const user = userEvent.setup();
    const onSelectView = vi.fn();
    const onRequestCreateBoard = vi.fn();

    render(
      <BoardSwitcher
        projectName="Core Platform"
        views={sampleViews}
        activeViewId={null}
        totalCount={24}
        canWrite={true}
        onSelectView={onSelectView}
        onRequestCreateBoard={onRequestCreateBoard}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch board' }));
    expect(await screen.findByText(/Boards in Core Platform/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Board/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Platform API' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Design System v2' })).toBeInTheDocument();

    const search = screen.getByLabelText('Search boards');
    await user.type(search, 'Design');
    expect(screen.queryByRole('option', { name: 'Platform API' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Design System v2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('option', { name: 'Platform API' })).toBeInTheDocument();

    await user.type(search, 'Nonexistent');
    expect(screen.getByText(/No boards match/i)).toBeInTheDocument();

    await user.clear(search);
    await user.click(screen.getByRole('option', { name: 'Platform API' }));
    expect(onSelectView).toHaveBeenCalledWith(sampleViews[0]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('triggers create new board when writable and hides it for read-only users', async () => {
    const user = userEvent.setup();
    const onRequestCreateBoard = vi.fn();

    const { rerender } = render(
      <BoardSwitcher
        projectName="Core Platform"
        views={sampleViews}
        activeViewId="v1"
        totalCount={18}
        canWrite={true}
        onSelectView={vi.fn()}
        onRequestCreateBoard={onRequestCreateBoard}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch board' }));
    await user.click(await screen.findByRole('button', { name: 'Create new board' }));
    expect(onRequestCreateBoard).toHaveBeenCalledTimes(1);

    rerender(
      <BoardSwitcher
        projectName="Core Platform"
        views={sampleViews}
        activeViewId="v1"
        totalCount={18}
        canWrite={false}
        onSelectView={vi.fn()}
        onRequestCreateBoard={onRequestCreateBoard}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Switch board' }));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create new board' })).not.toBeInTheDocument();
  });
});
