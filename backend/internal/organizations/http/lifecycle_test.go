package organizationshttp

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
)

type fakeLifecycleOrgSvc struct {
	org domain.Organization
	err error
}

func (f *fakeLifecycleOrgSvc) CreateOrganization(_ context.Context, _ domain.Actor, _ application.CreateOrganizationInput) (domain.Organization, error) {
	return f.org, f.err
}
func (f *fakeLifecycleOrgSvc) GetOrganization(_ context.Context, _ domain.Actor, _ string) (domain.Organization, error) {
	return f.org, f.err
}
func (f *fakeLifecycleOrgSvc) ListOrganizations(_ context.Context, _ domain.Actor, _ application.PageRequest) ([]domain.Organization, int, error) {
	return []domain.Organization{f.org}, 1, f.err
}
func (f *fakeLifecycleOrgSvc) DeleteOrganization(_ context.Context, _ domain.Actor, _ string) error {
	return f.err
}
func (f *fakeLifecycleOrgSvc) RestoreOrganization(_ context.Context, _ domain.Actor, _ string) (domain.Organization, error) {
	return f.org, f.err
}
func (f *fakeLifecycleOrgSvc) ListPendingDeletionOrganizations(_ context.Context, _ domain.Actor, _ application.PageRequest) ([]domain.Organization, int, error) {
	return []domain.Organization{f.org}, 1, f.err
}

type fakeLifecycleWSSvc struct {
	ws  domain.Workspace
	err error
}

func (f *fakeLifecycleWSSvc) CreateWorkspace(_ context.Context, _ domain.Actor, _ application.CreateWorkspaceInput) (domain.Workspace, error) {
	return f.ws, f.err
}
func (f *fakeLifecycleWSSvc) GetWorkspace(_ context.Context, _ domain.Actor, _ string) (domain.Workspace, error) {
	return f.ws, f.err
}
func (f *fakeLifecycleWSSvc) ListWorkspaces(_ context.Context, _ domain.Actor, _ string, _ application.PageRequest) ([]domain.Workspace, int, error) {
	return []domain.Workspace{f.ws}, 1, f.err
}
func (f *fakeLifecycleWSSvc) UpdateWorkspace(_ context.Context, _ domain.Actor, _ application.UpdateWorkspaceInput) (domain.Workspace, error) {
	return f.ws, f.err
}
func (f *fakeLifecycleWSSvc) ListWorkspacesFiltered(_ context.Context, _ domain.Actor, _ string, _ bool, _ application.PageRequest) ([]domain.Workspace, int, error) {
	return []domain.Workspace{f.ws}, 1, f.err
}
func (f *fakeLifecycleWSSvc) ListPendingDeletionWorkspaces(_ context.Context, _ domain.Actor, _ string, _ application.PageRequest) ([]domain.Workspace, int, error) {
	return []domain.Workspace{f.ws}, 1, f.err
}
func (f *fakeLifecycleWSSvc) ArchiveWorkspace(_ context.Context, _ domain.Actor, _ string) (domain.Workspace, error) {
	return f.ws, f.err
}
func (f *fakeLifecycleWSSvc) UnarchiveWorkspace(_ context.Context, _ domain.Actor, _ string) (domain.Workspace, error) {
	return f.ws, f.err
}
func (f *fakeLifecycleWSSvc) DeleteWorkspace(_ context.Context, _ domain.Actor, _ string) error {
	return f.err
}
func (f *fakeLifecycleWSSvc) RestoreWorkspace(_ context.Context, _ domain.Actor, _ string) (domain.Workspace, error) {
	return f.ws, f.err
}

func testLifecycleAuth() Auth {
	return Auth{
		Authenticated: func(next httpx.HandlerFunc) httpx.HandlerFunc { return next },
		Actor:         func(context.Context) domain.Actor { return domain.Actor{UserID: "u1", IsAdministrator: true} },
	}
}

func TestOrganizationLifecycleHTTP(t *testing.T) {
	svc := &fakeLifecycleOrgSvc{org: domain.Organization{ID: "o1", Name: "Acme", CreatedAt: time.Now().UTC(), ViewerRole: domain.RoleOwner}}
	mux := http.NewServeMux()
	NewHandler(svc, testLifecycleAuth(), slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)

	for _, tc := range []struct {
		method, path string
		want         int
	}{
		{http.MethodGet, "/api/v1/organizations?pending_deletion=true", http.StatusOK},
		{http.MethodDelete, "/api/v1/organizations/o1", http.StatusNoContent},
		{http.MethodPost, "/api/v1/organizations/o1/restore", http.StatusOK},
	} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, nil))
		if rec.Code != tc.want {
			t.Fatalf("%s %s: got %d, want %d", tc.method, tc.path, rec.Code, tc.want)
		}
	}
}

func TestWorkspaceLifecycleHTTP(t *testing.T) {
	now := time.Now().UTC()
	svc := &fakeLifecycleWSSvc{ws: domain.Workspace{ID: "w1", OrganizationID: "o1", Name: "Eng", Visibility: domain.VisibilityOpen, CreatedAt: now, UpdatedAt: now, ViewerRole: domain.WorkspaceRoleOwner}}
	mux := http.NewServeMux()
	NewWorkspaceHandler(svc, testLifecycleAuth(), slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)

	for _, tc := range []struct {
		method, path string
		err          error
		want         int
	}{
		{http.MethodGet, "/api/v1/workspaces?organization_id=o1&include_archived=true", nil, http.StatusOK},
		{http.MethodGet, "/api/v1/workspaces?organization_id=o1&pending_deletion=true", nil, http.StatusOK},
		{http.MethodPost, "/api/v1/workspaces/w1/archive", nil, http.StatusOK},
		{http.MethodPost, "/api/v1/workspaces/w1/unarchive", nil, http.StatusOK},
		{http.MethodDelete, "/api/v1/workspaces/w1", nil, http.StatusNoContent},
		{http.MethodPost, "/api/v1/workspaces/w1/restore", nil, http.StatusOK},
		{http.MethodPost, "/api/v1/workspaces/w1/archive", domain.ErrLastActiveWorkspace, http.StatusConflict},
		{http.MethodPost, "/api/v1/workspaces/w1/archive", domain.ErrWorkspaceArchived, http.StatusConflict},
	} {
		svc.err = tc.err
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, nil))
		if rec.Code != tc.want {
			t.Fatalf("%s %s: got %d, want %d", tc.method, tc.path, rec.Code, tc.want)
		}
	}
}
