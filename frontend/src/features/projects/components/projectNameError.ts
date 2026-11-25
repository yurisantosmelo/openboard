import { ApiError } from '../../../shared/api/httpClient';

/** Returns the field error message for a Project name conflict or validation error. */
export function projectNameError(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }
  if (error.status === 409) {
    return 'A Project with this name already exists in this Workspace.';
  }
  return error.problem?.errors?.find(({ field }) => field === 'name')?.message;
}
