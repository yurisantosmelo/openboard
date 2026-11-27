import type { ProjectStatus, StatusGroup } from '@/features/projects';

export type ColumnToneKey = 'neutral' | 'planned' | 'in-progress' | 'in-review' | 'done';

export interface StatusTone {
  key: ColumnToneKey;
  surface: string;
  dot: string;
}

const TONE_BY_GROUP: Record<StatusGroup, StatusTone> = {
  not_committed: {
    key: 'neutral',
    surface: 'border-column-neutral-border bg-column-neutral-surface',
    dot: 'bg-muted-foreground',
  },
  planned: {
    key: 'planned',
    surface: 'border-column-planned-border bg-column-planned-surface',
    dot: 'bg-info',
  },
  started: {
    key: 'in-progress',
    surface: 'border-column-in-progress-border bg-column-in-progress-surface',
    dot: 'bg-warning',
  },
  completed: {
    key: 'done',
    surface: 'border-column-done-border bg-column-done-surface',
    dot: 'bg-success',
  },
};

const IN_REVIEW_TONE: StatusTone = {
  key: 'in-review',
  surface: 'border-column-in-review-border bg-column-in-review-surface',
  dot: 'bg-primary',
};

export function resolveStatusTone(status?: ProjectStatus): StatusTone {
  if (!status) return TONE_BY_GROUP.not_committed;
  if (status.statusGroup === 'started' && status.name.toLowerCase().includes('review')) {
    return IN_REVIEW_TONE;
  }
  return TONE_BY_GROUP[status.statusGroup];
}

export function typeDotClass(name: string): string {
  const lower = name.trim().toLowerCase();
  if (lower === 'epic') return 'bg-primary';
  if (lower === 'bug') return 'bg-destructive';
  if (lower === 'task') return 'bg-info';
  return 'bg-success';
}

export function initialsOf(name: string, username: string): string {
  const source = (name || username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}
