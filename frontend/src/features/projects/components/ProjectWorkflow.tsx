import { StatusesCard } from './StatusesCard';
import { TransitionRulesCard } from './TransitionRulesCard';
import { WorkItemTypesCard } from './WorkItemTypesCard';

interface ProjectWorkflowProps {
  projectId: string;
  canManage?: boolean;
}

/** Shows and (for Workspace Owners) customizes a Project's workflow configuration. */
export function ProjectWorkflow({ projectId, canManage = false }: ProjectWorkflowProps) {
  return (
    <div className="grid gap-6">
      <StatusesCard projectId={projectId} canManage={canManage} />
      <WorkItemTypesCard projectId={projectId} canManage={canManage} />
      <TransitionRulesCard projectId={projectId} canManage={canManage} />
    </div>
  );
}
