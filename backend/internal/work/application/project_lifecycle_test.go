package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

type fakeProjectLifecycleRepo struct {
	project domain.Project
	pending map[domain.ProjectID]domain.Project
}

func (r *fakeProjectLifecycleRepo) ListByWorkspaceFiltered(_ context.Context, _ domain.WorkspaceID, _ bool, _ PageRequest) ([]domain.Project, int, error) {
	return []domain.Project{r.project}, 1, nil
}
func (r *fakeProjectLifecycleRepo) ListPendingDeletionByWorkspace(_ context.Context, _ domain.WorkspaceID, _ PageRequest) ([]domain.Project, int, error) {
	out := make([]domain.Project, 0, len(r.pending))
	for _, p := range r.pending {
		out = append(out, p)
	}
	return out, len(out), nil
}
func (r *fakeProjectLifecycleRepo) Archive(_ context.Context, _ domain.ProjectID) (domain.Project, error) {
	now := time.Now().UTC()
	r.project.ArchivedAt = &now
	return r.project, nil
}
func (r *fakeProjectLifecycleRepo) Unarchive(_ context.Context, _ domain.ProjectID) (domain.Project, error) {
	r.project.ArchivedAt = nil
	return r.project, nil
}
func (r *fakeProjectLifecycleRepo) MarkPendingDeletion(_ context.Context, id domain.ProjectID, _ time.Time) error {
	r.pending[id] = r.project
	return nil
}
func (r *fakeProjectLifecycleRepo) FindPendingDeletion(_ context.Context, id domain.ProjectID) (domain.Project, error) {
	p, ok := r.pending[id]
	if !ok {
		return domain.Project{}, domain.ErrNotFound
	}
	return p, nil
}
func (r *fakeProjectLifecycleRepo) Restore(_ context.Context, id domain.ProjectID) (domain.Project, error) {
	p, ok := r.pending[id]
	if !ok {
		return domain.Project{}, domain.ErrNotFound
	}
	delete(r.pending, id)
	return p, nil
}
func (r *fakeProjectLifecycleRepo) PurgeExpired(_ context.Context) error { return nil }

func assertArchivedState(t *testing.T, label string, p domain.Project, err error, wantArchived bool) {
	t.Helper()
	if err != nil {
		t.Fatalf("%s: unexpected error %v", label, err)
	}
	if (p.ArchivedAt != nil) != wantArchived {
		t.Fatalf("%s: archived=%v, want %v", label, p.ArchivedAt != nil, wantArchived)
	}
}

func TestProjectArchiveAndUnarchive(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, _ := newTestWorkItemHarness(domain.RoleOwner)
	wsID := ws.access.WorkspaceID
	lc := &fakeProjectLifecycleRepo{
		project: domain.Project{ID: projectUUID, WorkspaceID: wsID, OrganizationID: ws.access.OrganizationID, Name: "Alpha"},
		pending: make(map[domain.ProjectID]domain.Project),
	}
	svc := NewService(projects, ws).WithProjectLifecycle(lc).WithDeletionGracePeriod(24 * time.Hour)

	archived, err := svc.ArchiveProject(ctx, ownerActor, string(projectUUID))
	assertArchivedState(t, "ArchiveProject", archived, err, true)
	projects.project = lc.project
	again, err := svc.ArchiveProject(ctx, ownerActor, string(projectUUID))
	assertArchivedState(t, "ArchiveProject idempotent", again, err, true)

	if _, total, err := svc.ListProjectsFiltered(ctx, ownerActor, string(wsID), true, PageRequest{Limit: 10}); err != nil || total != 1 {
		t.Fatalf("ListProjectsFiltered(true): got (%d, %v)", total, err)
	}

	unarchived, err := svc.UnarchiveProject(ctx, ownerActor, string(projectUUID))
	assertArchivedState(t, "UnarchiveProject", unarchived, err, false)
	projects.project = lc.project
	unarchivedAgain, err := svc.UnarchiveProject(ctx, ownerActor, string(projectUUID))
	assertArchivedState(t, "UnarchiveProject idempotent", unarchivedAgain, err, false)
}

func TestProjectDeleteAndRestore(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, _ := newTestWorkItemHarness(domain.RoleOwner)
	ws.access.CanRestorePendingDeletion = true
	wsID := ws.access.WorkspaceID
	lc := &fakeProjectLifecycleRepo{
		project: domain.Project{ID: projectUUID, WorkspaceID: wsID, OrganizationID: ws.access.OrganizationID, Name: "Alpha"},
		pending: make(map[domain.ProjectID]domain.Project),
	}
	svc := NewService(projects, ws).WithProjectLifecycle(lc).WithDeletionGracePeriod(24 * time.Hour)

	if _, _, err := svc.ListProjectsFiltered(ctx, ownerActor, string(wsID), false, PageRequest{Limit: 10}); err != nil {
		t.Fatalf("ListProjectsFiltered(false): %v", err)
	}
	if err := svc.DeleteProject(ctx, ownerActor, string(projectUUID)); err != nil {
		t.Fatalf("DeleteProject: %v", err)
	}
	if _, total, err := svc.ListPendingDeletionProjects(ctx, ownerActor, string(wsID), PageRequest{Limit: 10}); err != nil || total != 1 {
		t.Fatalf("ListPendingDeletionProjects: got (%d, %v)", total, err)
	}
	if _, err := svc.RestoreProject(ctx, ownerActor, string(projectUUID)); err != nil {
		t.Fatalf("RestoreProject: %v", err)
	}
}

func TestProjectLifecycleAuthorizationAndErrors(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, _ := newTestWorkItemHarness(domain.RoleContributor)
	wsID := ws.access.WorkspaceID
	lc := &fakeProjectLifecycleRepo{
		project: domain.Project{ID: projectUUID, WorkspaceID: wsID, OrganizationID: ws.access.OrganizationID, Name: "Alpha"},
		pending: make(map[domain.ProjectID]domain.Project),
	}
	svc := NewService(projects, ws).WithProjectLifecycle(lc)

	if _, _, err := svc.ListPendingDeletionProjects(ctx, contribActor, string(wsID), PageRequest{Limit: 10}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("contributor ListPendingDeletionProjects: got %v, want ErrForbidden", err)
	}
	if _, err := svc.ArchiveProject(ctx, contribActor, string(projectUUID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("contributor ArchiveProject: got %v, want ErrForbidden", err)
	}
	if _, err := svc.UnarchiveProject(ctx, contribActor, string(projectUUID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("contributor UnarchiveProject: got %v, want ErrForbidden", err)
	}
	if err := svc.DeleteProject(ctx, contribActor, string(projectUUID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("contributor DeleteProject: got %v, want ErrForbidden", err)
	}
	if _, err := svc.RestoreProject(ctx, contribActor, "bad-id"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("bad id RestoreProject: got %v, want ErrNotFound", err)
	}
	if _, err := svc.RestoreProject(ctx, contribActor, string(projectUUID)); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing RestoreProject: got %v, want ErrNotFound", err)
	}
}

func TestProjectReadOnlyAndRestorePermissions(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, _ := newTestWorkItemHarness(domain.RoleOwner)
	wsID := ws.access.WorkspaceID
	lc := &fakeProjectLifecycleRepo{
		project: domain.Project{ID: projectUUID, WorkspaceID: wsID, OrganizationID: ws.access.OrganizationID, Name: "Alpha"},
		pending: make(map[domain.ProjectID]domain.Project),
	}
	svc := NewService(projects, ws).WithProjectLifecycle(lc)

	_ = svc.DeleteProject(ctx, ownerActor, string(projectUUID))
	if _, err := svc.RestoreProject(ctx, ownerActor, string(projectUUID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("non-org-owner restore: got %v, want ErrForbidden", err)
	}
	ws.access.Archived = true
	if _, err := svc.CreateProject(ctx, ownerActor, CreateProjectInput{WorkspaceID: string(wsID), Name: "Blocked"}); !errors.Is(err, domain.ErrProjectReadOnly) {
		t.Fatalf("CreateProject in archived workspace: got %v, want ErrProjectReadOnly", err)
	}
	newName := "Blocked"
	if _, err := svc.UpdateProject(ctx, ownerActor, UpdateProjectInput{ID: string(projectUUID), Name: &newName}); !errors.Is(err, domain.ErrProjectReadOnly) {
		t.Fatalf("UpdateProject in archived workspace: got %v, want ErrProjectReadOnly", err)
	}
	if _, _, err := svc.ListProjectsFiltered(ctx, ownerActor, "not-a-uuid", true, PageRequest{Limit: 10}); !errors.Is(err, domain.ErrInvalidWorkspaceRef) {
		t.Fatalf("ListProjectsFiltered bad id: got %v, want ErrInvalidWorkspaceRef", err)
	}
	if _, _, err := svc.ListPendingDeletionProjects(ctx, ownerActor, "not-a-uuid", PageRequest{Limit: 10}); !errors.Is(err, domain.ErrInvalidWorkspaceRef) {
		t.Fatalf("ListPendingDeletionProjects bad id: got %v, want ErrInvalidWorkspaceRef", err)
	}
}
