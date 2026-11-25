import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '../features/auth';
import { OrganizationList } from '../features/organizations';
import { PendingDeletionOrganizationsCard } from '../features/organizations/components/PendingDeletionOrganizationsCard';

export function HomePage() {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.isAdministrator ?? false;
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{`Welcome, ${user?.name ?? ''}`}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">You are signed in as {user?.username}.</p>
        </CardContent>
      </Card>
      <OrganizationList canCreate={isAdmin} />
      {isAdmin && <PendingDeletionOrganizationsCard />}
    </div>
  );
}
