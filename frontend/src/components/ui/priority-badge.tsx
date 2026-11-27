import type { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export type PriorityLevel = 'urgent' | 'high' | 'medium' | 'low' | 'none';

const priorityBadgeVariants = cva(
  'inline-flex h-[18px] w-fit shrink-0 items-center justify-center rounded-xs border px-1.5 text-2xs font-medium whitespace-nowrap',
  {
    variants: {
      priority: {
        urgent: 'border-destructive bg-error-surface text-destructive-foreground',
        high: 'border-warning bg-warning-surface text-warning-foreground',
        medium: 'border-border bg-secondary text-muted-foreground',
        low: 'border-transparent bg-background text-muted-foreground',
        none: 'border-transparent bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: {
      priority: 'none',
    },
  },
);

const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
};

export type PriorityBadgeProps = Omit<ComponentProps<'span'>, 'children'> & {
  priority: PriorityLevel;
  label?: string;
};

export function PriorityBadge({ priority, label, className, ...props }: PriorityBadgeProps) {
  return (
    <span
      data-slot="priority-badge"
      data-priority={priority}
      className={cn(priorityBadgeVariants({ priority }), className)}
      {...props}
    >
      {label ?? PRIORITY_LABELS[priority]}
    </span>
  );
}
