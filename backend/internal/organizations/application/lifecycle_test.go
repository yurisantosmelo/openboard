package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

type fakeOrgLifecycleRepo struct {
	orgs    map[domain.OrganizationID]domain.Organization
	pending map[domain.OrganizationID]domain.Organization
}

func (r *fakeOrgLifecycleRepo) Create(_ context.Context, _ NewOrganization) (domain.Organization, error) {
	return domain.Organization{}, nil
}
func (r *fakeOrgLifecycleRepo) Find(_ context.Context, id domain.OrganizationID, _ Scope) (domain.Organization, error) {
	o, ok := r.orgs[id]
	if !ok {
		return domain.Organization{}, domain.ErrNotFound
	}
	return o, nil
}
func (r *fakeOrgLifecycleRepo) List(_ context.Context, _ Scope, _ PageRequest) ([]domain.Organization, int, error) {
	return nil, 0, nil
}
func (r *fakeOrgLifecycleRepo) MarkPendingDeletion(_ context.Context, id domain.OrganizationID, purgeAfter time.Time) error {
	o, ok := r.orgs[id]
	if !ok {
		return domain.ErrNotFound
	}
	now := time.Now().UTC()
	o.DeletedAt, o.PurgeAfter = &now, &purgeAfter
	delete(r.orgs, id)
	r.pending[id] = o
	return nil
}
func (r *fakeOrgLifecycleRepo) Restore(_ context.Context, id domain.OrganizationID) (domain.Organization, error) {
	o, ok := r.pending[id]
	if !ok {
		return domain.Organization{}, domain.ErrNotFound
	}
	o.DeletedAt, o.PurgeAfter = nil, nil
	delete(r.pending, id)
	r.orgs[id] = o
	return o, nil
}
func (r *fakeOrgLifecycleRepo) ListPendingDeletion(_ context.Context, _ PageRequest) ([]domain.Organization, int, error) {
	out := make([]domain.Organization, 0, len(r.pending))
	for _, o := range r.pending {
		out = append(out, o)
	}
	return out, len(out), nil
}
func (r *fakeOrgLifecycleRepo) PurgeExpired(_ context.Context) error { return nil }

type fakeWSLifecycleRepo struct {
	role    domain.Role
	ws      domain.Workspace
	pending map[domain.WorkspaceID]domain.Workspace
}

func (r *fakeWSLifecycleRepo) RoleIn(_ context.Context, _ domain.OrganizationID, _ Scope) (domain.Role, error) {
	return r.role, nil
}
func (r *fakeWSLifecycleRepo) Create(_ context.Context, _ NewWorkspace) (domain.Workspace, error) {
	return r.ws, nil
}
func (r *fakeWSLifecycleRepo) Find(_ context.Context, _ domain.WorkspaceID, _ Scope) (domain.Workspace, error) {
	return r.ws, nil
}
func (r *fakeWSLifecycleRepo) List(_ context.Context, _ domain.OrganizationID, _ Scope, _ PageRequest) ([]domain.Workspace, int, error) {
	return []domain.Workspace{r.ws}, 1, nil
}
func (r *fakeWSLifecycleRepo) Update(_ context.Context, _ WorkspaceChange) (domain.Workspace, error) {
	return r.ws, nil
}
func (r *fakeWSLifecycleRepo) ListFiltered(_ context.Context, _ domain.OrganizationID, _ Scope, _ bool, _ PageRequest) ([]domain.Workspace, int, error) {
	return []domain.Workspace{r.ws}, 1, nil
}
func (r *fakeWSLifecycleRepo) Archive(_ context.Context, _ domain.WorkspaceID) (domain.Workspace, error) {
	now := time.Now().UTC()
	r.ws.ArchivedAt = &now
	return r.ws, nil
}
func (r *fakeWSLifecycleRepo) Unarchive(_ context.Context, _ domain.WorkspaceID) (domain.Workspace, error) {
	r.ws.ArchivedAt = nil
	return r.ws, nil
}
func (r *fakeWSLifecycleRepo) MarkPendingDeletion(_ context.Context, id domain.WorkspaceID, _ time.Time) error {
	r.pending[id] = r.ws
	return nil
}
func (r *fakeWSLifecycleRepo) FindPendingDeletion(_ context.Context, id domain.WorkspaceID) (domain.Workspace, error) {
	ws, ok := r.pending[id]
	if !ok {
		return domain.Workspace{}, domain.ErrWorkspaceNotFound
	}
	return ws, nil
}
func (r *fakeWSLifecycleRepo) Restore(_ context.Context, id domain.WorkspaceID) (domain.Workspace, error) {
	ws, ok := r.pending[id]
	if !ok {
		return domain.Workspace{}, domain.ErrWorkspaceNotFound
	}
	delete(r.pending, id)
	return ws, nil
}
func (r *fakeWSLifecycleRepo) ListPendingDeletion(_ context.Context, _ domain.OrganizationID, _ PageRequest) ([]domain.Workspace, int, error) {
	out := make([]domain.Workspace, 0, len(r.pending))
	for _, w := range r.pending {
		out = append(out, w)
	}
	return out, len(out), nil
}
func (r *fakeWSLifecycleRepo) PurgeExpired(_ context.Context) error { return nil }

func TestOrganizationLifecycleService(t *testing.T) {
	ctx := context.Background()
	orgID := domain.OrganizationID("11111111-1111-4111-8111-111111111111")
	repo := &fakeOrgLifecycleRepo{
		orgs:    map[domain.OrganizationID]domain.Organization{orgID: {ID: orgID, Name: "Acme", ViewerRole: domain.RoleOwner}},
		pending: make(map[domain.OrganizationID]domain.Organization),
	}
	svc := NewService(repo).WithDeletionGracePeriod(24 * time.Hour)
	admin := domain.Actor{UserID: "22222222-2222-4222-8222-222222222222", IsAdministrator: true}
	owner := domain.Actor{UserID: "33333333-3333-4333-8333-333333333333"}

	if err := svc.DeleteOrganization(ctx, owner, string(orgID)); err != nil {
		t.Fatalf("DeleteOrganization: %v", err)
	}
	if _, err := svc.RestoreOrganization(ctx, owner, string(orgID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("non-admin restore: got %v, want ErrForbidden", err)
	}
	if _, _, err := svc.ListPendingDeletionOrganizations(ctx, owner, PageRequest{Limit: 10}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("non-admin list pending: got %v, want ErrForbidden", err)
	}
	if list, total, err := svc.ListPendingDeletionOrganizations(ctx, admin, PageRequest{Limit: 10}); err != nil || total != 1 || len(list) != 1 {
		t.Fatalf("admin list pending: got (%d, %v)", total, err)
	}
	if _, err := svc.RestoreOrganization(ctx, admin, string(orgID)); err != nil {
		t.Fatalf("admin restore: %v", err)
	}
}

func TestWorkspaceArchiveService(t *testing.T) {
	ctx := context.Background()
	orgID := domain.OrganizationID("11111111-1111-4111-8111-111111111111")
	wsID := domain.WorkspaceID("44444444-4444-4444-8444-444444444444")
	repo := &fakeWSLifecycleRepo{
		role:    domain.RoleOwner,
		ws:      domain.Workspace{ID: wsID, OrganizationID: orgID, Name: "Eng", Visibility: domain.VisibilityOpen, ViewerRole: domain.WorkspaceRoleOwner},
		pending: make(map[domain.WorkspaceID]domain.Workspace),
	}
	svc := NewWorkspaceService(repo).WithDeletionGracePeriod(24 * time.Hour)
	owner := domain.Actor{UserID: "33333333-3333-4333-8333-333333333333"}

	if archived, err := svc.ArchiveWorkspace(ctx, owner, string(wsID)); err != nil || !archived.IsArchived() {
		t.Fatalf("ArchiveWorkspace: got (%+v, %v)", archived, err)
	}
	newName := "Blocked"
	if _, err := svc.UpdateWorkspace(ctx, owner, UpdateWorkspaceInput{ID: string(wsID), Name: &newName}); !errors.Is(err, domain.ErrWorkspaceArchived) {
		t.Fatalf("UpdateWorkspace when archived: got %v, want ErrWorkspaceArchived", err)
	}
	if _, total, err := svc.ListWorkspacesFiltered(ctx, owner, string(orgID), true, PageRequest{Limit: 10}); err != nil || total != 1 {
		t.Fatalf("ListWorkspacesFiltered: got (%d, %v)", total, err)
	}
	if unarchived, err := svc.UnarchiveWorkspace(ctx, owner, string(wsID)); err != nil || unarchived.IsArchived() {
		t.Fatalf("UnarchiveWorkspace: got (%+v, %v)", unarchived, err)
	}
}

func TestWorkspaceDeleteAndRestoreService(t *testing.T) {
	ctx := context.Background()
	orgID := domain.OrganizationID("11111111-1111-4111-8111-111111111111")
	wsID := domain.WorkspaceID("44444444-4444-4444-8444-444444444444")
	repo := &fakeWSLifecycleRepo{
		role:    domain.RoleOwner,
		ws:      domain.Workspace{ID: wsID, OrganizationID: orgID, Name: "Eng", Visibility: domain.VisibilityOpen, ViewerRole: domain.WorkspaceRoleOwner},
		pending: make(map[domain.WorkspaceID]domain.Workspace),
	}
	svc := NewWorkspaceService(repo).WithDeletionGracePeriod(24 * time.Hour)
	owner := domain.Actor{UserID: "33333333-3333-4333-8333-333333333333"}

	if err := svc.DeleteWorkspace(ctx, owner, string(wsID)); err != nil {
		t.Fatalf("DeleteWorkspace: %v", err)
	}
	if _, total, err := svc.ListPendingDeletionWorkspaces(ctx, owner, string(orgID), PageRequest{Limit: 10}); err != nil || total != 1 {
		t.Fatalf("ListPendingDeletionWorkspaces: got (%d, %v)", total, err)
	}
	if _, err := svc.RestoreWorkspace(ctx, owner, string(wsID)); err != nil {
		t.Fatalf("RestoreWorkspace: %v", err)
	}
}
