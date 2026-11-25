import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { WorkspaceVisibility } from '../api/organizationsApi';
import { visibilityLabels } from './visibility';

const visibilityHelp: Record<WorkspaceVisibility, string> = {
  restricted: 'Only people added to this Workspace and Organization Owners can enter.',
  open: 'Everyone in the Organization can enter.',
};

const visibilities: WorkspaceVisibility[] = ['restricted', 'open'];

interface VisibilityPickerProps {
  value: WorkspaceVisibility;
  onChange: (visibility: WorkspaceVisibility) => void;
}

/** Chooses who can enter a Workspace, explaining the current choice. */
export function VisibilityPicker({ value, onChange }: VisibilityPickerProps) {
  const labelId = useId();
  return (
    <div className="grid gap-1.5">
      <Label id={labelId}>Visibility</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={labelId}>
        {visibilities.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={value === option ? 'default' : 'outline'}
            aria-pressed={value === option}
            onClick={() => {
              onChange(option);
            }}
          >
            {visibilityLabels[option]}
          </Button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{visibilityHelp[value]}</span>
    </div>
  );
}
