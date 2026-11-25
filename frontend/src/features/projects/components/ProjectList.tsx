import { FolderKanban } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ListPanel } from '../../organizations/components/ListPanel';
import type { Project } from '../api/projectsApi';
import { useProjects } from '../hooks/useProjects';
import { projectPath } from '../paths';
import { CreateProjectForm } from './CreateProjectForm';

function ProjectRow(project: Project) {
  return (
    <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <Link
        className="inline-flex min-w-0 items-center gap-2 font-medium break-words text-foreground no-underline hover:underline"
        to={projectPath(project.id)}
      >
        <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{project.name}</span>
      </Link>
    </li>
  );
}

interface ProjectListProps {
  workspaceId: string;
  /** Whether the signed-in User may create Projects: only Workspace Owners can. */
  canCreate: boolean;
}

/** Lists and creates Projects owned by one Workspace. */
export function ProjectList({ workspaceId, canCreate }: ProjectListProps) {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = useProjects(workspaceId, page);

  return (
    <ListPanel
      title="Projects"
      query={query}
      emptyTitle="No Projects yet"
      emptyDescription={
        canCreate
          ? 'Create the first Project to plan and track work in this Workspace.'
          : 'Projects created in this Workspace will appear here.'
      }
      action={
        canCreate &&
        !creating && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setCreating(true);
            }}
          >
            New Project
          </Button>
        )
      }
      form={
        creating && (
          <CreateProjectForm
            workspaceId={workspaceId}
            onClose={() => {
              setCreating(false);
            }}
          />
        )
      }
      renderItem={ProjectRow}
      onPageChange={setPage}
    />
  );
}
