import { BookOpen, Bug, CheckSquare, Layers, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypeVisual {
  icon: LucideIcon;
  badgeClass: string;
}

function resolveTypeVisual(typeName: string): TypeVisual {
  const lower = typeName.trim().toLowerCase();
  if (lower.includes('feature')) {
    return { icon: Sparkles, badgeClass: 'bg-primary/12 text-primary' };
  }
  if (lower.includes('epic')) {
    return { icon: Zap, badgeClass: 'bg-primary/12 text-primary' };
  }
  if (lower.includes('bug')) {
    return { icon: Bug, badgeClass: 'bg-destructive/12 text-destructive' };
  }
  if (lower.includes('task')) {
    return { icon: CheckSquare, badgeClass: 'bg-info/12 text-info' };
  }
  if (lower.includes('story')) {
    return { icon: BookOpen, badgeClass: 'bg-success/12 text-success' };
  }
  return { icon: Layers, badgeClass: 'bg-primary/12 text-primary' };
}

export interface WorkItemTypeIconProps {
  typeName: string;
  className?: string;
}

/** Crisp Lucide icon badge representing a Work Item Type (Feature, Story, Bug, Task, Epic, or custom). */
export function WorkItemTypeIcon({ typeName, className }: WorkItemTypeIconProps) {
  const { icon: Icon, badgeClass } = resolveTypeVisual(typeName);
  return (
    <span
      data-slot="work-item-type-icon"
      data-work-item-type={typeName}
      title={typeName}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-xs',
        badgeClass,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
    </span>
  );
}
