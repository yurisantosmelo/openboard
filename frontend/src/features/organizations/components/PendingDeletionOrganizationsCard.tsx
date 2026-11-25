import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '../../../shared/api/httpClient';
import { usePendingDeletionOrganizations, useRestoreOrganization } from '../hooks/useOrganizations';

/** Lets Administrators inspect and restore Pending Deletion Organizations. */
export function PendingDeletionOrganizationsCard() {
  const [open, setOpen] = useState(false);
  const query = usePendingDeletionOrganizations(1, open);
  const restore = useRestoreOrganization();
  const items = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Pending Deletion
        </CardTitle>
        <CardAction>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setOpen((prev) => !prev);
            }}
          >
            {open ? 'Hide Pending Deletion' : 'View Pending Deletion'}
          </Button>
        </CardAction>
      </CardHeader>
      {open && (
        <CardContent className="grid gap-3">
          {restore.isError && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription role="alert">{errorMessage(restore.error)}</AlertDescription>
            </Alert>
          )}
          {query.isError && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription role="alert">{errorMessage(query.error)}</AlertDescription>
            </Alert>
          )}
          {!query.isPending && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No Organizations in Pending Deletion.</p>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((org) => (
                <li
                  key={org.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{org.name}</span>
                    <Badge variant="outline">Pending Deletion</Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={restore.isPending}
                    aria-label={`Restore Organization ${org.name}`}
                    onClick={() => {
                      restore.mutate(org.id);
                    }}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
