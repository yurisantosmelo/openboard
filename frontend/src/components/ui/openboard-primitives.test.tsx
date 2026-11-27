import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Maximize2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarGroup } from './avatar';
import { Button } from './button';
import { IconButton } from './icon-button';
import { InlineField, InlineInput, InlineTextarea } from './inline-field';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';
import { PriorityBadge } from './priority-badge';
import { SearchInput } from './search-input';
import { Tag } from './tag';

describe('OpenBoard Design System primitives', () => {
  it('renders IconButton with required accessible label and variants', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <div>
        <IconButton aria-label="Maximize editor" size="sm" variant="ghost" onClick={onClick}>
          <Maximize2 aria-hidden="true" />
        </IconButton>
        <IconButton aria-label="Filter active" size="md" variant="active">
          <Maximize2 aria-hidden="true" />
        </IconButton>
        <Button variant="active" size="compact">
          Filter 2
        </Button>
      </div>,
    );

    const maxBtn = screen.getByRole('button', { name: 'Maximize editor' });
    await user.click(maxBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Filter active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter 2' })).toHaveAttribute(
      'data-variant',
      'active',
    );
  });

  it('renders SearchInput shortcut when empty and clear button when filled', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { rerender } = render(
      <SearchInput
        aria-label="Global search"
        placeholder="Search work items..."
        shortcut="⌘K"
        value=""
        onChange={() => {}}
        onClear={onClear}
      />,
    );

    expect(screen.getByText('⌘K')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    rerender(
      <SearchInput
        aria-label="Global search"
        placeholder="Search work items..."
        shortcut="⌘K"
        value="CORE-138"
        onChange={() => {}}
        onClear={onClear}
      />,
    );

    expect(screen.queryByText('⌘K')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders PriorityBadge across all levels and custom labels', () => {
    render(
      <div>
        <PriorityBadge priority="urgent" />
        <PriorityBadge priority="high" />
        <PriorityBadge priority="medium" />
        <PriorityBadge priority="low" />
        <PriorityBadge priority="none" />
        <PriorityBadge priority="high" label="P1" />
      </div>,
    );

    expect(screen.getByText('Urgent')).toHaveAttribute('data-priority', 'urgent');
    expect(screen.getByText('High')).toHaveAttribute('data-priority', 'high');
    expect(screen.getByText('Medium')).toHaveAttribute('data-priority', 'medium');
    expect(screen.getByText('Low')).toHaveAttribute('data-priority', 'low');
    expect(screen.getByText('No priority')).toHaveAttribute('data-priority', 'none');
    expect(screen.getByText('P1')).toBeInTheDocument();
  });

  it('renders Tag with optional tone dot and remove button', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { container } = render(
      <div>
        <Tag>Sprint 14</Tag>
        <Tag tone="primary" onRemove={onRemove} removeLabel="Remove Design System">
          Design System
        </Tag>
      </div>,
    );

    expect(screen.getByText('Sprint 14')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="tag-dot"]')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove Design System' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('renders quiet InlineField, InlineInput and InlineTextarea primitives', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InlineField>Core Platform / Frontend</InlineField>
        <InlineInput aria-label="Work item title" defaultValue="Custom UI" />
        <InlineTextarea aria-label="Description" defaultValue="Details" />
      </div>,
    );

    const input = screen.getByLabelText('Work item title');
    expect(input).toHaveClass('border-transparent');
    await user.type(input, ' v2');
    expect(input).toHaveValue('Custom UI v2');

    const area = screen.getByLabelText('Description');
    expect(area).toHaveClass('border-transparent');
    expect(screen.getByText('Core Platform / Frontend')).toHaveClass('border-transparent');
  });

  it('opens and renders Popover content with PopoverAnchor', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverAnchor>
          <span>Anchor</span>
        </PopoverAnchor>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="compact">
            Switch board
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <p>Platform API</p>
        </PopoverContent>
      </Popover>,
    );

    await user.click(screen.getByRole('button', { name: 'Switch board' }));
    expect(await screen.findByText('Platform API')).toBeInTheDocument();
  });

  it('renders circular xs and selected Avatar inside overlapping AvatarGroup', () => {
    const { container } = render(
      <AvatarGroup>
        <Avatar size="xs" selected>
          <AvatarFallback>AM</AvatarFallback>
        </Avatar>
        <Avatar size="sm">
          <AvatarFallback>YS</AvatarFallback>
        </Avatar>
      </AvatarGroup>,
    );

    const avatars = container.querySelectorAll('[data-slot="avatar"]');
    expect(avatars[0]).toHaveAttribute('data-size', 'xs');
    expect(avatars[0]).toHaveAttribute('data-selected', 'true');
    expect(avatars[1]).not.toHaveAttribute('data-selected');
  });
});
