package identityhttp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/identity/application"
	"github.com/elyosemite/openboard/backend/internal/identity/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
)

const validToken = "valid-token"

var errBoom = errors.New("boom")

var gabriel = domain.User{ID: "u1", Username: "gabriel", Name: "Gabriel Souza"}

// fakeService accepts validToken for user and records what it was asked.
type fakeService struct {
	user          domain.User
	users         []domain.User
	totalUsers    int
	signInErr     error
	signOutErr    error
	authErr       error
	changeErr     error
	listErr       error
	deactivateErr error
	reactivateErr error
	tempPwErr     error
	tempPw        string
	signedOut     string
	changedWith   [2]string
	lastUserID    string
	lastPage      application.PageRequest
}

func (f *fakeService) SignIn(_ context.Context, username, _ string) (application.SignInResult, error) {
	if f.signInErr != nil {
		return application.SignInResult{}, f.signInErr
	}
	u := f.user
	u.Username = domain.Username(username)
	return application.SignInResult{Token: validToken, User: u}, nil
}

func (f *fakeService) SignOut(_ context.Context, token string) error {
	f.signedOut = token
	return f.signOutErr
}

func (f *fakeService) Authenticate(_ context.Context, token string) (application.Principal, error) {
	if f.authErr != nil {
		return application.Principal{}, f.authErr
	}
	if token != validToken {
		return application.Principal{}, domain.ErrUnauthenticated
	}
	return application.Principal{User: f.user, SessionID: []byte("s1")}, nil
}

func (f *fakeService) ChangePassword(_ context.Context, p application.Principal, current, next string) error {
	if p.User.ID != f.user.ID {
		return fmt.Errorf("unexpected principal %+v", p)
	}
	f.changedWith = [2]string{current, next}
	return f.changeErr
}

func (f *fakeService) ListUsers(_ context.Context, _ application.Principal, page application.PageRequest) ([]domain.User, int, error) {
	f.lastPage = page
	if f.listErr != nil {
		return nil, 0, f.listErr
	}
	return f.users, f.totalUsers, nil
}

func (f *fakeService) DeactivateUser(_ context.Context, _ application.Principal, rawUserID string) (domain.User, error) {
	f.lastUserID = rawUserID
	if f.deactivateErr != nil {
		return domain.User{}, f.deactivateErr
	}
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	u := f.user
	u.DeactivatedAt = &now
	return u, nil
}

func (f *fakeService) ReactivateUser(_ context.Context, _ application.Principal, rawUserID string) (domain.User, error) {
	f.lastUserID = rawUserID
	if f.reactivateErr != nil {
		return domain.User{}, f.reactivateErr
	}
	u := f.user
	u.DeactivatedAt = nil
	return u, nil
}

func (f *fakeService) IssueTemporaryPassword(_ context.Context, _ application.Principal, rawUserID string) (application.IssuedTemporaryPassword, error) {
	f.lastUserID = rawUserID
	if f.tempPwErr != nil {
		return application.IssuedTemporaryPassword{}, f.tempPwErr
	}
	u := f.user
	u.MustChangePassword = true
	return application.IssuedTemporaryPassword{User: u, TemporaryPassword: f.tempPw}, nil
}

func newMux(svc Service) *http.ServeMux {
	mux := http.NewServeMux()
	NewHandler(svc, slog.New(slog.NewTextHandler(io.Discard, nil)), 5*time.Minute).Register(mux)
	return mux
}

type request struct {
	method, path, body, token string
	contentType               string
}

func do(h http.Handler, req request) *httptest.ResponseRecorder {
	r := httptest.NewRequest(req.method, req.path, strings.NewReader(req.body))
	if req.body != "" {
		ct := req.contentType
		if ct == "" {
			ct = "application/json"
		}
		r.Header.Set("Content-Type", ct)
	}
	if req.token != "" {
		r.AddCookie(&http.Cookie{Name: CookieName, Value: req.token})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
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

func sessionCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == CookieName {
			return c
		}
	}
	return nil
}

func assertSessionCookie(t *testing.T, c *http.Cookie) {
	t.Helper()
	if c == nil || c.Value != validToken {
		t.Fatalf("session cookie missing: %+v", c)
	}
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode {
		t.Errorf("cookie must be HttpOnly, Secure and SameSite=Lax: %+v", c)
	}
	if c.Path != "/" || c.MaxAge != int(domain.SessionLifetime.Seconds()) {
		t.Errorf("Path %q, MaxAge %d", c.Path, c.MaxAge)
	}
}

func TestSignInSetsSessionCookie(t *testing.T) {
	rec := do(newMux(&fakeService{user: gabriel}), request{
		method: http.MethodPost, path: "/api/v1/sessions", body: `{"username":"gabriel","password":"secret"}`,
	})
	if rec.Code != http.StatusCreated || rec.Header().Get("Location") != "/api/v1/sessions/current" {
		t.Fatalf("status %d, Location %q", rec.Code, rec.Header().Get("Location"))
	}
	assertSessionCookie(t, sessionCookie(t, rec))
	var body map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["id"] != "u1" || body["username"] != "gabriel" || body["must_change_password"] != false {
		t.Errorf("unexpected body %v", body)
	}
	if _, leaked := body["password_hash"]; leaked {
		t.Error("password hash must never be returned")
	}
}

func TestSignInFailures(t *testing.T) {
	cases := map[string]struct {
		err         error
		body, ctype string
		status      int
		slug        string
	}{
		"invalid credentials": {domain.ErrInvalidCredentials, `{}`, "", http.StatusUnauthorized, "invalid-credentials"},
		"throttled":           {domain.ErrTooManyAttempts, `{}`, "", http.StatusTooManyRequests, "too-many-attempts"},
		"internal":            {errBoom, `{}`, "", http.StatusInternalServerError, "internal-error"},
		"form post":           {nil, `username=a`, "application/x-www-form-urlencoded", http.StatusUnsupportedMediaType, "unsupported-media-type"},
		"malformed":           {nil, `{`, "", http.StatusBadRequest, "malformed-request"},
	}
	for name, tc := range cases {
		rec := do(newMux(&fakeService{user: gabriel, signInErr: tc.err}), request{
			method: http.MethodPost, path: "/api/v1/sessions", body: tc.body, contentType: tc.ctype,
		})
		p := problemOf(t, rec)
		if rec.Code != tc.status || p.Type != "https://openboard.dev/problems/"+tc.slug {
			t.Errorf("%s: %d %s", name, rec.Code, p.Type)
		}
		if sessionCookie(t, rec) != nil {
			t.Errorf("%s: no cookie may be set on failure", name)
		}
	}
}

func TestSignInThrottledAnnouncesRetryAfter(t *testing.T) {
	rec := do(newMux(&fakeService{signInErr: domain.ErrTooManyAttempts}), request{
		method: http.MethodPost, path: "/api/v1/sessions", body: `{}`,
	})
	if got := rec.Header().Get("Retry-After"); got != "300" {
		t.Errorf("Retry-After = %q, want 300", got)
	}
}

func TestSignOutEndsSessionAndClearsCookie(t *testing.T) {
	svc := &fakeService{user: gabriel}
	rec := do(newMux(svc), request{method: http.MethodDelete, path: "/api/v1/sessions/current", token: validToken})
	if rec.Code != http.StatusNoContent || svc.signedOut != validToken {
		t.Fatalf("status %d, signed out %q", rec.Code, svc.signedOut)
	}
	if c := sessionCookie(t, rec); c == nil || c.MaxAge >= 0 || c.Value != "" {
		t.Errorf("cookie not cleared: %+v", c)
	}
}

func TestSignOutFailure(t *testing.T) {
	rec := do(newMux(&fakeService{signOutErr: errBoom}), request{method: http.MethodDelete, path: "/api/v1/sessions/current"})
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status %d", rec.Code)
	}
}

func TestCurrentUser(t *testing.T) {
	pending := gabriel
	pending.MustChangePassword = true
	rec := do(newMux(&fakeService{user: pending}), request{method: http.MethodGet, path: "/api/v1/users/me", token: validToken})
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["name"] != "Gabriel Souza" || body["must_change_password"] != true || body["is_administrator"] != false {
		t.Errorf("unexpected body %v", body)
	}
}

func TestSessionRequired(t *testing.T) {
	cases := map[string]struct {
		token       string
		authErr     error
		status      int
		clearCookie bool
	}{
		"no cookie":     {"", nil, http.StatusUnauthorized, false},
		"stale cookie":  {"expired", nil, http.StatusUnauthorized, true},
		"store failure": {validToken, errBoom, http.StatusInternalServerError, false},
		"valid":         {validToken, nil, http.StatusOK, false},
	}
	for name, tc := range cases {
		rec := do(newMux(&fakeService{user: gabriel, authErr: tc.authErr}), request{
			method: http.MethodGet, path: "/api/v1/users/me", token: tc.token,
		})
		if rec.Code != tc.status {
			t.Errorf("%s: status %d, want %d", name, rec.Code, tc.status)
		}
		if cleared := sessionCookie(t, rec) != nil; cleared != tc.clearCookie {
			t.Errorf("%s: cookie cleared = %v, want %v", name, cleared, tc.clearCookie)
		}
	}
}

func TestChangePassword(t *testing.T) {
	svc := &fakeService{user: gabriel}
	rec := do(newMux(svc), request{
		method: http.MethodPut, path: "/api/v1/users/me/password", token: validToken,
		body: `{"current_password":"old one","new_password":"a much longer one"}`,
	})
	if rec.Code != http.StatusNoContent || svc.changedWith != [2]string{"old one", "a much longer one"} {
		t.Fatalf("status %d, changed with %v", rec.Code, svc.changedWith)
	}
}

func TestChangePasswordRejections(t *testing.T) {
	weak := fmt.Errorf("%w: use at least 12 characters", domain.ErrWeakPassword)
	cases := map[string]struct {
		err            error
		field, message string
	}{
		"wrong current": {domain.ErrWrongCurrentPassword, "current_password", "current password is incorrect"},
		"weak":          {weak, "new_password", "use at least 12 characters"},
	}
	for name, tc := range cases {
		rec := do(newMux(&fakeService{user: gabriel, changeErr: tc.err}), request{
			method: http.MethodPut, path: "/api/v1/users/me/password", token: validToken, body: `{}`,
		})
		p := problemOf(t, rec)
		if rec.Code != http.StatusUnprocessableEntity || len(p.Errors) != 1 {
			t.Fatalf("%s: %d %+v", name, rec.Code, p)
		}
		if p.Errors[0].Field != tc.field || p.Errors[0].Message != tc.message {
			t.Errorf("%s: unexpected field error %+v", name, p.Errors[0])
		}
	}
}

func TestChangePasswordNeedsJSON(t *testing.T) {
	rec := do(newMux(&fakeService{user: gabriel}), request{
		method: http.MethodPut, path: "/api/v1/users/me/password", token: validToken, body: `x`, contentType: "text/plain",
	})
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Errorf("status %d", rec.Code)
	}
}

func TestAuthenticatedBlocksPendingTemporaryPassword(t *testing.T) {
	pending := gabriel
	pending.MustChangePassword = true
	cases := map[string]struct {
		user   domain.User
		status int
	}{
		"pending":  {pending, http.StatusForbidden},
		"changed":  {gabriel, http.StatusNoContent},
		"no token": {gabriel, http.StatusUnauthorized},
	}
	for name, tc := range cases {
		h := NewHandler(&fakeService{user: tc.user}, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Minute)
		protected := httpx.Handle(slog.New(slog.NewTextHandler(io.Discard, nil)), h.Authenticated(
			func(w http.ResponseWriter, r *http.Request) error {
				if p, ok := PrincipalFrom(r.Context()); !ok || p.User.ID != tc.user.ID {
					return errBoom
				}
				w.WriteHeader(http.StatusNoContent)
				return nil
			}))
		token := validToken
		if name == "no token" {
			token = ""
		}
		rec := do(protected, request{method: http.MethodGet, path: "/api/v1/projects", token: token})
		if rec.Code != tc.status {
			t.Errorf("%s: status %d, want %d", name, rec.Code, tc.status)
		}
		if tc.status == http.StatusForbidden && problemOf(t, rec).Type != "https://openboard.dev/problems/password-change-required" {
			t.Errorf("%s: wrong problem type", name)
		}
	}
}

func TestPrincipalFromEmptyContext(t *testing.T) {
	if _, ok := PrincipalFrom(context.Background()); ok {
		t.Error("no Principal expected")
	}
}

func TestListUsersEndpoint(t *testing.T) {
	svc := &fakeService{user: gabriel, users: []domain.User{gabriel}, totalUsers: 1}
	rec := do(newMux(svc), request{method: http.MethodGet, path: "/api/v1/users?page=2&page_size=5", token: validToken})
	if rec.Code != http.StatusOK || svc.lastPage != (application.PageRequest{Limit: 5, Offset: 5}) {
		t.Fatalf("status %d, page %+v", rec.Code, svc.lastPage)
	}

	badPage := do(newMux(svc), request{method: http.MethodGet, path: "/api/v1/users?page=0", token: validToken})
	if badPage.Code != http.StatusUnprocessableEntity {
		t.Errorf("bad page status %d, want 422", badPage.Code)
	}

	forbidden := do(newMux(&fakeService{user: gabriel, listErr: domain.ErrForbidden}), request{
		method: http.MethodGet, path: "/api/v1/users", token: validToken,
	})
	if forbidden.Code != http.StatusForbidden {
		t.Errorf("forbidden status %d, want 403", forbidden.Code)
	}
}

func TestUserAdministrationActions(t *testing.T) {
	svc := &fakeService{user: gabriel, tempPw: "temp-pass-123456"}
	mux := newMux(svc)

	rec := do(mux, request{method: http.MethodPost, path: "/api/v1/users/u2/deactivate", token: validToken})
	if rec.Code != http.StatusOK || svc.lastUserID != "u2" {
		t.Fatalf("deactivate = %d, id=%q", rec.Code, svc.lastUserID)
	}

	rec = do(mux, request{method: http.MethodPost, path: "/api/v1/users/u2/reactivate", token: validToken})
	if rec.Code != http.StatusOK {
		t.Fatalf("reactivate = %d", rec.Code)
	}

	rec = do(mux, request{method: http.MethodPost, path: "/api/v1/users/u2/temporary-password", token: validToken})
	if rec.Code != http.StatusOK {
		t.Fatalf("temporary-password = %d", rec.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["temporary_password"] != "temp-pass-123456" || body["must_change_password"] != true {
		t.Errorf("unexpected body %v", body)
	}
}

func TestUserAdministrationErrors(t *testing.T) {
	cases := map[string]struct {
		path   string
		svc    *fakeService
		status int
		slug   string
	}{
		"deactivate self":   {"/api/v1/users/u1/deactivate", &fakeService{user: gabriel, deactivateErr: domain.ErrCannotDeactivateSelf}, http.StatusConflict, "cannot-deactivate-self"},
		"last org owner":    {"/api/v1/users/u2/deactivate", &fakeService{user: gabriel, deactivateErr: domain.ErrLastOrganizationOwner}, http.StatusConflict, "last-organization-owner"},
		"reactivate 404":    {"/api/v1/users/u2/reactivate", &fakeService{user: gabriel, reactivateErr: domain.ErrUserNotFound}, http.StatusNotFound, "not-found"},
		"temp pw inactive":  {"/api/v1/users/u2/temporary-password", &fakeService{user: gabriel, tempPwErr: domain.ErrUserDeactivated}, http.StatusConflict, "user-deactivated"},
		"temp pw forbidden": {"/api/v1/users/u2/temporary-password", &fakeService{user: gabriel, tempPwErr: domain.ErrForbidden}, http.StatusForbidden, "forbidden"},
	}
	for name, tc := range cases {
		rec := do(newMux(tc.svc), request{method: http.MethodPost, path: tc.path, token: validToken})
		p := problemOf(t, rec)
		if rec.Code != tc.status || p.Type != "https://openboard.dev/problems/"+tc.slug {
			t.Errorf("%s: %d %s", name, rec.Code, p.Type)
		}
	}
}
