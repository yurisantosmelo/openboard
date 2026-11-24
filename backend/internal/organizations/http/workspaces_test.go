package organizationshttp

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

const workspaceJSON = `{"id":"w1","organization_id":"o1","name":"Legal","visibility":"restricted",` +
	`"created_at":"2026-11-17T12:00:00Z","updated_at":"2026-11-17T12:00:00Z","current_user_role":"owner"}`

var legal = domain.Workspace{
	ID: "w1", OrganizationID: "o1", Name: "Legal", Visibility: domain.VisibilityRestricted, CreatedAt: created, UpdatedAt: created,
	ViewerRole: domain.WorkspaceRoleOwner,
}

type fakeWorkspaceService struct {
	err    error
	actor  domain.Actor
	in     application.CreateWorkspaceInput
	change application.UpdateWorkspaceInput
	id     string
	orgID  string
	page   application.PageRequest
	items  []domain.Workspace
	total  int
}

func (f *fakeWorkspaceService) UpdateWorkspace(_ context.Context, actor domain.Actor, in application.UpdateWorkspaceInput) (domain.Workspace, error) {
	f.actor, f.change = actor, in
	return legal, f.err
}

func (f *fakeWorkspaceService) CreateWorkspace(_ context.Context, actor domain.Actor, in application.CreateWorkspaceInput) (domain.Workspace, error) {
	f.actor, f.in = actor, in
	return legal, f.err
}

func (f *fakeWorkspaceService) GetWorkspace(_ context.Context, actor domain.Actor, rawID string) (domain.Workspace, error) {
	f.actor, f.id = actor, rawID
	return legal, f.err
}

func (f *fakeWorkspaceService) ListWorkspaces(_ context.Context, actor domain.Actor, rawOrganizationID string, page application.PageRequest) ([]domain.Workspace, int, error) {
	f.actor, f.orgID, f.page = actor, rawOrganizationID, page
	return f.items, f.total, f.err
}

func serveWorkspaces(svc WorkspaceService, auth Auth, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	NewWorkspaceHandler(svc, auth, slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

func TestCreateWorkspace(t *testing.T) {
	svc := &fakeWorkspaceService{}
	rec := serveWorkspaces(svc, fakeAuth(false), http.MethodPost, "/api/v1/workspaces",
		`{"organization_id":"o1","name":"Legal","visibility":"open"}`)

	if rec.Code != http.StatusCreated || rec.Header().Get("Location") != "/api/v1/workspaces/w1" {
		t.Fatalf("status %d, Location %q", rec.Code, rec.Header().Get("Location"))
	}
	want := application.CreateWorkspaceInput{OrganizationID: "o1", Name: "Legal", Visibility: "open"}
	if svc.actor != administrator || svc.in != want {
		t.Errorf("service called with %+v, %+v", svc.actor, svc.in)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != workspaceJSON {
		t.Errorf("body %s, want %s", got, workspaceJSON)
	}
}

func TestCreateWorkspaceRejectsMalformedBody(t *testing.T) {
	rec := serveWorkspaces(&fakeWorkspaceService{}, fakeAuth(false), http.MethodPost, "/api/v1/workspaces", `{"name":`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status %d, want 400", rec.Code)
	}
}

func TestCreateWorkspaceErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		status int
		slug   string
		fields []string
	}{
		"forbidden":  {domain.ErrForbidden, http.StatusForbidden, "forbidden", nil},
		"name taken": {domain.ErrWorkspaceNameTaken, http.StatusConflict, "workspace-name-taken", nil},
		"unknown Organization": {domain.ErrUnknownOrganization, http.StatusUnprocessableEntity, "validation-error",
			[]string{"organization_id:not_found"}},
		"every field invalid": {errors.Join(domain.ErrInvalidOrganizationRef, domain.ErrInvalidName, domain.ErrInvalidVisibility),
			http.StatusUnprocessableEntity, "validation-error", []string{"organization_id:invalid", "name:invalid", "visibility:invalid"}},
		"internal": {errors.New("store down"), http.StatusInternalServerError, "internal-error", nil},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkspaces(&fakeWorkspaceService{err: tc.err}, fakeAuth(false), http.MethodPost, "/api/v1/workspaces", `{"name":"Legal"}`)
			p := problemOf(t, rec)
			if rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Fatalf("status %d, type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
			var got []string
			for _, fe := range p.Errors {
				got = append(got, fe.Field+":"+fe.Code)
			}
			if strings.Join(got, ",") != strings.Join(tc.fields, ",") {
				t.Errorf("fields %v, want %v", got, tc.fields)
			}
		})
	}
}

func TestListWorkspaces(t *testing.T) {
	svc := &fakeWorkspaceService{items: []domain.Workspace{legal}, total: 11}
	rec := serveWorkspaces(svc, fakeAuth(false), http.MethodGet, "/api/v1/workspaces?organization_id=o1&page=2&page_size=10", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if svc.orgID != "o1" || svc.page != (application.PageRequest{Limit: 10, Offset: 10}) {
		t.Errorf("service called with %q, %+v", svc.orgID, svc.page)
	}
	want := `{"items":[` + workspaceJSON + `],"page":2,"page_size":10,"total_items":11,"total_pages":2}`
	if got := strings.TrimSpace(rec.Body.String()); got != want {
		t.Errorf("body %s, want %s", got, want)
	}
}

func TestListWorkspacesFailures(t *testing.T) {
	cases := map[string]struct {
		err    error
		query  string
		status int
	}{
		"bad page":             {nil, "?organization_id=o1&page=0", http.StatusUnprocessableEntity},
		"missing Organization": {domain.ErrInvalidOrganizationRef, "", http.StatusUnprocessableEntity},
		"unseen Organization":  {domain.ErrUnknownOrganization, "?organization_id=o2", http.StatusUnprocessableEntity},
		"service error":        {errors.New("store down"), "?organization_id=o1", http.StatusInternalServerError},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkspaces(&fakeWorkspaceService{err: tc.err}, fakeAuth(false), http.MethodGet, "/api/v1/workspaces"+tc.query, "")
			if rec.Code != tc.status {
				t.Errorf("status %d, want %d", rec.Code, tc.status)
			}
		})
	}
}

func TestGetWorkspace(t *testing.T) {
	svc := &fakeWorkspaceService{}
	rec := serveWorkspaces(svc, fakeAuth(false), http.MethodGet, "/api/v1/workspaces/w1", "")
	if rec.Code != http.StatusOK || svc.id != "w1" || strings.TrimSpace(rec.Body.String()) != workspaceJSON {
		t.Fatalf("status %d, id %q, body %s", rec.Code, svc.id, rec.Body.String())
	}

	rec = serveWorkspaces(&fakeWorkspaceService{err: domain.ErrWorkspaceNotFound}, fakeAuth(false), http.MethodGet, "/api/v1/workspaces/w2", "")
	if p := problemOf(t, rec); rec.Code != http.StatusNotFound || !strings.HasSuffix(p.Type, "/not-found") {
		t.Errorf("status %d, type %q; want 404 not-found", rec.Code, p.Type)
	}
}

func TestUpdateWorkspace(t *testing.T) {
	svc := &fakeWorkspaceService{}
	rec := serveWorkspaces(svc, fakeAuth(false), http.MethodPatch, "/api/v1/workspaces/w1", `{"name":"Legal","visibility":"open"}`)

	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != workspaceJSON {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}
	got := svc.change
	if svc.actor != administrator || got.ID != "w1" || got.Name == nil || *got.Name != "Legal" ||
		got.Visibility == nil || *got.Visibility != "open" {
		t.Errorf("service called with %+v, %+v", svc.actor, got)
	}
}

func TestUpdateWorkspaceLeavesOutMissingFields(t *testing.T) {
	svc := &fakeWorkspaceService{}
	rec := serveWorkspaces(svc, fakeAuth(false), http.MethodPatch, "/api/v1/workspaces/w1", `{"visibility":"open"}`)
	if rec.Code != http.StatusOK || svc.change.Name != nil {
		t.Fatalf("status %d, change %+v", rec.Code, svc.change)
	}
}

func TestUpdateWorkspaceErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		body   string
		status int
	}{
		"malformed body": {nil, `{"name":`, http.StatusBadRequest},
		"forbidden":      {domain.ErrForbidden, `{"name":"Legal"}`, http.StatusForbidden},
		"not found":      {domain.ErrWorkspaceNotFound, `{"name":"Legal"}`, http.StatusNotFound},
		"name taken":     {domain.ErrWorkspaceNameTaken, `{"name":"Legal"}`, http.StatusConflict},
		"invalid fields": {errors.Join(domain.ErrInvalidName, domain.ErrInvalidVisibility), `{"name":" "}`, http.StatusUnprocessableEntity},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkspaces(&fakeWorkspaceService{err: tc.err}, fakeAuth(false), http.MethodPatch, "/api/v1/workspaces/w1", tc.body)
			if rec.Code != tc.status {
				t.Errorf("status %d, want %d", rec.Code, tc.status)
			}
		})
	}
}

func TestWorkspaceRoutesRequireSession(t *testing.T) {
	for _, path := range []string{"/api/v1/workspaces", "/api/v1/workspaces/w1"} {
		if rec := serveWorkspaces(&fakeWorkspaceService{}, fakeAuth(true), http.MethodGet, path, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("GET %s = %d, want 401", path, rec.Code)
		}
	}
	rec := serveWorkspaces(&fakeWorkspaceService{}, fakeAuth(true), http.MethodPatch, "/api/v1/workspaces/w1", `{"name":"Legal"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("PATCH = %d, want 401", rec.Code)
	}
}
