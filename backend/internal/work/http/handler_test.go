package workhttp

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

var (
	t0     = time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	actor  = domain.Actor{UserID: "u1", IsAdministrator: true}
	sample = domain.Project{
		ID: "p1", OrganizationID: "o1", WorkspaceID: "w1", Name: "Core",
		CreatedAt: t0, UpdatedAt: t0, ViewerRole: domain.RoleOwner,
	}
)

type fakeService struct {
	err      error
	project  domain.Project
	projects []domain.Project
	total    int
	statuses []domain.Status
	types    []domain.WorkItemType
	lastWS   string
	lastPage application.PageRequest
	createIn application.CreateProjectInput
	updateIn application.UpdateProjectInput
	lastID   string
}

func (f *fakeService) CreateProject(_ context.Context, _ domain.Actor, in application.CreateProjectInput) (domain.Project, error) {
	f.createIn = in
	return f.project, f.err
}

func (f *fakeService) ListProjects(_ context.Context, _ domain.Actor, wsID string, page application.PageRequest) ([]domain.Project, int, error) {
	f.lastWS, f.lastPage = wsID, page
	return f.projects, f.total, f.err
}

func (f *fakeService) GetProject(_ context.Context, _ domain.Actor, id string) (domain.Project, error) {
	f.lastID = id
	return f.project, f.err
}

func (f *fakeService) UpdateProject(_ context.Context, _ domain.Actor, in application.UpdateProjectInput) (domain.Project, error) {
	f.updateIn = in
	return f.project, f.err
}

func (f *fakeService) MoveProject(_ context.Context, _ domain.Actor, id, wsID string) (domain.Project, error) {
	f.lastID, f.lastWS = id, wsID
	return f.project, f.err
}

func (f *fakeService) ListStatuses(_ context.Context, _ domain.Actor, id string) ([]domain.Status, error) {
	f.lastID = id
	return f.statuses, f.err
}

func (f *fakeService) ListWorkItemTypes(_ context.Context, _ domain.Actor, id string) ([]domain.WorkItemType, error) {
	f.lastID = id
	return f.types, f.err
}

func fakeAuth(reject bool) Auth {
	return Auth{
		Authenticated: func(next httpx.HandlerFunc) httpx.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request) error {
				if reject {
					return &httpx.Error{Status: http.StatusUnauthorized, Slug: "unauthenticated", Title: "Not signed in"}
				}
				return next(w, r)
			}
		},
		Actor: func(context.Context) domain.Actor { return actor },
	}
}

func serve(svc Service, auth Auth, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	NewHandler(svc, auth, slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

func problemOf(t *testing.T, rec *httptest.ResponseRecorder) httpx.Problem {
	t.Helper()
	var p httpx.Problem
	if err := json.NewDecoder(rec.Body).Decode(&p); err != nil {
		t.Fatalf("decode problem: %v", err)
	}
	return p
}

func TestProjectListAndCreateHandlers(t *testing.T) {
	svc := &fakeService{project: sample, projects: []domain.Project{sample}, total: 11}

	rec := serve(svc, fakeAuth(false), http.MethodGet, "/api/v1/projects?workspace_id=w1&page=2&page_size=10", "")
	if rec.Code != http.StatusOK || svc.lastWS != "w1" || svc.lastPage != (application.PageRequest{Limit: 10, Offset: 10}) {
		t.Fatalf("list = %d ws=%q page=%+v", rec.Code, svc.lastWS, svc.lastPage)
	}

	rec = serve(svc, fakeAuth(false), http.MethodPost, "/api/v1/projects", `{"workspace_id":"w1","name":"Core"}`)
	if rec.Code != http.StatusCreated || rec.Header().Get("Location") != "/api/v1/projects/p1" {
		t.Fatalf("create = %d loc=%q", rec.Code, rec.Header().Get("Location"))
	}
}

func TestProjectGetAndUpdateHandlers(t *testing.T) {
	svc := &fakeService{project: sample}

	rec := serve(svc, fakeAuth(false), http.MethodGet, "/api/v1/projects/p1", "")
	if rec.Code != http.StatusOK || svc.lastID != "p1" {
		t.Fatalf("get = %d id=%q", rec.Code, svc.lastID)
	}

	rec = serve(svc, fakeAuth(false), http.MethodPatch, "/api/v1/projects/p1", `{"name":"Renamed"}`)
	if rec.Code != http.StatusOK || svc.updateIn.ID != "p1" || svc.updateIn.Name == nil || *svc.updateIn.Name != "Renamed" {
		t.Fatalf("update = %d in=%+v", rec.Code, svc.updateIn)
	}
}

func TestProjectHandlerErrors(t *testing.T) {
	cases := map[string]struct {
		method, path, body string
		err                error
		status             int
		slug               string
	}{
		"bad page":  {http.MethodGet, "/api/v1/projects?page=0", "", nil, http.StatusUnprocessableEntity, "validation-error"},
		"bad ws":    {http.MethodGet, "/api/v1/projects?workspace_id=x", "", domain.ErrInvalidWorkspaceRef, http.StatusUnprocessableEntity, "validation-error"},
		"bad json":  {http.MethodPost, "/api/v1/projects", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"bad patch": {http.MethodPatch, "/api/v1/projects/p1", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"forbidden": {http.MethodPost, "/api/v1/projects", `{"workspace_id":"w1","name":"Core"}`, domain.ErrForbidden, http.StatusForbidden, "forbidden"},
		"duplicate": {http.MethodPost, "/api/v1/projects", `{"workspace_id":"w1","name":"Core"}`, domain.ErrProjectNameInUse, http.StatusConflict, "project-name-taken"},
		"not found": {http.MethodGet, "/api/v1/projects/p1", "", domain.ErrNotFound, http.StatusNotFound, "not-found"},
		"patch 404": {http.MethodPatch, "/api/v1/projects/p1", `{"name":"X"}`, domain.ErrNotFound, http.StatusNotFound, "not-found"},
		"internal":  {http.MethodGet, "/api/v1/projects/p1", "", errors.New("boom"), http.StatusInternalServerError, "internal-error"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serve(&fakeService{err: tc.err}, fakeAuth(false), tc.method, tc.path, tc.body)
			p := problemOf(t, rec)
			if rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Errorf("status %d type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
		})
	}
	if rec := serve(&fakeService{}, fakeAuth(true), http.MethodGet, "/api/v1/projects", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("unauthenticated = %d, want 401", rec.Code)
	}
}
