import type { OrganizationRole } from '../api/organizationsApi';

export const organizationRoleLabels: Record<OrganizationRole, string> = {
  owner: 'Organization Owner',
  contributor: 'Organization Contributor',
};
