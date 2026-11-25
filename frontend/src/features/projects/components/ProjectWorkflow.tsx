import { AlertCircle, Loader2 } from 'lucide-react';
import { useId } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import type { EstimateUnit, ProjectWorkItemType, StatusGroup } from '../api/projectsApi';
import { useProjectStatuses, useProjectWorkItemTypes } from '../hooks/useProjects';

const statusGroupLabels: Record<StatusGroup, string> = {
  not_committed: 'Not Committed',
  planned: 'Planned',
  started: 'Started',
  completed: 'Completed',
};

const estimateUnitLabels: Record<EstimateUnit, string> = {
  story_points: 'Story Points',
  hours: 'Hours',
  none: 'No estimate',
};

function childNamesOf(type: ProjectWorkItemType, namesById: Map<string, string>): string {
  const names = type.allowedChildTypeIds
    .map((id) => namesById.get(id))
    .filter((name): name is string => name !== undefined);
  return names.length > 0 ? `Children: ${names.join(', ')}` : 'No children';
}

function StatusesCard({ projectId }: { projectId: string }) {
  const titleId = useId();
  const query = useProjectStatuses(projectId);

  return (
    <section aria-labelledby={titleId}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="items-center border-b py-4">
          <CardTitle>
            <h2 id={titleId}>Statuses</h2>
          </CardTitle>
        </CardHeader>
        {query.isPending ? (
          <CardContent className="py-6">
            <span
              role="status"
              aria-label="Loading"
              className="inline-flex items-center text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            </span>
          </CardContent>
        ) : query.isError ? (
          <CardContent className="py-6">
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription role="alert">{errorMessage(query.error)}</AlertDescription>
            </Alert>
          </CardContent>
        ) : (
          <ul className="m-0 list-none divide-y p-0">
            {query.data.map((status) => (
              <li
                key={status.id}
                className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
              >
                <span className="font-medium break-words">{status.name}</span>
                <Badge variant="secondary">{statusGroupLabels[status.statusGroup]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function WorkItemTypesCard({ projectId }: { projectId: string }) {
  const titleId = useId();
  const query = useProjectWorkItemTypes(projectId);
  const namesById = new Map((query.data ?? []).map((item) => [item.id, item.name]));

  return (
    <section aria-labelledby={titleId}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="items-center border-b py-4">
          <CardTitle>
            <h2 id={titleId}>Work Item Types</h2>
          </CardTitle>
        </CardHeader>
        {query.isPending ? (
          <CardContent className="py-6">
            <span
              role="status"
              aria-label="Loading"
              className="inline-flex items-center text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            </span>
          </CardContent>
        ) : query.isError ? (
          <CardContent className="py-6">
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription role="alert">{errorMessage(query.error)}</AlertDescription>
            </Alert>
          </CardContent>
        ) : (
          <ul className="m-0 list-none divide-y p-0">
            {query.data.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
              >
                <div className="grid min-w-0">
                  <span className="font-medium break-words">{item.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {childNamesOf(item, namesById)}
                  </span>
                </div>
                <Badge variant="outline">{estimateUnitLabels[item.estimateUnit]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

/** Shows a Project's configured Statuses and Work Item Types. */
export function ProjectWorkflow({ projectId }: { projectId: string }) {
  return (
    <div className="grid gap-6">
      <StatusesCard projectId={projectId} />
      <WorkItemTypesCard projectId={projectId} />
    </div>
  );
}
