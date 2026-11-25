import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('rounded-sm bg-muted-foreground/15 motion-safe:animate-skeleton', className)}
      {...props}
    />
  );
}

export { Skeleton };
