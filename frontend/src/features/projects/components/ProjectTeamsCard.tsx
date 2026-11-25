import { AlertCircle, Plus, Trash2, Users } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import { selectClassName } from '../../work-items/components/workItemLabels';
import type { Project } from '../api/projectsApi';
import {
  useAddProjectTeam,
  useProjectTeams,
  useRemoveProjectTeam,
  useWorkspaceTeams,
} from '../hooks/useTeams';

/** Lists and manages Project Teams associated from the Project's own Workspace. */
export function ProjectTeamsCard({ project }: { project: Project }) {
  const titleId = useId();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const canManage = project.currentUserRole === 'owner';
  const projectTeams = useProjectTeams(project.id).data ?? [];
  const workspaceTeams = useWorkspaceTeams(project.workspaceId).data ?? [];
  const addTeam = useAddProjectTeam(project.id);
  const removeTeam = useRemoveProjectTeam(project.id);

  const associatedIds = new Set(projectTeams.map((t) => t.id));
  const availableTeams = workspaceTeams.filter((t) => !associatedIds.has(t.id));
  const err = addTeam.error ?? removeTeam.error;

  function handleAssociate(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedTeamId) return;
    addTeam.mutate(selectedTeamId, {
      onSuccess: () => {
        setSelectedTeamId('');
      },
    });
  }

  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={titleId} className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
              Project Teams
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {err && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription role="alert">{errorMessage(err)}</AlertDescription>
            </Alert>
          )}
          {projectTeams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Teams associated with this Project.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {projectTeams.map((team) => (
                <li key={team.id} className="inline-flex items-center gap-1">
                  <Badge variant="secondary">{team.name}</Badge>
                  {canManage && (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove ${team.name}`}
                      disabled={removeTeam.isPending}
                      onClick={() => {
                        removeTeam.mutate(team.id);
                      }}
                    >
                      <Trash2 className="size-3" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && availableTeams.length > 0 && (
            <form
              aria-label="Associate Project Team"
              onSubmit={handleAssociate}
              className="flex flex-wrap items-center gap-2"
            >
              <select
                aria-label="Team"
                className={`${selectClassName} h-8 w-auto min-w-48 text-xs`}
                value={selectedTeamId}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value);
                }}
              >
                <option value="">Select a Workspace Team</option>
                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={!selectedTeamId || addTeam.isPending}>
                <Plus className="size-4" aria-hidden="true" />
                Add Team
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
