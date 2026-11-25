import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deactivateUser, issueTemporaryPassword, listUsers, reactivateUser } from '../api/usersApi';

const usersKey = ['users'] as const;

export function useUsers(page: number) {
  return useQuery({
    queryKey: [...usersKey, page],
    queryFn: ({ signal }) => listUsers(page, signal),
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reactivateUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useIssueTemporaryPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: issueTemporaryPassword,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}
