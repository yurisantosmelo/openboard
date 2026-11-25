import { X } from 'lucide-react';
import type { ProjectConfigTab } from '@/app/project-shell-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  PRIORITIES,
  priorityLabels,
  priorityVariants,
} from '../../work-items/components/workItemLabels';
import type { Project } from '../api/projectsApi';
import { ProjectErasCard } from './ProjectErasCard';
import { ProjectSettings } from './ProjectSettings';
import { ProjectTeamsCard } from './ProjectTeamsCard';
import { ProjectWorkflow } from './ProjectWorkflow';

interface ProjectConfigSidebarProps {
  project: Project;
  open: boolean;
  tab: ProjectConfigTab;
  onTabChange: (tab: ProjectConfigTab) => void;
  onClose: () => void;
}

const ALL_TABS: Array<{ id: ProjectConfigTab; label: string; ownerOnly?: boolean }> = [
  { id: 'workflow', label: 'Workflow' },
  { id: 'eras', label: 'Eras' },
  { id: 'teams', label: 'Teams' },
  { id: 'settings', label: 'Settings', ownerOnly: true },
];

function PrioritiesReferenceCard() {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Priorities</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1.5 pt-0">
        {PRIORITIES.map((priority) => (
          <Badge key={priority} variant={priorityVariants[priority]}>
            {priorityLabels[priority]}
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}

function ConfigPanelBody({
  project,
  tab,
  onTabChange,
  onClose,
}: Omit<ProjectConfigSidebarProps, 'open'>) {
  const isOwner = project.currentUserRole === 'owner';
  const visibleTabs = ALL_TABS.filter((t) => !t.ownerOnly || isOwner);
  const activeTab: ProjectConfigTab = tab === 'settings' && !isOwner ? 'workflow' : tab;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">Project Configuration</h2>
          <p className="truncate text-xs text-muted-foreground">{project.name}</p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close configuration sidebar"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Configuration sections"
        className="grid shrink-0 border-b border-border bg-muted/40 p-1.5"
        style={{ gridTemplateColumns: `repeat(${String(visibleTabs.length)}, minmax(0, 1fr))` }}
      >
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeTab === item.id}
            onClick={() => {
              onTabChange(item.id);
            }}
            className={cn(
              'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              activeTab === item.id
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'workflow' && (
          <div className="grid gap-4">
            <ProjectWorkflow projectId={project.id} canManage={isOwner} />
            <PrioritiesReferenceCard />
          </div>
        )}
        {activeTab === 'eras' && <ProjectErasCard project={project} />}
        {activeTab === 'teams' && <ProjectTeamsCard project={project} />}
        {activeTab === 'settings' && isOwner && <ProjectSettings project={project} />}
      </div>
    </div>
  );
}

/** Right configuration sidebar: pushes the canvas on desktop and renders as a drawer on mobile. */
export function ProjectConfigSidebar({
  project,
  open,
  tab,
  onTabChange,
  onClose,
}: ProjectConfigSidebarProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent side="right" className="w-full max-w-md p-0 [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Project Configuration</SheetTitle>
            <SheetDescription>Configure workflow, eras, teams, and settings.</SheetDescription>
          </SheetHeader>
          <ConfigPanelBody
            project={project}
            tab={tab}
            onTabChange={onTabChange}
            onClose={onClose}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label="Project configuration"
      aria-hidden={!open}
      className={cn(
        'shrink-0 overflow-hidden bg-card transition-[width] duration-200 ease-[var(--ease-drawer)]',
        open ? 'w-[400px] border-l border-border' : 'w-0 border-l-0',
      )}
    >
      {open && (
        <div className="h-full w-[400px]">
          <ConfigPanelBody
            project={project}
            tab={tab}
            onTabChange={onTabChange}
            onClose={onClose}
          />
        </div>
      )}
    </aside>
  );
}
