import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { WorkItemDetailDialog } from '@/features/work-items/components/WorkItemDetailDialog';
import { ProjectShellContext, type ProjectShellState } from './project-shell-context';

export function ProjectShellProvider({ children }: { children: ReactNode }) {
  const [shell, setShell] = useState<ProjectShellState | null>(null);
  const [openWorkItemId, setOpenWorkItemId] = useState<string | null>(null);

  const openWorkItem = useCallback((workItemId: string) => {
    setOpenWorkItemId(workItemId);
  }, []);

  const closeWorkItem = useCallback(() => {
    setOpenWorkItemId(null);
  }, []);

  const value = useMemo(
    () => ({ shell, setShell, openWorkItem, closeWorkItem }),
    [shell, openWorkItem, closeWorkItem],
  );

  return (
    <ProjectShellContext.Provider value={value}>
      {children}
      <WorkItemDetailDialog workItemId={openWorkItemId} onClose={closeWorkItem} />
    </ProjectShellContext.Provider>
  );
}
