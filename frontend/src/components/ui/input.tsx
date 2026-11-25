import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-input bg-background not-dark:bg-clip-padding px-3 py-1 text-base text-foreground shadow-xs/5 transition-[color,box-shadow,border-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-placeholder disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-64 sm:h-8 sm:text-sm dark:bg-input/32',
        'focus-visible:border-ring focus-visible:shadow-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/24',
        'aria-invalid:border-destructive/64 aria-invalid:shadow-none aria-invalid:ring-destructive/16 dark:aria-invalid:ring-destructive/24',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
