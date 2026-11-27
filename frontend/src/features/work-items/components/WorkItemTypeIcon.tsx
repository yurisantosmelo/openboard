import { BookOpen, Bug, CheckSquare, Layers, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypeVisual {
  icon: LucideIcon;
  toneClass: string;
}

function resolveTypeVisual(typeName: string): TypeVisual {
  const lower = typeName.trim().toLowerCase();
  if (lower.includes('feature')) return { icon: Sparkles, toneClass: 'text-primary' };
  if (lower.includes('epic')) return { icon: Zap, toneClass: 'text-primary' };
  if (lower.includes('bug')) return { icon: Bug, toneClass: 'text-destructive' };
  if (lower.includes('task')) return { icon: CheckSquare, toneClass: 'text-info' };
  if (lower.includes('story')) return { icon: BookOpen, toneClass: 'text-success' };
  return { icon: Layers, toneClass: 'text-primary' };
}

export interface WorkItemTypeIconProps {
  typeName: string;
  className?: string;
}

/** Lucide icon representing a Work Item Type (Feature, Story, Bug, Task, Epic, or custom). */
export function WorkItemTypeIcon({ typeName, className }: WorkItemTypeIconProps) {
  const { icon: Icon, toneClass } = resolveTypeVisual(typeName);
  return (
    <span
      data-slot="work-item-type-icon"
      data-work-item-type={typeName}
      title={typeName}
      className={cn('inline-flex shrink-0 items-center justify-center', toneClass, className)}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  );
}
