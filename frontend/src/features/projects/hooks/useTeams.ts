import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addProjectTeam,
  addTeamAssignment,
  createWorkspaceTeam,
  deleteWorkspaceTeam,
  listProjectTeams,
  listTeamAssignments,
  listWorkspaceTeams,
  moveProject,
  removeProjectTeam,
  removeTeamAssignment,
  renameWorkspaceTeam,
} from '../api/teamsApi';

const workspaceTeamsKey = (workspaceId: string) => ['workspace-teams', workspaceId] as const;
const teamAssignmentsKey = (workspaceId: string, teamId: string) =>
  ['team-assignments', workspaceId, teamId] as const;
const projectTeamsKey = (projectId: string) => ['project-teams', projectId] as const;

export function useWorkspaceTeams(workspaceId: string) {
  return useQuery({
    queryKey: workspaceTeamsKey(workspaceId),
    queryFn: ({ signal }) => listWorkspaceTeams(workspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

export function useCreateWorkspaceTeam(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createWorkspaceTeam(workspaceId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceTeamsKey(workspaceId) }),
  });
}

export function useRenameWorkspaceTeam(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, name }: { teamId: string; name: string }) =>
      renameWorkspaceTeam(workspaceId, teamId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceTeamsKey(workspaceId) }),
  });
}

export function useDeleteWorkspaceTeam(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => deleteWorkspaceTeam(workspaceId, teamId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceTeamsKey(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ['project-teams'] }),
      ]),
  });
}

export function useTeamAssignments(workspaceId: string, teamId: string, enabled = true) {
  return useQuery({
    queryKey: teamAssignmentsKey(workspaceId, teamId),
    queryFn: ({ signal }) => listTeamAssignments(workspaceId, teamId, signal),
    enabled: enabled && Boolean(workspaceId) && Boolean(teamId),
  });
}

export function useAddTeamAssignment(workspaceId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => addTeamAssignment(workspaceId, teamId, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: teamAssignmentsKey(workspaceId, teamId) }),
  });
}

export function useRemoveTeamAssignment(workspaceId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeTeamAssignment(workspaceId, teamId, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: teamAssignmentsKey(workspaceId, teamId) }),
  });
}

export function useProjectTeams(projectId: string) {
  return useQuery({
    queryKey: projectTeamsKey(projectId),
    queryFn: ({ signal }) => listProjectTeams(projectId, signal),
    enabled: Boolean(projectId),
  });
}

export function useAddProjectTeam(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => addProjectTeam(projectId, teamId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectTeamsKey(projectId) }),
  });
}

export function useRemoveProjectTeam(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => removeProjectTeam(projectId, teamId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectTeamsKey(projectId) }),
  });
}

export function useMoveProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => moveProject(projectId, workspaceId),
    onSuccess: (moved) => {
      queryClient.setQueryData(['project', projectId], moved);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: projectTeamsKey(projectId) }),
      ]);
    },
  });
}
