import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addOrganizationMembership,
  addWorkspaceMembership,
  archiveWorkspace,
  createOrganization,
  createWorkspace,
  deleteOrganization,
  deleteWorkspace,
  getOrganization,
  getWorkspace,
  listOrganizationMemberships,
  listOrganizations,
  listPendingDeletionOrganizations,
  listPendingDeletionWorkspaces,
  listWorkspaceMemberships,
  listWorkspaces,
  removeOrganizationMembership,
  removeWorkspaceMembership,
  restoreOrganization,
  restoreWorkspace,
  unarchiveWorkspace,
  updateOrganizationMembership,
  updateWorkspace,
  updateWorkspaceMembership,
  type OrganizationRole,
  type WorkspaceChange,
  type WorkspaceRole,
} from '../api/organizationsApi';

const workspacesKey = (organizationId: string) => ['workspaces', organizationId] as const;
const membershipsKey = (organizationId: string) =>
  ['organization-memberships', organizationId] as const;
const workspaceMembershipsKey = (workspaceId: string) =>
  ['workspace-memberships', workspaceId] as const;

export function useOrganizations(page: number) {
  return useQuery({
    queryKey: ['organizations', page],
    queryFn: ({ signal }) => listOrganizations(page, signal),
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrganization,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

export function useOrganization(id: string) {
  return useQuery({
    queryKey: ['organization', id],
    queryFn: ({ signal }) => getOrganization(id, signal),
  });
}

export function usePendingDeletionOrganizations(page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['organizations-pending-deletion', page],
    queryFn: ({ signal }) => listPendingDeletionOrganizations(page, signal),
    enabled,
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteOrganization,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['organizations'] }),
        queryClient.invalidateQueries({ queryKey: ['organizations-pending-deletion'] }),
      ]),
  });
}

export function useRestoreOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreOrganization,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['organizations'] }),
        queryClient.invalidateQueries({ queryKey: ['organizations-pending-deletion'] }),
      ]),
  });
}

export function useWorkspaces(organizationId: string, page: number, includeArchived = false) {
  return useQuery({
    queryKey: [...workspacesKey(organizationId), page, includeArchived],
    queryFn: ({ signal }) => listWorkspaces(organizationId, page, signal, includeArchived),
  });
}

export function usePendingDeletionWorkspaces(
  organizationId: string,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['workspaces-pending-deletion', organizationId, page],
    queryFn: ({ signal }) => listPendingDeletionWorkspaces(organizationId, page, signal),
    enabled,
  });
}

export function useArchiveWorkspace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => archiveWorkspace(id),
    onSuccess: (workspace) => {
      queryClient.setQueryData(['workspace', id], workspace);
      return queryClient.invalidateQueries({ queryKey: workspacesKey(workspace.organizationId) });
    },
  });
}

export function useUnarchiveWorkspace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unarchiveWorkspace(id),
    onSuccess: (workspace) => {
      queryClient.setQueryData(['workspace', id], workspace);
      return queryClient.invalidateQueries({ queryKey: workspacesKey(workspace.organizationId) });
    },
  });
}

export function useDeleteWorkspace(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: workspacesKey(organizationId) }),
        queryClient.invalidateQueries({
          queryKey: ['workspaces-pending-deletion', organizationId],
        }),
      ]),
  });
}

export function useRestoreWorkspace(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreWorkspace,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: workspacesKey(organizationId) }),
        queryClient.invalidateQueries({
          queryKey: ['workspaces-pending-deletion', organizationId],
        }),
      ]),
  });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: ({ signal }) => getWorkspace(id, signal),
  });
}

export function useUpdateWorkspace(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: WorkspaceChange) => updateWorkspace(id, change),
    onSuccess: (workspace) => {
      queryClient.setQueryData(['workspace', id], workspace);
      return queryClient.invalidateQueries({ queryKey: workspacesKey(workspace.organizationId) });
    },
  });
}

export function useCreateWorkspace(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspacesKey(organizationId) }),
  });
}

export function useOrganizationMemberships(organizationId: string, page: number) {
  return useQuery({
    queryKey: [...membershipsKey(organizationId), page],
    queryFn: ({ signal }) => listOrganizationMemberships(organizationId, page, signal),
  });
}

export function useAddOrganizationMembership(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addOrganizationMembership,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membershipsKey(organizationId) }),
  });
}

export function useUpdateOrganizationMembership(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrganizationRole }) =>
      updateOrganizationMembership(organizationId, userId, role),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: membershipsKey(organizationId) }),
        queryClient.invalidateQueries({ queryKey: ['organization', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['organizations'] }),
      ]),
  });
}

export function useRemoveOrganizationMembership(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeOrganizationMembership(organizationId, userId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: membershipsKey(organizationId) }),
        queryClient.invalidateQueries({ queryKey: ['organization', organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['organizations'] }),
      ]),
  });
}

export function useWorkspaceMemberships(workspaceId: string, page: number) {
  return useQuery({
    queryKey: [...workspaceMembershipsKey(workspaceId), page],
    queryFn: ({ signal }) => listWorkspaceMemberships(workspaceId, page, signal),
  });
}

export function useAddWorkspaceMembership(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addWorkspaceMembership,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: workspaceMembershipsKey(workspaceId) }),
  });
}

export function useUpdateWorkspaceMembership(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      updateWorkspaceMembership(workspaceId, userId, role),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceMembershipsKey(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
      ]),
  });
}

export function useRemoveWorkspaceMembership(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeWorkspaceMembership(workspaceId, userId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceMembershipsKey(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
      ]),
  });
}
