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

const membershipJSON = `{"organization_id":"o1","user_id":"u1","username":"ana","name":"Ana Silva","role":"contributor","created_at":"2026-11-17T12:00:00Z"}`

var anaMembership = domain.OrganizationMembership{
	OrganizationID: "o1", UserID: "u1", Username: "ana", Name: "Ana Silva", Role: domain.RoleContributor, CreatedAt: created,
}

type fakeMembershipService struct {
	err    error
	actor  domain.Actor
	orgID  string
	page   application.PageRequest
	in     application.AddOrganizationMembershipInput
	update application.UpdateOrganizationMembershipInput
	remove application.RemoveOrganizationMembershipInput
	items  []domain.OrganizationMembership
	total  int
	added  application.AddedOrganizationMembership
}

func (f *fakeMembershipService) ListMemberships(_ context.Context, actor domain.Actor, rawOrganizationID string, page application.PageRequest) ([]domain.OrganizationMembership, int, error) {
	f.actor, f.orgID, f.page = actor, rawOrganizationID, page
	return f.items, f.total, f.err
}

func (f *fakeMembershipService) AddMembership(_ context.Context, actor domain.Actor, in application.AddOrganizationMembershipInput) (application.AddedOrganizationMembership, error) {
	f.actor, f.in = actor, in
	return f.added, f.err
}

func (f *fakeMembershipService) UpdateMembership(_ context.Context, actor domain.Actor, in application.UpdateOrganizationMembershipInput) (domain.OrganizationMembership, error) {
	f.actor, f.update = actor, in
	return anaMembership, f.err
}

func (f *fakeMembershipService) RemoveMembership(_ context.Context, actor domain.Actor, in application.RemoveOrganizationMembershipInput) error {
	f.actor, f.remove = actor, in
	return f.err
}

func serveMemberships(svc MembershipService, auth Auth, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	NewMembershipHandler(svc, auth, slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

func TestListOrganizationMemberships(t *testing.T) {
	svc := &fakeMembershipService{items: []domain.OrganizationMembership{anaMembership}, total: 11}
	rec := serveMemberships(svc, fakeAuth(false), http.MethodGet, "/api/v1/organizations/o1/memberships?page=2&page_size=10", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if svc.actor != administrator || svc.orgID != "o1" || svc.page != (application.PageRequest{Limit: 10, Offset: 10}) {
		t.Errorf("service called with %+v, %q, %+v", svc.actor, svc.orgID, svc.page)
	}
	want := `{"items":[` + membershipJSON + `],"page":2,"page_size":10,"total_items":11,"total_pages":2}`
	if got := strings.TrimSpace(rec.Body.String()); got != want {
		t.Errorf("body %s, want %s", got, want)
	}
}

func TestListOrganizationMembershipsErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		query  string
		status int
	}{
		"bad page":   {nil, "?page=0", http.StatusUnprocessableEntity},
		"not found":  {domain.ErrNotFound, "", http.StatusNotFound},
		"forbidden":  {domain.ErrForbidden, "", http.StatusForbidden},
		"store down": {errors.New("store down"), "", http.StatusInternalServerError},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveMemberships(&fakeMembershipService{err: tc.err}, fakeAuth(false), http.MethodGet, "/api/v1/organizations/o1/memberships"+tc.query, "")
			if rec.Code != tc.status {
				t.Errorf("status %d, want %d", rec.Code, tc.status)
			}
		})
	}
}

func TestAddOrganizationMembership(t *testing.T) {
	svc := &fakeMembershipService{added: application.AddedOrganizationMembership{
		Membership: anaMembership, TemporaryPassword: "temp-password-123",
	}}
	rec := serveMemberships(svc, fakeAuth(false), http.MethodPost, "/api/v1/organizations/o1/memberships",
		`{"username":"ana","name":"Ana Silva","role":"contributor"}`)

	if rec.Code != http.StatusCreated || rec.Header().Get("Location") != "/api/v1/organizations/o1/memberships/u1" {
		t.Fatalf("status %d, Location %q", rec.Code, rec.Header().Get("Location"))
	}
	wantIn := application.AddOrganizationMembershipInput{OrganizationID: "o1", Username: "ana", Name: "Ana Silva", Role: "contributor"}
	if svc.actor != administrator || svc.in != wantIn {
		t.Errorf("service called with %+v, %+v", svc.actor, svc.in)
	}
	wantBody := `{"organization_id":"o1","user_id":"u1","username":"ana","name":"Ana Silva","role":"contributor","created_at":"2026-11-17T12:00:00Z","temporary_password":"temp-password-123"}`
	if got := strings.TrimSpace(rec.Body.String()); got != wantBody {
		t.Errorf("body %s, want %s", got, wantBody)
	}
}

func TestAddOrganizationMembershipOmitsEmptyTemporaryPassword(t *testing.T) {
	svc := &fakeMembershipService{added: application.AddedOrganizationMembership{Membership: anaMembership}}
	rec := serveMemberships(svc, fakeAuth(false), http.MethodPost, "/api/v1/organizations/o1/memberships",
		`{"username":"ana","name":"Ana Silva"}`)

	if rec.Code != http.StatusCreated || strings.TrimSpace(rec.Body.String()) != membershipJSON {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestAddOrganizationMembershipErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		body   string
		status int
		slug   string
		fields []string
	}{
		"malformed":  {nil, `{"username":`, http.StatusBadRequest, "malformed-request", nil},
		"not found":  {domain.ErrNotFound, `{"username":"ana","name":"Ana"}`, http.StatusNotFound, "not-found", nil},
		"forbidden":  {domain.ErrForbidden, `{"username":"ana","name":"Ana"}`, http.StatusForbidden, "forbidden", nil},
		"duplicate":  {domain.ErrMembershipExists, `{"username":"ana","name":"Ana"}`, http.StatusConflict, "organization-membership-exists", nil},
		"all fields": {errors.Join(domain.ErrInvalidUsername, domain.ErrInvalidName, domain.ErrInvalidRole), `{}`, http.StatusUnprocessableEntity, "validation-error", []string{"username:invalid", "name:invalid", "role:invalid"}},
		"internal":   {errors.New("store down"), `{"username":"ana","name":"Ana"}`, http.StatusInternalServerError, "internal-error", nil},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveMemberships(&fakeMembershipService{err: tc.err}, fakeAuth(false), http.MethodPost, "/api/v1/organizations/o1/memberships", tc.body)
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

func TestMembershipRoutesRequireSession(t *testing.T) {
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/api/v1/organizations/o1/memberships", ""},
		{http.MethodPost, "/api/v1/organizations/o1/memberships", `{"username":"ana","name":"Ana"}`},
		{http.MethodPatch, "/api/v1/organizations/o1/memberships/u1", `{"role":"owner"}`},
		{http.MethodDelete, "/api/v1/organizations/o1/memberships/u1", ""},
	} {
		if rec := serveMemberships(&fakeMembershipService{}, fakeAuth(true), tc.method, tc.path, tc.body); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s = %d, want 401", tc.method, tc.path, rec.Code)
		}
	}
}

func TestUpdateOrganizationMembership(t *testing.T) {
	svc := &fakeMembershipService{}
	rec := serveMemberships(svc, fakeAuth(false), http.MethodPatch, "/api/v1/organizations/o1/memberships/u1", `{"role":"owner"}`)

	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != membershipJSON {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
	}
	want := application.UpdateOrganizationMembershipInput{OrganizationID: "o1", UserID: "u1", Role: "owner"}
	if svc.actor != administrator || svc.update != want {
		t.Errorf("service called with %+v, %+v", svc.actor, svc.update)
	}
}

func TestUpdateOrganizationMembershipErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		body   string
		status int
		slug   string
	}{
		"malformed":  {nil, `{"role":`, http.StatusBadRequest, "malformed-request"},
		"forbidden":  {domain.ErrForbidden, `{"role":"owner"}`, http.StatusForbidden, "forbidden"},
		"not found":  {domain.ErrMembershipNotFound, `{"role":"owner"}`, http.StatusNotFound, "not-found"},
		"last owner": {domain.ErrLastOrganizationOwner, `{"role":"contributor"}`, http.StatusConflict, "last-organization-owner"},
		"invalid":    {domain.ErrInvalidRole, `{"role":"viewer"}`, http.StatusUnprocessableEntity, "validation-error"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveMemberships(&fakeMembershipService{err: tc.err}, fakeAuth(false), http.MethodPatch, "/api/v1/organizations/o1/memberships/u1", tc.body)
			if p := problemOf(t, rec); rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Errorf("status %d, type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
		})
	}
}

func TestRemoveOrganizationMembership(t *testing.T) {
	svc := &fakeMembershipService{}
	rec := serveMemberships(svc, fakeAuth(false), http.MethodDelete, "/api/v1/organizations/o1/memberships/u1", "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d, want 204", rec.Code)
	}
	want := application.RemoveOrganizationMembershipInput{OrganizationID: "o1", UserID: "u1"}
	if svc.actor != administrator || svc.remove != want {
		t.Errorf("service called with %+v, %+v", svc.actor, svc.remove)
	}
}

func TestRemoveOrganizationMembershipErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		status int
		slug   string
	}{
		"forbidden":  {domain.ErrForbidden, http.StatusForbidden, "forbidden"},
		"not found":  {domain.ErrMembershipNotFound, http.StatusNotFound, "not-found"},
		"last owner": {domain.ErrLastOrganizationOwner, http.StatusConflict, "last-organization-owner"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveMemberships(&fakeMembershipService{err: tc.err}, fakeAuth(false), http.MethodDelete, "/api/v1/organizations/o1/memberships/u1", "")
			if p := problemOf(t, rec); rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Errorf("status %d, type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
		})
	}
}
