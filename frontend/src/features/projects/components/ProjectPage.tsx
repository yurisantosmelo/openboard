import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { errorMessage } from '../../../shared/api/httpClient';
import { workspacePath } from '../../organizations/paths';
import { ProjectWorkItems } from '../../work-items/components/ProjectWorkItems';
import { useProject } from '../hooks/useProjects';
import { ProjectErasCard } from './ProjectErasCard';
import { ProjectSettings } from './ProjectSettings';
import { ProjectWorkflow } from './ProjectWorkflow';

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const project = useProject(projectId);

  if (project.isPending) {
    return (
      <span
        role="status"
        aria-label="Loading"
        className="inline-flex items-center text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </span>
    );
  }
  if (project.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription role="alert">{errorMessage(project.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
          {project.data.name}
        </h1>
      </header>
      <ProjectWorkItems project={project.data} />
      <ProjectErasCard project={project.data} />
      <ProjectWorkflow
        projectId={project.data.id}
        canManage={project.data.currentUserRole === 'owner'}
      />
      {project.data.currentUserRole === 'owner' && <ProjectSettings project={project.data} />}
      <div>
        <Link
          className={buttonVariants({ variant: 'link', className: 'px-0' })}
          to={workspacePath(project.data.workspaceId)}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Workspace
        </Link>
      </div>
    </div>
  );
}
