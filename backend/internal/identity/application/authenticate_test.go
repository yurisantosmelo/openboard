package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

func signedIn(t *testing.T) (*harness, string) {
	t.Helper()
	h := newHarness(t, gabriel())
	res, err := h.svc.SignIn(context.Background(), "gabriel", "correct horse battery")
	if err != nil {
		t.Fatalf("SignIn: %v", err)
	}
	return h, res.Token
}

func TestAuthenticateResolvesPrincipal(t *testing.T) {
	h, token := signedIn(t)

	p, err := h.svc.Authenticate(context.Background(), token)
	if err != nil || p.User.ID != "u-gabriel" || string(p.SessionID) != string(hashToken(token)) {
		t.Fatalf("Authenticate = %+v, %v", p, err)
	}
	if h.sessions.touched != 0 {
		t.Error("a session used moments ago should not be written back")
	}

	h.now = t0.Add(2 * time.Minute)
	if _, err := h.svc.Authenticate(context.Background(), token); err != nil {
		t.Fatal(err)
	}
	if h.sessions.touched != 1 || !h.sessions.byID[string(hashToken(token))].LastUsedAt.Equal(h.now) {
		t.Error("last use should be refreshed after the touch interval")
	}
}

func TestAuthenticateRejectsMissingUnknownAndExpired(t *testing.T) {
	h, token := signedIn(t)

	for _, tok := range []string{"", "unknown-token"} {
		if _, err := h.svc.Authenticate(context.Background(), tok); !errors.Is(err, domain.ErrUnauthenticated) {
			t.Errorf("token %q: err = %v", tok, err)
		}
	}

	h.now = t0.Add(domain.SessionIdleTimeout)
	if _, err := h.svc.Authenticate(context.Background(), token); !errors.Is(err, domain.ErrUnauthenticated) {
		t.Fatalf("expired: err = %v", err)
	}
	if len(h.sessions.byID) != 0 {
		t.Error("expired session should be deleted")
	}
}

func TestAuthenticateWhenUserVanished(t *testing.T) {
	h, token := signedIn(t)
	delete(h.users.byID, "u-gabriel")

	if _, err := h.svc.Authenticate(context.Background(), token); !errors.Is(err, domain.ErrUnauthenticated) {
		t.Fatalf("err = %v", err)
	}
}

func TestAuthenticateRejectsDeactivatedUser(t *testing.T) {
	h, token := signedIn(t)
	u := h.users.byID["u-gabriel"]
	u.DeactivatedAt = &t0
	h.users.byID["u-gabriel"] = u

	if _, err := h.svc.Authenticate(context.Background(), token); !errors.Is(err, domain.ErrUnauthenticated) {
		t.Fatalf("err = %v, want ErrUnauthenticated", err)
	}
}

func TestAuthenticateInfrastructureFailures(t *testing.T) {
	cases := map[string]struct {
		breakIt func(h *harness)
		at      time.Duration
	}{
		"find session":   {func(h *harness) { h.sessions.findErr = errBoom }, 0},
		"touch":          {func(h *harness) { h.sessions.touchErr = errBoom }, 2 * time.Minute},
		"delete expired": {func(h *harness) { h.sessions.deleteErr = errBoom }, domain.SessionLifetime},
		"find user":      {func(h *harness) { h.users.findErr = errBoom }, 0},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			h, token := signedIn(t)
			tc.breakIt(h)
			h.now = t0.Add(tc.at)
			if _, err := h.svc.Authenticate(context.Background(), token); !errors.Is(err, errBoom) {
				t.Fatalf("err = %v, want boom", err)
			}
		})
	}
}
