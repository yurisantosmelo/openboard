package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	identityhttp "github.com/elyosemite/openboard/backend/internal/identity/http"
	"github.com/elyosemite/openboard/backend/internal/platform/config"
	"github.com/elyosemite/openboard/backend/internal/platform/database"
)

// apiClient drives the real router, carrying the session cookie like a browser.
type apiClient struct {
	t      *testing.T
	router http.Handler
	cookie *http.Cookie
}

func newAPIClient(t *testing.T) *apiClient {
	t.Helper()
	truncateUsers(t)
	ctx := context.Background()
	pool, err := database.Open(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	identity, identitySvc, err := setupIdentity(ctx, logger, pool, config.Config{})
	if err != nil {
		t.Fatal(err)
	}
	organizations := setupOrganizations(logger, pool, identity)
	memberships := setupOrganizationMemberships(logger, pool, identity, identitySvc)
	workspaces := setupWorkspaces(logger, pool, identity)
	workspaceMemberships := setupWorkspaceMemberships(logger, pool, identity)
	work := setupWork(logger, pool, identity)
	return &apiClient{t: t, router: newRouter(logger, []module{identity, organizations, memberships, workspaces, workspaceMemberships, work})}
}

func (c *apiClient) send(method, path, body string) *httptest.ResponseRecorder {
	c.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.cookie != nil {
		req.AddCookie(c.cookie)
	}
	rec := httptest.NewRecorder()
	c.router.ServeHTTP(rec, req)
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == identityhttp.CookieName {
			c.cookie = cookie
		}
	}
	if c.cookie != nil && c.cookie.MaxAge < 0 {
		c.cookie = nil
	}
	return rec
}

func (c *apiClient) expect(method, path, body string, status int) *httptest.ResponseRecorder {
	c.t.Helper()
	rec := c.send(method, path, body)
	if rec.Code != status {
		c.t.Fatalf("%s %s = %d, want %d: %s", method, path, rec.Code, status, rec.Body.String())
	}
	return rec
}

func (c *apiClient) mustChangePassword() bool {
	c.t.Helper()
	var me struct {
		Username           string `json:"username"`
		IsAdministrator    bool   `json:"is_administrator"`
		MustChangePassword bool   `json:"must_change_password"`
	}
	rec := c.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusOK)
	if err := json.NewDecoder(rec.Body).Decode(&me); err != nil {
		c.t.Fatal(err)
	}
	if me.Username != "admin" || !me.IsAdministrator {
		c.t.Fatalf("unexpected current user %+v", me)
	}
	return me.MustChangePassword
}

func TestAdministratorSignsInChangesPasswordAndSignsOut(t *testing.T) {
	c := newAPIClient(t)

	c.expect(http.MethodPost, "/api/v1/sessions", `{"username":"admin","password":"wrong"}`, http.StatusUnauthorized)
	c.expect(http.MethodPost, "/api/v1/sessions", `{"username":"admin","password":"admin"}`, http.StatusCreated)
	if !c.mustChangePassword() {
		t.Fatal("the bootstrap Administrator must start with a Temporary Password")
	}

	c.expect(http.MethodPut, "/api/v1/users/me/password",
		`{"current_password":"admin","new_password":"short"}`, http.StatusUnprocessableEntity)
	c.expect(http.MethodPut, "/api/v1/users/me/password",
		`{"current_password":"admin","new_password":"a long and fine passphrase"}`, http.StatusNoContent)
	if c.mustChangePassword() {
		t.Fatal("the Temporary Password should be cleared")
	}

	c.expect(http.MethodDelete, "/api/v1/sessions/current", "", http.StatusNoContent)
	c.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusUnauthorized)

	c.expect(http.MethodPost, "/api/v1/sessions", `{"username":"admin","password":"admin"}`, http.StatusUnauthorized)
	c.expect(http.MethodPost, "/api/v1/sessions",
		`{"username":"ADMIN","password":"a long and fine passphrase"}`, http.StatusCreated)
}

func TestChangingPasswordEndsOtherSessions(t *testing.T) {
	first := newAPIClient(t)
	second := &apiClient{t: t, router: first.router}

	first.expect(http.MethodPost, "/api/v1/sessions", `{"username":"admin","password":"admin"}`, http.StatusCreated)
	second.expect(http.MethodPost, "/api/v1/sessions", `{"username":"admin","password":"admin"}`, http.StatusCreated)

	first.expect(http.MethodPut, "/api/v1/users/me/password",
		`{"current_password":"admin","new_password":"a long and fine passphrase"}`, http.StatusNoContent)

	first.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusOK)
	second.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusUnauthorized)
}

func TestRepeatedFailuresBlockSignIn(t *testing.T) {
	c := newAPIClient(t)
	for range signInMaxFailures {
		c.expect(http.MethodPost, "/api/v1/sessions", `{"username":"admin","password":"wrong"}`, http.StatusUnauthorized)
	}
	rec := c.expect(http.MethodPost, "/api/v1/sessions", `{"username":"admin","password":"admin"}`, http.StatusTooManyRequests)
	if rec.Header().Get("Retry-After") != "300" {
		t.Errorf("Retry-After = %q", rec.Header().Get("Retry-After"))
	}
}

func TestCrossSiteSignInIsRejected(t *testing.T) {
	c := newAPIClient(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/sessions", strings.NewReader(`{"username":"admin","password":"admin"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec := httptest.NewRecorder()
	c.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status %d, want 403", rec.Code)
	}
}
