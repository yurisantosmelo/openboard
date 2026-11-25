import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
    <div className="grid gap-1.5">
      <Label id={labelId}>Role</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={labelId}>
        {roles.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={value === option ? 'default' : 'outline'}
            aria-pressed={value === option}
            onClick={() => {
              onChange(option);
            }}
          >
            {organizationRoleLabels[option]}
          </Button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{roleHelp[value]}</span>
    </div>
  );
}
