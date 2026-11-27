import type { ComponentProps, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

export type SidebarNavItemTone = 'default' | 'muted';

const sidebarNavItemVariants = cva(
  'group/nav-item flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-sm border px-1.5 pr-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      state: {
        active: 'border-sidebar-border bg-sidebar-row-active font-medium text-sidebar-foreground',
        default:
          'border-transparent bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover',
        muted:
          'border-transparent bg-transparent text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground',
      },
    },
    defaultVariants: {
      state: 'default',
    },
  },
);

export type SidebarNavItemProps = ComponentProps<'button'> & {
  active?: boolean;
  tone?: SidebarNavItemTone;
  count?: number | string;
  asChild?: boolean;
  children?: ReactNode;
};

function IndicatorBar({ active }: { active: boolean }) {
  return (
    <span
      data-slot="sidebar-nav-indicator"
      aria-hidden="true"
      className={cn(
        'h-3.5 w-0.5 shrink-0 rounded-full transition-colors',
        active ? 'bg-primary' : 'bg-input',
      )}
    />
  );
}

export function SidebarNavItem({
  active = false,
  tone = 'default',
  count,
  asChild = false,
  className,
  children,
  type = 'button',
  ...props
}: SidebarNavItemProps) {
  const visualState = active ? 'active' : tone;
  const itemClass = cn(sidebarNavItemVariants({ state: visualState }), className);
  const dataActive = active ? 'true' : undefined;

  if (asChild) {
    return (
      <Slot.Root
        data-slot="sidebar-nav-item"
        data-active={dataActive}
        className={itemClass}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type}
      data-slot="sidebar-nav-item"
      data-active={dataActive}
      aria-current={active ? 'page' : undefined}
      className={itemClass}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <IndicatorBar active={active} />
        <span className="truncate">{children}</span>
      </span>
      {count !== undefined && (
        <span className="shrink-0 text-2xs text-sidebar-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

export function SidebarNavIndicator({ active = false }: { active?: boolean }) {
  return <IndicatorBar active={active} />;
}
