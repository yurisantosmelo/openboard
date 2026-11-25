import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-xl border px-3.5 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-2.5 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      surface: {
        default: '',
        glass: 'alert-glass',
      },
      variant: {
        default: 'bg-card text-card-foreground dark:bg-input/32 [&>svg]:text-muted-foreground',
        destructive:
          'border-error/32 bg-error-surface text-error-foreground [&>svg]:text-error *:data-[slot=alert-description]:text-error-foreground/90',
        info: 'border-info/32 bg-info/4 text-info-foreground [&>svg]:text-info',
        success: 'border-success/32 bg-success/4 text-success-foreground [&>svg]:text-success',
        warning:
          'border-warning/32 bg-warning-surface text-warning-foreground [&>svg]:text-warning *:data-[slot=alert-description]:text-warning-foreground/90',
      },
    },
    defaultVariants: {
      surface: 'default',
      variant: 'default',
    },
  },
);

export function Alert({
  className,
  variant,
  surface,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? 'default'}
      className={cn(alertVariants({ variant, surface }), className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}
