import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { InlineTextarea } from '@/components/ui/inline-field';
import type { ProjectEra } from '../../projects';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Quiet collapsible section header matching Penpot 01B / 01C Work Item editor bands. */
export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-2 border-b border-border pb-2 text-left outline-none focus-visible:underline"
      >
        <span className="text-sm font-semibold tracking-tight text-foreground">{title}</span>
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </button>
      {open && children}
    </div>
  );
}

interface MarkdownDescriptionSectionProps {
  id: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
}

const MARKDOWN_TOOLS = [
  { label: 'Bold', symbol: 'B', snippet: '**bold**', className: 'font-semibold' },
  { label: 'Italic', symbol: 'I', snippet: '*italic*', className: 'italic' },
  { label: 'Inline code', symbol: '</>', snippet: '`code`', className: 'font-mono text-3xs' },
  { label: 'Bullet list', symbol: '•', snippet: '\n- ', className: '' },
] as const;

/** Collapsible Description editor with lightweight Markdown insertion controls. */
export function MarkdownDescriptionSection({
  id,
  value,
  disabled,
  placeholder = 'Add context, acceptance criteria, or notes...',
  onChange,
}: MarkdownDescriptionSectionProps) {
  function insertSnippet(snippet: string) {
    if (disabled) return;
    const sep = value.length > 0 && !value.endsWith(' ') && !value.endsWith('\n') ? ' ' : '';
    onChange(`${value}${sep}${snippet}`);
  }

  return (
    <CollapsibleSection title="Description">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="toolbar" aria-label="Formatting">
            {MARKDOWN_TOOLS.map((tool) => (
              <button
                key={tool.label}
                type="button"
                disabled={disabled}
                aria-label={tool.label}
                title={tool.label}
                onClick={() => {
                  insertSnippet(tool.snippet);
                }}
                className={`inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-xs border border-transparent px-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${tool.className}`}
              >
                {tool.symbol}
              </button>
            ))}
          </div>
          <span className="text-2xs font-medium text-primary">Markdown enabled</span>
        </div>

        <label htmlFor={id} className="sr-only">
          Description
        </label>
        <InlineTextarea
          id={id}
          placeholder={placeholder}
          className="min-h-52 text-sm leading-relaxed"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      </div>
    </CollapsibleSection>
  );
}

/** Displays the start and target dates of the selected Era in the Planning & Details sidebar. */
export function EraDateWindow({ era }: { era?: ProjectEra }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-medium text-muted-foreground">Start Date / Target Date</span>
      <div className="grid grid-cols-2 gap-2 px-1.5 py-1 text-xs font-medium text-foreground tabular-nums">
        <span>{era?.startDate ?? '—'}</span>
        <span>{era?.endDate ?? '—'}</span>
      </div>
    </div>
  );
}
