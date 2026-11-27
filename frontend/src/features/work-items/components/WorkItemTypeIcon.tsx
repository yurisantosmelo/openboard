import { BookOpenText, Bug, Crown, FileCheck, Layers, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypeVisual {
  icon: LucideIcon;
  toneClass: string;
}

function resolveTypeVisual(typeName: string): TypeVisual {
  const lower = typeName.trim().toLowerCase();
  if (lower.includes('epic')) {
    return {
      icon: Crown,
      toneClass: 'text-violet-600 fill-violet-500/25 dark:text-violet-400 dark:fill-violet-400/25',
    };
  }
  if (lower.includes('bug')) {
    return {
      icon: Bug,
      toneClass: 'text-rose-600 fill-rose-500/25 dark:text-rose-400 dark:fill-rose-400/25',
    };
  }
  if (lower.includes('feature')) {
    return {
      icon: Trophy,
      toneClass: 'text-amber-600 fill-amber-500/25 dark:text-amber-400 dark:fill-amber-400/25',
    };
  }
  if (lower.includes('task')) {
    return {
      icon: FileCheck,
      toneClass: 'text-sky-600 fill-sky-500/25 dark:text-sky-400 dark:fill-sky-400/25',
    };
  }
  if (lower.includes('story')) {
    return {
      icon: BookOpenText,
      toneClass:
        'text-emerald-600 fill-emerald-500/25 dark:text-emerald-400 dark:fill-emerald-400/25',
    };
  }
  return {
    icon: Layers,
    toneClass: 'text-muted-foreground fill-muted-foreground/20',
  };
}

export interface WorkItemTypeIconProps {
  typeName: string;
  className?: string;
}

/** Distinct duotone Lucide icon per Work Item Type (no background box, tinted stroke + soft interior fill). */
export function WorkItemTypeIcon({ typeName, className }: WorkItemTypeIconProps) {
  const { icon: Icon, toneClass } = resolveTypeVisual(typeName);
  return (
    <span
      data-slot="work-item-type-icon"
      data-work-item-type={typeName}
      title={typeName}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
    >
      <Icon className={cn('size-3.5', toneClass)} aria-hidden="true" />
    </span>
  );
}
