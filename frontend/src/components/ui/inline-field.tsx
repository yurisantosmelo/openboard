import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const INLINE_FIELD_BASE =
  'rounded-sm border border-transparent bg-transparent transition-[border-color,background-color] outline-none hover:border-input hover:bg-secondary/50 focus-visible:border-ring focus-visible:bg-background focus-within:border-ring focus-within:bg-background';

export function InlineField({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="inline-field"
      className={cn(INLINE_FIELD_BASE, 'px-2 py-1', className)}
      {...props}
    />
  );
}

export function InlineInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="inline-input"
      className={cn(
        INLINE_FIELD_BASE,
        'h-7 w-full min-w-0 px-2 text-sm text-foreground placeholder:text-placeholder disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function InlineTextarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="inline-textarea"
      className={cn(
        INLINE_FIELD_BASE,
        'w-full min-w-0 resize-y px-2 py-1.5 text-sm text-foreground placeholder:text-placeholder disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
