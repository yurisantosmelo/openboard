import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Organization } from '../api/organizationsApi';
import { useOrganizations } from '../hooks/useOrganizations';
import { organizationPath } from '../paths';
import { CreateOrganizationForm } from './CreateOrganizationForm';
import { ListPanel } from './ListPanel';
import { organizationRoleLabels } from './organizationRole';

function OrganizationRow(organization: Organization) {
  return (
    <li
      key={organization.id}
      className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
    >
      <Link
        className="min-w-0 font-medium break-words text-foreground no-underline hover:underline"
        to={organizationPath(organization.id)}
      >
        {organization.name}
      </Link>
      <Badge variant="secondary">{organizationRoleLabels[organization.currentUserRole]}</Badge>
    </li>
  );
}

interface OrganizationListProps {
  /** Whether the signed-in User may create Organizations: only Administrators can. */
  canCreate: boolean;
}

/** The Organizations the signed-in User can see. */
export function OrganizationList({ canCreate }: OrganizationListProps) {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = useOrganizations(page);
  return (
    <ListPanel
      title="Organizations"
      query={query}
      emptyTitle="No Organizations yet"
      emptyDescription={
        canCreate
          ? 'Create the first Organization to start organizing work.'
          : 'You will see an Organization here once an Organization Owner adds you to it.'
      }
      action={
        canCreate &&
        !creating && (
          <Button
            size="sm"
            onClick={() => {
              setCreating(true);
            }}
          >
            New Organization
          </Button>
        )
      }
      form={
        creating && (
          <CreateOrganizationForm
            onClose={() => {
              setCreating(false);
            }}
          />
        )
      }
      renderItem={OrganizationRow}
      onPageChange={setPage}
    />
  );
}
