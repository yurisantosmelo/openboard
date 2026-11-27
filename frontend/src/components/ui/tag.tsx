import type { ComponentProps } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TagTone = 'primary' | 'info' | 'success' | 'warning' | 'destructive' | 'neutral';

const DOT_TONES: Record<TagTone, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

export type TagProps = ComponentProps<'span'> & {
  tone?: TagTone;
  onRemove?: () => void;
  removeLabel?: string;
};

export function Tag({
  tone,
  onRemove,
  removeLabel = 'Remove tag',
  className,
  children,
  ...props
}: TagProps) {
  return (
    <span
      data-slot="tag"
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-xs border border-border bg-secondary px-1.5 text-2xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    >
      {tone ? (
        <span
          data-slot="tag-dot"
          className={cn('size-[5px] shrink-0 rounded-full', DOT_TONES[tone])}
          aria-hidden="true"
        />
      ) : null}
      <span>{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="inline-flex size-3.5 cursor-pointer items-center justify-center rounded-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-2.5" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
