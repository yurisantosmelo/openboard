import { useId } from 'react';
import type { WorkspaceRole } from '../api/organizationsApi';
import { workspaceRoleLabels } from './workspaceRole';

const roleHelp: Record<WorkspaceRole, string> = {
  owner: 'Manages the Workspace, its Workspace Memberships, Projects, Teams and visibility.',
  contributor: 'Works inside the Workspace Projects without managing the Workspace.',
  viewer: 'Sees everything in the Workspace and changes nothing.',
};

const roles: WorkspaceRole[] = ['owner', 'contributor', 'viewer'];

interface WorkspaceRolePickerProps {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
}

/** Chooses the role of a Workspace Membership, explaining the current choice. */
export function WorkspaceRolePicker({ value, onChange }: WorkspaceRolePickerProps) {
  const labelId = useId();
  return (
    <div className="field">
      <span id={labelId} className="field__label">
        Role
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {roles.map((option) => (
          <button
            key={option}
            type="button"
            className="btn"
            aria-pressed={value === option}
            onClick={() => {
              onChange(option);
            }}
          >
            {workspaceRoleLabels[option]}
          </button>
        ))}
      </div>
      <span className="field__help">{roleHelp[value]}</span>
    </div>
  );
}
