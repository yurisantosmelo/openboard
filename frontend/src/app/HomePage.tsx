import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '../features/auth';
import { OrganizationList } from '../features/organizations';

export function HomePage() {
  const { data: user } = useCurrentUser();
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{`Welcome, ${user?.name ?? ''}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">You are signed in as {user?.username}.</p>
        </CardContent>
      </Card>
      <OrganizationList canCreate={user?.isAdministrator ?? false} />
    </div>
  );
}
