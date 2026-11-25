import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
            {workspaceRoleLabels[option]}
          </Button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{roleHelp[value]}</span>
    </div>
  );
}
