import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const iconButtonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        ghost:
          'border-transparent bg-transparent text-muted-foreground hover:border-input hover:bg-secondary hover:text-foreground',
        outline:
          'border-border bg-card text-muted-foreground hover:border-input hover:bg-secondary hover:text-foreground',
        active: 'border-primary/40 bg-column-planned-surface text-primary',
      },
      size: {
        sm: 'size-6 rounded-xs [&_svg]:size-3.5',
        md: 'size-7 rounded-sm [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  },
);

export type IconButtonProps = Omit<ComponentProps<'button'>, 'aria-label'> &
  VariantProps<typeof iconButtonVariants> & {
    'aria-label': string;
  };

export function IconButton({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      data-slot="icon-button"
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
