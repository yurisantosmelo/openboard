package organizationshttp

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

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
)

var created = time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)

var administrator = domain.Actor{UserID: "00000000-0000-0000-0000-00000000000a", IsAdministrator: true}

type fakeService struct {
	err   error
	actor domain.Actor
	in    application.CreateOrganizationInput
	id    string
	page  application.PageRequest
	orgs  []domain.Organization
	total int
}

func (f *fakeService) GetOrganization(_ context.Context, actor domain.Actor, rawID string) (domain.Organization, error) {
	f.actor, f.id = actor, rawID
	if f.err != nil {
		return domain.Organization{}, f.err
	}
	return domain.Organization{ID: domain.OrganizationID(rawID), Name: "Acme", CreatedAt: created, ViewerRole: domain.RoleOwner}, nil
}

func (f *fakeService) ListOrganizations(_ context.Context, actor domain.Actor, page application.PageRequest) ([]domain.Organization, int, error) {
	f.actor, f.page = actor, page
	return f.orgs, f.total, f.err
}

func (f *fakeService) CreateOrganization(_ context.Context, actor domain.Actor, in application.CreateOrganizationInput) (domain.Organization, error) {
	f.actor, f.in = actor, in
	if f.err != nil {
		return domain.Organization{}, f.err
	}
	return domain.Organization{ID: "o1", Name: in.Name, CreatedAt: created, ViewerRole: domain.RoleOwner}, nil
}

// fakeAuth lets requests through as administrator unless signedOut is set.
func fakeAuth(signedOut bool) Auth {
	return Auth{
		Authenticated: func(next httpx.HandlerFunc) httpx.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request) error {
				if signedOut {
					return &httpx.Error{Status: http.StatusUnauthorized, Slug: "unauthenticated", Title: "Not signed in"}
				}
				return next(w, r)
			}
		},
		Actor: func(context.Context) domain.Actor { return administrator },
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

func post(svc Service, auth Auth, body string) *httptest.ResponseRecorder {
	return serve(svc, auth, http.MethodPost, "/api/v1/organizations", body)
}

func problemOf(t *testing.T, rec *httptest.ResponseRecorder) httpx.Problem {
	t.Helper()
	var p httpx.Problem
	if err := json.NewDecoder(rec.Body).Decode(&p); err != nil {
		t.Fatalf("decode problem: %v", err)
	}
	return p
}

func TestCreateOrganization(t *testing.T) {
	svc := &fakeService{}
	rec := post(svc, fakeAuth(false), `{"name":"Acme","owner_user_id":"u2"}`)

	if rec.Code != http.StatusCreated || rec.Header().Get("Location") != "/api/v1/organizations/o1" {
		t.Fatalf("status %d, Location %q", rec.Code, rec.Header().Get("Location"))
	}
	if svc.actor != administrator || svc.in != (application.CreateOrganizationInput{Name: "Acme", OwnerUserID: "u2"}) {
		t.Errorf("service called with %+v, %+v", svc.actor, svc.in)
	}
	want := `{"id":"o1","name":"Acme","created_at":"2026-11-17T12:00:00Z","current_user_role":"owner"}`
	if got := strings.TrimSpace(rec.Body.String()); got != want {
		t.Errorf("body %s, want %s", got, want)
	}
}

func TestCreateOrganizationRequiresSession(t *testing.T) {
	rec := post(&fakeService{}, fakeAuth(true), `{"name":"Acme"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status %d, want 401", rec.Code)
	}
}

func TestCreateOrganizationRejectsMalformedBody(t *testing.T) {
	if rec := post(&fakeService{}, fakeAuth(false), `{"name":`); rec.Code != http.StatusBadRequest {
		t.Errorf("status %d, want 400", rec.Code)
	}
}

func TestCreateOrganizationErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		status int
		slug   string
		fields []string
	}{
		"forbidden":     {domain.ErrForbidden, http.StatusForbidden, "forbidden", nil},
		"invalid name":  {domain.ErrInvalidName, http.StatusUnprocessableEntity, "validation-error", []string{"name:invalid"}},
		"unknown owner":     {domain.ErrOwnerNotFound, http.StatusUnprocessableEntity, "validation-error", []string{"owner_user_id:not_found"}},
		"deactivated owner": {domain.ErrUserDeactivated, http.StatusConflict, "user-deactivated", nil},
		"both invalid": {errors.Join(domain.ErrInvalidName, domain.ErrInvalidUserID), http.StatusUnprocessableEntity,
			"validation-error", []string{"name:invalid", "owner_user_id:invalid"}},
		"internal": {errors.New("store down"), http.StatusInternalServerError, "internal-error", nil},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := post(&fakeService{err: tc.err}, fakeAuth(false), `{"name":"Acme"}`)
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

func TestListOrganizations(t *testing.T) {
	svc := &fakeService{orgs: []domain.Organization{{ID: "o1", Name: "Acme", CreatedAt: created, ViewerRole: domain.RoleContributor}}, total: 21}
	rec := serve(svc, fakeAuth(false), http.MethodGet, "/api/v1/organizations?page=2&page_size=10", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if svc.actor != administrator || svc.page != (application.PageRequest{Limit: 10, Offset: 10}) {
		t.Errorf("service called with %+v, %+v", svc.actor, svc.page)
	}
	want := `{"items":[{"id":"o1","name":"Acme","created_at":"2026-11-17T12:00:00Z","current_user_role":"contributor"}],"page":2,"page_size":10,"total_items":21,"total_pages":3}`
	if got := strings.TrimSpace(rec.Body.String()); got != want {
		t.Errorf("body %s, want %s", got, want)
	}
}

func TestListOrganizationsFailures(t *testing.T) {
	cases := map[string]struct {
		svc    *fakeService
		query  string
		status int
	}{
		"bad page":      {&fakeService{}, "?page=0", http.StatusUnprocessableEntity},
		"service error": {&fakeService{err: errors.New("store down")}, "", http.StatusInternalServerError},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if rec := serve(tc.svc, fakeAuth(false), http.MethodGet, "/api/v1/organizations"+tc.query, ""); rec.Code != tc.status {
				t.Errorf("status %d, want %d", rec.Code, tc.status)
			}
		})
	}
}

func TestGetOrganization(t *testing.T) {
	svc := &fakeService{}
	rec := serve(svc, fakeAuth(false), http.MethodGet, "/api/v1/organizations/o1", "")
	if rec.Code != http.StatusOK || svc.id != "o1" || svc.actor != administrator {
		t.Fatalf("status %d, id %q, actor %+v", rec.Code, svc.id, svc.actor)
	}
	if want := `{"id":"o1","name":"Acme","created_at":"2026-11-17T12:00:00Z","current_user_role":"owner"}`; strings.TrimSpace(rec.Body.String()) != want {
		t.Errorf("body %s", rec.Body.String())
	}

	rec = serve(&fakeService{err: domain.ErrNotFound}, fakeAuth(false), http.MethodGet, "/api/v1/organizations/o2", "")
	if p := problemOf(t, rec); rec.Code != http.StatusNotFound || !strings.HasSuffix(p.Type, "/not-found") {
		t.Errorf("status %d, type %q; want 404 not-found", rec.Code, p.Type)
	}
}

func TestOrganizationRoutesRequireSession(t *testing.T) {
	for _, path := range []string{"/api/v1/organizations", "/api/v1/organizations/o1"} {
		if rec := serve(&fakeService{}, fakeAuth(true), http.MethodGet, path, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("GET %s = %d, want 401", path, rec.Code)
		}
	}
}
