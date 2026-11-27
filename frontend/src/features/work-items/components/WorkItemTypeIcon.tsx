import { BookOpenText, Bug, Crown, FileCheck, Layers, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypeVisual {
  icon: LucideIcon;
  badgeClass: string;
}

function resolveTypeVisual(typeName: string): TypeVisual {
  const lower = typeName.trim().toLowerCase();
  if (lower.includes('epic')) {
    return {
      icon: Crown,
      badgeClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    };
  }
  if (lower.includes('bug')) {
    return {
      icon: Bug,
      badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    };
  }
  if (lower.includes('feature')) {
    return {
      icon: Trophy,
      badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    };
  }
  if (lower.includes('task')) {
    return {
      icon: FileCheck,
      badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    };
  }
  if (lower.includes('story')) {
    return {
      icon: BookOpenText,
      badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    };
  }
  return {
    icon: Layers,
    badgeClass: 'bg-secondary text-muted-foreground',
  };
}

export interface WorkItemTypeIconProps {
  typeName: string;
  className?: string;
}

/** Distinct Lucide icon & color badge per Work Item Type: Epic (Crown/violet), Bug (Bug/rose), Feature (Trophy/amber), Task (FileCheck/sky), User Story (BookOpenText/emerald). */
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
