import { AlertCircle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { saveNavigationContext } from '@/app/navigationContext';
import type { ProjectConfigTab } from '@/app/project-shell-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCurrentUser } from '@/features/auth';
import { errorMessage } from '../../../shared/api/httpClient';
import { ProjectWorkItems } from '../../work-items/components/ProjectWorkItems';
import { useProject } from '../hooks/useProjects';
import { ProjectConfigSidebar } from './ProjectConfigSidebar';

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const { data: currentUser } = useCurrentUser();
  const project = useProject(projectId);
  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ProjectConfigTab>('workflow');

  useEffect(() => {
    if (!project.data) return;
    saveNavigationContext({
      userId: currentUser?.id,
      organizationId: project.data.organizationId,
      workspaceId: project.data.workspaceId,
      projectId: project.data.id,
      projectName: project.data.name,
    });
  }, [currentUser?.id, project.data]);

  const handleToggleConfig = useCallback(() => {
    setConfigOpen((prev) => !prev);
  }, []);

  const handleOpenConfigTab = useCallback((tab: ProjectConfigTab) => {
    setConfigTab(tab);
    setConfigOpen(true);
  }, []);

  if (project.isPending) {
    return (
      <div className="p-6">
        <span
          role="status"
          aria-label="Loading"
          className="inline-flex items-center text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      </div>
    );
  }
  if (project.isError) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(project.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ProjectWorkItems
        project={project.data}
        configOpen={configOpen}
        configTab={configTab}
        onToggleConfig={handleToggleConfig}
        onOpenConfigTab={handleOpenConfigTab}
      />
      <ProjectConfigSidebar
        project={project.data}
        open={configOpen}
        tab={configTab}
        onTabChange={setConfigTab}
        onClose={() => {
          setConfigOpen(false);
        }}
      />
    </div>
  );
}
