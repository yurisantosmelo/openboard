import { AlertCircle, CheckCircle2, Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage } from '../../../shared/api/httpClient';
import type { EraState, Project, ProjectEra } from '../api/projectsApi';
import {
  useCloseProjectEra,
  useCreateProjectEra,
  useDeleteProjectEra,
  useProjectEras,
  useStartProjectEra,
} from '../hooks/useProjects';

const eraStateLabels: Record<EraState, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
};

const eraStateVariants: Record<EraState, 'outline' | 'default' | 'secondary'> = {
  planned: 'outline',
  active: 'default',
  completed: 'secondary',
};

const selectClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

function EraAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

interface CreateEraFormProps {
  busy: boolean;
  error: unknown;
  onSubmit: (payload: { name: string; goal: string; startDate: string; endDate: string }) => void;
  onCancel: () => void;
}

function CreateEraForm({ busy, error, onSubmit, onCancel }: CreateEraFormProps) {
  const startId = useId();
  const endId = useId();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ name, goal, startDate, endDate });
  }

  return (
    <form className="grid gap-3 border-b p-6" aria-label="New Era" onSubmit={handleSubmit}>
      <EraAlert error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Name"
          name="era-name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <FormField
          label="Goal"
          name="era-goal"
          value={goal}
          onChange={(e) => {
            setGoal(e.target.value);
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={startId}>Start date</FieldLabel>
          <Input
            id={startId}
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={endId}>End date</FieldLabel>
          <Input
            id={endId}
            type="date"
            required
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
            }}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Create Era
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface CloseEraPromptProps {
  era: ProjectEra;
  plannedEras: ProjectEra[];
  busy: boolean;
  error: unknown;
  onConfirm: (nextEraId: string | null) => void;
  onCancel: () => void;
}

function CloseEraPrompt({
  era,
  plannedEras,
  busy,
  error,
  onConfirm,
  onCancel,
}: CloseEraPromptProps) {
  const selectId = useId();
  const [nextEraId, setNextEraId] = useState(plannedEras[0]?.id ?? '');

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(nextEraId || null);
  }

  return (
    <form
      className="grid gap-3 border-b bg-muted/20 p-6"
      aria-label={`Close Era ${era.name}`}
      onSubmit={handleSubmit}
    >
      <EraAlert error={error} />
      <Field>
        <FieldLabel htmlFor={selectId}>Move unfinished Work Items from {era.name} to</FieldLabel>
        <select
          id={selectId}
          className={selectClassName}
          value={nextEraId}
          onChange={(e) => {
            setNextEraId(e.target.value);
          }}
        >
          <option value="">No Era</option>
          {plannedEras.map((planned) => (
            <option key={planned.id} value={planned.id}>
              {planned.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Confirm close
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface EraRowProps {
  era: ProjectEra;
  canWrite: boolean;
  hasActiveEra: boolean;
  busy: boolean;
  onStart: () => void;
  onRequestClose: () => void;
  onDelete: () => void;
}

function EraRow({
  era,
  canWrite,
  hasActiveEra,
  busy,
  onStart,
  onRequestClose,
  onDelete,
}: EraRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
      <div className="grid min-w-0 gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{era.name}</span>
          <Badge variant={eraStateVariants[era.state]}>{eraStateLabels[era.state]}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {era.startDate} to {era.endDate}
          {era.goal ? ` · ${era.goal}` : ''}
        </span>
      </div>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          {era.state === 'planned' && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || hasActiveEra}
                aria-label={`Start Era ${era.name}`}
                onClick={onStart}
              >
                <Play className="size-3.5" aria-hidden="true" />
                Start
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                aria-label={`Delete Era ${era.name}`}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </Button>
            </>
          )}
          {era.state === 'active' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              aria-label={`Close Era ${era.name}`}
              onClick={onRequestClose}
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Close Era
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

interface ErasBodyProps {
  isPending: boolean;
  error: unknown;
  eras: ProjectEra[];
  canWrite: boolean;
  busy: boolean;
  onStart: (eraId: string) => void;
  onRequestClose: (era: ProjectEra) => void;
  onDelete: (eraId: string) => void;
}

function ErasBody({
  isPending,
  error,
  eras,
  canWrite,
  busy,
  onStart,
  onRequestClose,
  onDelete,
}: ErasBodyProps) {
  if (isPending) {
    return (
      <CardContent className="py-6">
        <span
          role="status"
          aria-label="Loading"
          className="inline-flex items-center text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </span>
      </CardContent>
    );
  }
  if (error) {
    return (
      <CardContent className="py-6">
        <EraAlert error={error} />
      </CardContent>
    );
  }
  if (eras.length === 0) {
    return (
      <CardContent className="py-6 text-sm text-muted-foreground">
        No Eras yet. Create a Planned Era to time-box a slice of work.
      </CardContent>
    );
  }
  const hasActiveEra = eras.some((e) => e.state === 'active');
  return (
    <ul className="m-0 list-none divide-y p-0">
      {eras.map((era) => (
        <EraRow
          key={era.id}
          era={era}
          canWrite={canWrite}
          hasActiveEra={hasActiveEra}
          busy={busy}
          onStart={() => {
            onStart(era.id);
          }}
          onRequestClose={() => {
            onRequestClose(era);
          }}
          onDelete={() => {
            onDelete(era.id);
          }}
        />
      ))}
    </ul>
  );
}

/** Displays and manages a Project's time-boxed Eras (Planned, Active, Completed). */
export function ProjectErasCard({ project }: { project: Project }) {
  const titleId = useId();
  const erasQuery = useProjectEras(project.id);
  const create = useCreateProjectEra(project.id);
  const start = useStartProjectEra(project.id);
  const close = useCloseProjectEra(project.id);
  const remove = useDeleteProjectEra(project.id);

  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<ProjectEra | null>(null);

  const canWrite = project.currentUserRole !== 'viewer';
  const eras = erasQuery.data ?? [];
  const plannedEras = eras.filter((e) => e.state === 'planned');
  const busy = start.isPending || close.isPending || remove.isPending;
  const actionError = start.error ?? remove.error;

  return (
    <section aria-labelledby={titleId}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="items-center border-b py-4">
          <CardTitle>
            <h2 id={titleId}>Eras</h2>
          </CardTitle>
          {canWrite && !creating && (
            <CardAction>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  create.reset();
                  setClosing(null);
                  setCreating(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                New Era
              </Button>
            </CardAction>
          )}
        </CardHeader>
        {creating && (
          <CreateEraForm
            busy={create.isPending}
            error={create.error}
            onSubmit={(payload) => {
              create.mutate(payload, {
                onSuccess: () => {
                  setCreating(false);
                },
              });
            }}
            onCancel={() => {
              setCreating(false);
            }}
          />
        )}
        {closing && (
          <CloseEraPrompt
            key={closing.id}
            era={closing}
            plannedEras={plannedEras}
            busy={close.isPending}
            error={close.error}
            onConfirm={(nextEraId) => {
              close.mutate(
                { eraId: closing.id, nextEraId },
                {
                  onSuccess: () => {
                    setClosing(null);
                  },
                },
              );
            }}
            onCancel={() => {
              setClosing(null);
            }}
          />
        )}
        {actionError && (
          <div className="border-b p-4">
            <EraAlert error={actionError} />
          </div>
        )}
        <ErasBody
          isPending={erasQuery.isPending}
          error={erasQuery.error}
          eras={eras}
          canWrite={canWrite}
          busy={busy}
          onStart={(eraId) => {
            start.mutate(eraId);
          }}
          onRequestClose={(era) => {
            close.reset();
            setCreating(false);
            setClosing(era);
          }}
          onDelete={(eraId) => {
            remove.mutate(eraId);
          }}
        />
      </Card>
    </section>
  );
}
