import type { WorkspaceRole } from '../api/organizationsApi';

export const workspaceRoleLabels: Record<WorkspaceRole, string> = {
  owner: 'Workspace Owner',
  contributor: 'Workspace Contributor',
  viewer: 'Workspace Viewer',
};

export const workspaceRoleShortLabels: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  contributor: 'Contributor',
  viewer: 'Viewer',
};
