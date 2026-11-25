import { AlertCircle } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '../../../shared/api/httpClient';

interface SaveViewBannerProps {
  open: boolean;
  busy: boolean;
  error: unknown;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/** Compact inline banner for naming and saving a Personal View, plus Saved View mutation errors. */
export function SaveViewBanner({ open, busy, error, onSave, onCancel }: SaveViewBannerProps) {
  const [name, setName] = useState('');

  if (!open && !error) return null;

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
  }

  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2.5 md:px-6">
      {open && (
        <form
          aria-label="Save View"
          onSubmit={handleSubmit}
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            aria-label="View name"
            placeholder="View name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            className="h-8 w-56 text-xs"
            required
          />
          <Button type="submit" size="compact" disabled={busy}>
            Save Personal View
          </Button>
          <Button type="button" size="compact" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </form>
      )}
      {Boolean(error) && (
        <Alert variant="destructive" className={open ? 'mt-2' : undefined}>
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{errorMessage(error)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
