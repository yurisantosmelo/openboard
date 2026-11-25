import { AlertCircle, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { errorMessage } from '../../../shared/api/httpClient';
import type { ProjectStatus, TransitionRule } from '../api/projectsApi';
import {
  useAddProjectTransitionRule,
  useProjectStatuses,
  useProjectTransitionRules,
  useRemoveProjectTransitionRule,
} from '../hooks/useProjects';

const selectClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

function RuleErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}

interface AddRuleFormProps {
  statuses: ProjectStatus[];
  busy: boolean;
  error: unknown;
  onSubmit: (fromStatusId: string, toStatusId: string) => void;
  onCancel: () => void;
}

function AddRuleForm({ statuses, busy, error, onSubmit, onCancel }: AddRuleFormProps) {
  const fromId = useId();
  const toId = useId();
  const [fromStatusId, setFromStatusId] = useState(statuses[0]?.id ?? '');
  const [toStatusId, setToStatusId] = useState(statuses[1]?.id ?? statuses[0]?.id ?? '');

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fromStatusId && toStatusId) onSubmit(fromStatusId, toStatusId);
  }

  return (
    <form
      className="grid gap-3 border-b p-6"
      aria-label="New Transition Rule"
      onSubmit={handleSubmit}
    >
      <RuleErrorAlert error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={fromId}>From Status</FieldLabel>
          <select
            id={fromId}
            className={selectClassName}
            value={fromStatusId}
            onChange={(e) => {
              setFromStatusId(e.target.value);
            }}
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor={toId}>To Status</FieldLabel>
          <select
            id={toId}
            className={selectClassName}
            value={toStatusId}
            onChange={(e) => {
              setToStatusId(e.target.value);
            }}
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Add Transition Rule
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface RulesListProps {
  rules: TransitionRule[];
  statusNames: Map<string, string>;
  canManage: boolean;
  busy: boolean;
  onRemove: (fromStatusId: string, toStatusId: string) => void;
}

function TransitionRulesList({ rules, statusNames, canManage, busy, onRemove }: RulesListProps) {
  if (rules.length === 0) {
    return (
      <CardContent className="py-6 text-sm text-muted-foreground">
        No Transition Rules yet. Work Items can move freely between any Statuses.
      </CardContent>
    );
  }
  return (
    <ul className="m-0 list-none divide-y p-0">
      {rules.map((rule) => {
        const fromName = statusNames.get(rule.fromStatusId) ?? rule.fromStatusId;
        const toName = statusNames.get(rule.toStatusId) ?? rule.toStatusId;
        return (
          <li
            key={`${rule.fromStatusId}-${rule.toStatusId}`}
            className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
          >
            <span className="inline-flex items-center gap-2 font-medium">
              <span>{fromName}</span>
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>{toName}</span>
            </span>
            {canManage && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                aria-label={`Remove Transition Rule ${fromName} to ${toName}`}
                onClick={() => {
                  onRemove(rule.fromStatusId, rule.toStatusId);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface TransitionRulesCardProps {
  projectId: string;
  canManage: boolean;
}

/** Displays and (for Workspace Owners) manages optional Project Transition Rules. */
export function TransitionRulesCard({ projectId, canManage }: TransitionRulesCardProps) {
  const titleId = useId();
  const statuses = useProjectStatuses(projectId).data ?? [];
  const rulesQuery = useProjectTransitionRules(projectId);
  const add = useAddProjectTransitionRule(projectId);
  const remove = useRemoveProjectTransitionRule(projectId);
  const [adding, setAdding] = useState(false);

  const statusNames = new Map(statuses.map((s) => [s.id, s.name]));
  const canAdd = canManage && !adding && statuses.length >= 2;

  return (
    <section aria-labelledby={titleId}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="items-center border-b py-4">
          <CardTitle>
            <h2 id={titleId}>Transition Rules</h2>
          </CardTitle>
          {canAdd && (
            <CardAction>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  add.reset();
                  setAdding(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                New Transition Rule
              </Button>
            </CardAction>
          )}
        </CardHeader>
        {adding && (
          <AddRuleForm
            statuses={statuses}
            busy={add.isPending}
            error={add.error}
            onSubmit={(fromStatusId, toStatusId) => {
              add.mutate(
                { fromStatusId, toStatusId },
                {
                  onSuccess: () => {
                    setAdding(false);
                  },
                },
              );
            }}
            onCancel={() => {
              setAdding(false);
            }}
          />
        )}
        {remove.isError && (
          <div className="border-b p-4">
            <RuleErrorAlert error={remove.error} />
          </div>
        )}
        {rulesQuery.isPending ? (
          <CardContent className="py-6">
            <span
              role="status"
              aria-label="Loading"
              className="inline-flex items-center text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            </span>
          </CardContent>
        ) : rulesQuery.isError ? (
          <CardContent className="py-6">
            <RuleErrorAlert error={rulesQuery.error} />
          </CardContent>
        ) : (
          <TransitionRulesList
            rules={rulesQuery.data}
            statusNames={statusNames}
            canManage={canManage}
            busy={remove.isPending}
            onRemove={(fromStatusId, toStatusId) => {
              remove.mutate({ fromStatusId, toStatusId });
            }}
          />
        )}
      </Card>
    </section>
  );
}
