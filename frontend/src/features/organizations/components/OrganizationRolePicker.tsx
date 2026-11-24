import { useId } from 'react';
import type { OrganizationRole } from '../api/organizationsApi';
import { organizationRoleLabels } from './organizationRole';

const roleHelp: Record<OrganizationRole, string> = {
  contributor: 'Can enter Open Workspaces and Restricted Workspaces they are added to.',
  owner: 'Manages the Organization, its Workspaces and its Organization Memberships.',
};

const roles: OrganizationRole[] = ['contributor', 'owner'];

interface OrganizationRolePickerProps {
  value: OrganizationRole;
  onChange: (role: OrganizationRole) => void;
}

/** Chooses the role of an Organization Membership, explaining the current choice. */
export function OrganizationRolePicker({ value, onChange }: OrganizationRolePickerProps) {
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
            {organizationRoleLabels[option]}
          </button>
        ))}
      </div>
      <span className="field__help">{roleHelp[value]}</span>
    </div>
  );
}
