import { apiRequest } from '../../../shared/api/httpClient';
import type { Project } from './projectsApi';
import type { WorkspaceRole } from '../../organizations/api/organizationsApi';

export interface Team {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamAssignment {
  teamId: string;
  userId: string;
  username: string;
  name: string;
  createdAt: string;
}

interface TeamDto {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface TeamAssignmentDto {
  team_id: string;
  user_id: string;
  username: string;
  name: string;
  created_at: string;
}

interface ProjectDto {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  current_user_role: WorkspaceRole;
}

interface ListDto<T> {
  items: T[];
}

function toTeam(dto: TeamDto): Team {
  return {
    id: dto.id,
    workspaceId: dto.workspace_id,
    name: dto.name,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function toTeamAssignment(dto: TeamAssignmentDto): TeamAssignment {
  return {
    teamId: dto.team_id,
    userId: dto.user_id,
    username: dto.username,
    name: dto.name,
    createdAt: dto.created_at,
  };
}

export async function listWorkspaceTeams(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<Team[]> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams`;
  const dto = await apiRequest<ListDto<TeamDto>>(path, { signal });
  return dto.items.map(toTeam);
}

export async function createWorkspaceTeam(workspaceId: string, name: string): Promise<Team> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams`;
  return toTeam(await apiRequest<TeamDto>(path, { method: 'POST', body: { name } }));
}

export async function renameWorkspaceTeam(
  workspaceId: string,
  teamId: string,
  name: string,
): Promise<Team> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}`;
  return toTeam(await apiRequest<TeamDto>(path, { method: 'PATCH', body: { name } }));
}

export async function deleteWorkspaceTeam(workspaceId: string, teamId: string): Promise<void> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}

export async function listTeamAssignments(
  workspaceId: string,
  teamId: string,
  signal?: AbortSignal,
): Promise<TeamAssignment[]> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/assignments`;
  const dto = await apiRequest<ListDto<TeamAssignmentDto>>(path, { signal });
  return dto.items.map(toTeamAssignment);
}

export async function addTeamAssignment(
  workspaceId: string,
  teamId: string,
  userId: string,
): Promise<TeamAssignment> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/assignments`;
  return toTeamAssignment(
    await apiRequest<TeamAssignmentDto>(path, { method: 'POST', body: { user_id: userId } }),
  );
}

export async function removeTeamAssignment(
  workspaceId: string,
  teamId: string,
  userId: string,
): Promise<void> {
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/assignments/${encodeURIComponent(userId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}

export async function listProjectTeams(projectId: string, signal?: AbortSignal): Promise<Team[]> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/teams`;
  const dto = await apiRequest<ListDto<TeamDto>>(path, { signal });
  return dto.items.map(toTeam);
}

export async function addProjectTeam(projectId: string, teamId: string): Promise<Team> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/teams`;
  return toTeam(await apiRequest<TeamDto>(path, { method: 'POST', body: { team_id: teamId } }));
}

export async function removeProjectTeam(projectId: string, teamId: string): Promise<void> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/teams/${encodeURIComponent(teamId)}`;
  await apiRequest<undefined>(path, { method: 'DELETE' });
}

export async function moveProject(projectId: string, workspaceId: string): Promise<Project> {
  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/move`;
  const dto = await apiRequest<ProjectDto>(path, {
    method: 'POST',
    body: { workspace_id: workspaceId },
  });
  return {
    id: dto.id,
    organizationId: dto.organization_id,
    workspaceId: dto.workspace_id,
    name: dto.name,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    currentUserRole: dto.current_user_role,
  };
}
