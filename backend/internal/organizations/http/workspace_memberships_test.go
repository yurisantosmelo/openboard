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

const workspaceMembershipJSON = `{"workspace_id":"w1","organization_id":"o1","user_id":"u1","username":"ana","name":"Ana Silva","role":"viewer","created_at":"2026-11-17T12:00:00Z"}`

var anaWorkspaceMembership = domain.WorkspaceMembership{
	WorkspaceID: "w1", OrganizationID: "o1", UserID: "u1", Username: "ana", Name: "Ana Silva", Role: domain.WorkspaceRoleViewer, CreatedAt: created,
}

type fakeWorkspaceMembershipService struct {
	err    error
	actor  domain.Actor
	wsID   string
	page   application.PageRequest
	in     application.AddWorkspaceMembershipInput
	update application.UpdateWorkspaceMembershipInput
	remove application.RemoveWorkspaceMembershipInput
	items  []domain.WorkspaceMembership
	total  int
}

func (f *fakeWorkspaceMembershipService) ListMemberships(_ context.Context, actor domain.Actor, rawWorkspaceID string, page application.PageRequest) ([]domain.WorkspaceMembership, int, error) {
	f.actor, f.wsID, f.page = actor, rawWorkspaceID, page
	return f.items, f.total, f.err
}

func (f *fakeWorkspaceMembershipService) AddMembership(_ context.Context, actor domain.Actor, in application.AddWorkspaceMembershipInput) (domain.WorkspaceMembership, error) {
	f.actor, f.in = actor, in
	return anaWorkspaceMembership, f.err
}

func (f *fakeWorkspaceMembershipService) UpdateMembership(_ context.Context, actor domain.Actor, in application.UpdateWorkspaceMembershipInput) (domain.WorkspaceMembership, error) {
	f.actor, f.update = actor, in
	return anaWorkspaceMembership, f.err
}

func (f *fakeWorkspaceMembershipService) RemoveMembership(_ context.Context, actor domain.Actor, in application.RemoveWorkspaceMembershipInput) error {
	f.actor, f.remove = actor, in
	return f.err
}

func serveWorkspaceMemberships(svc WorkspaceMembershipService, auth Auth, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	NewWorkspaceMembershipHandler(svc, auth, slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

func TestListWorkspaceMemberships(t *testing.T) {
	svc := &fakeWorkspaceMembershipService{items: []domain.WorkspaceMembership{anaWorkspaceMembership}, total: 11}
	rec := serveWorkspaceMemberships(svc, fakeAuth(false), http.MethodGet, "/api/v1/workspaces/w1/memberships?page=2&page_size=10", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if svc.actor != administrator || svc.wsID != "w1" || svc.page != (application.PageRequest{Limit: 10, Offset: 10}) {
		t.Errorf("service called with %+v, %q, %+v", svc.actor, svc.wsID, svc.page)
	}
	want := `{"items":[` + workspaceMembershipJSON + `],"page":2,"page_size":10,"total_items":11,"total_pages":2}`
	if got := strings.TrimSpace(rec.Body.String()); got != want {
		t.Errorf("body %s, want %s", got, want)
	}
}

func TestListWorkspaceMembershipsErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		query  string
		status int
	}{
		"bad page":   {nil, "?page=0", http.StatusUnprocessableEntity},
		"not found":  {domain.ErrWorkspaceNotFound, "", http.StatusNotFound},
		"forbidden":  {domain.ErrForbidden, "", http.StatusForbidden},
		"store down": {errors.New("store down"), "", http.StatusInternalServerError},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkspaceMemberships(&fakeWorkspaceMembershipService{err: tc.err}, fakeAuth(false), http.MethodGet, "/api/v1/workspaces/w1/memberships"+tc.query, "")
			if rec.Code != tc.status {
				t.Errorf("status %d, want %d", rec.Code, tc.status)
			}
		})
	}
}

func TestAddWorkspaceMembership(t *testing.T) {
	svc := &fakeWorkspaceMembershipService{}
	rec := serveWorkspaceMemberships(svc, fakeAuth(false), http.MethodPost, "/api/v1/workspaces/w1/memberships",
		`{"username":"ana","role":"viewer"}`)

	if rec.Code != http.StatusCreated || rec.Header().Get("Location") != "/api/v1/workspaces/w1/memberships/u1" {
		t.Fatalf("status %d, Location %q", rec.Code, rec.Header().Get("Location"))
	}
	want := application.AddWorkspaceMembershipInput{WorkspaceID: "w1", Username: "ana", Role: "viewer"}
	if svc.actor != administrator || svc.in != want || strings.TrimSpace(rec.Body.String()) != workspaceMembershipJSON {
		t.Errorf("called (%+v, %+v), body %s", svc.actor, svc.in, rec.Body.String())
	}
}

func TestAddWorkspaceMembershipErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		body   string
		status int
		slug   string
		fields []string
	}{
		"malformed":   {nil, `{"username":`, http.StatusBadRequest, "malformed-request", nil},
		"not found":   {domain.ErrWorkspaceNotFound, `{"username":"ana"}`, http.StatusNotFound, "not-found", nil},
		"forbidden":   {domain.ErrForbidden, `{"username":"ana"}`, http.StatusForbidden, "forbidden", nil},
		"duplicate":   {domain.ErrWorkspaceMembershipExists, `{"username":"ana"}`, http.StatusConflict, "workspace-membership-exists", nil},
		"deactivated": {domain.ErrUserDeactivated, `{"username":"ana"}`, http.StatusConflict, "user-deactivated", nil},
		"not in org":  {domain.ErrOrganizationMemberNotFound, `{"username":"ana"}`, http.StatusUnprocessableEntity, "validation-error", []string{"username:not_found"}},
		"all fields":  {errors.Join(domain.ErrInvalidUsername, domain.ErrInvalidWorkspaceRole), `{}`, http.StatusUnprocessableEntity, "validation-error", []string{"username:invalid", "role:invalid"}},
		"internal":    {errors.New("store down"), `{"username":"ana"}`, http.StatusInternalServerError, "internal-error", nil},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkspaceMemberships(&fakeWorkspaceMembershipService{err: tc.err}, fakeAuth(false), http.MethodPost, "/api/v1/workspaces/w1/memberships", tc.body)
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

func TestUpdateWorkspaceMembership(t *testing.T) {
	svc := &fakeWorkspaceMembershipService{}
	rec := serveWorkspaceMemberships(svc, fakeAuth(false), http.MethodPatch, "/api/v1/workspaces/w1/memberships/u1", `{"role":"viewer"}`)

	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != workspaceMembershipJSON {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}
	want := application.UpdateWorkspaceMembershipInput{WorkspaceID: "w1", UserID: "u1", Role: "viewer"}
	if svc.actor != administrator || svc.update != want {
		t.Errorf("service called with %+v, %+v", svc.actor, svc.update)
	}
}

func TestUpdateWorkspaceMembershipErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		body   string
		status int
		slug   string
	}{
		"malformed": {nil, `{"role":`, http.StatusBadRequest, "malformed-request"},
		"forbidden": {domain.ErrForbidden, `{"role":"viewer"}`, http.StatusForbidden, "forbidden"},
		"not found": {domain.ErrWorkspaceMembershipNotFound, `{"role":"viewer"}`, http.StatusNotFound, "not-found"},
		"invalid":   {domain.ErrInvalidWorkspaceRole, `{"role":"admin"}`, http.StatusUnprocessableEntity, "validation-error"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkspaceMemberships(&fakeWorkspaceMembershipService{err: tc.err}, fakeAuth(false), http.MethodPatch, "/api/v1/workspaces/w1/memberships/u1", tc.body)
			if p := problemOf(t, rec); rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Errorf("status %d, type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
		})
	}
}

func TestRemoveWorkspaceMembership(t *testing.T) {
	svc := &fakeWorkspaceMembershipService{}
	rec := serveWorkspaceMemberships(svc, fakeAuth(false), http.MethodDelete, "/api/v1/workspaces/w1/memberships/u1", "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d, want 204", rec.Code)
	}
	want := application.RemoveWorkspaceMembershipInput{WorkspaceID: "w1", UserID: "u1"}
	if svc.actor != administrator || svc.remove != want {
		t.Errorf("service called with %+v, %+v", svc.actor, svc.remove)
	}
}

func TestRemoveWorkspaceMembershipErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		status int
		slug   string
	}{
		"forbidden": {domain.ErrForbidden, http.StatusForbidden, "forbidden"},
		"not found": {domain.ErrWorkspaceMembershipNotFound, http.StatusNotFound, "not-found"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkspaceMemberships(&fakeWorkspaceMembershipService{err: tc.err}, fakeAuth(false), http.MethodDelete, "/api/v1/workspaces/w1/memberships/u1", "")
			if p := problemOf(t, rec); rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Errorf("status %d, type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
		})
	}
}

func TestWorkspaceMembershipRoutesRequireSession(t *testing.T) {
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/api/v1/workspaces/w1/memberships", ""},
		{http.MethodPost, "/api/v1/workspaces/w1/memberships", `{"username":"ana"}`},
		{http.MethodPatch, "/api/v1/workspaces/w1/memberships/u1", `{"role":"viewer"}`},
		{http.MethodDelete, "/api/v1/workspaces/w1/memberships/u1", ""},
	} {
		if rec := serveWorkspaceMemberships(&fakeWorkspaceMembershipService{}, fakeAuth(true), tc.method, tc.path, tc.body); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s = %d, want 401", tc.method, tc.path, rec.Code)
		}
	}
}
