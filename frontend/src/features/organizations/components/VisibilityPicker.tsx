import { useId } from 'react';
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
    <div className="field">
      <span id={labelId} className="field__label">
        Visibility
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {visibilities.map((option) => (
          <button
            key={option}
            type="button"
            className="btn"
            aria-pressed={value === option}
            onClick={() => {
              onChange(option);
            }}
          >
            {visibilityLabels[option]}
          </button>
        ))}
      </div>
      <span className="field__help">{visibilityHelp[value]}</span>
    </div>
  );
}
