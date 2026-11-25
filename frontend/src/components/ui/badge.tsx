import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-1.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:opacity-80',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground border-border/60',
        destructive: 'bg-destructive text-white',
        error: 'bg-destructive/8 text-destructive-foreground dark:bg-destructive/16',
        info: 'bg-info/8 text-info-foreground dark:bg-info/16',
        success: 'bg-success/8 text-success-foreground dark:bg-success/16',
        warning: 'bg-warning/8 text-warning-foreground dark:bg-warning/16',
        outline: 'border-input bg-background text-foreground dark:bg-input/32',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
