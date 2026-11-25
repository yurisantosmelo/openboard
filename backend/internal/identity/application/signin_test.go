package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

func TestNewServiceDefaultsAndHashFailure(t *testing.T) {
	svc, err := NewService(Deps{Hasher: &fakeHasher{}})
	if err != nil || svc.now == nil || svc.random == nil {
		t.Fatalf("defaults not applied: %v", err)
	}
	if _, err := NewService(Deps{Hasher: &fakeHasher{hashErr: errBoom}}); !errors.Is(err, errBoom) {
		t.Fatalf("err = %v, want boom", err)
	}
}

func TestSignInStartsSessionAndStoresOnlyTheTokenHash(t *testing.T) {
	h := newHarness(t, gabriel())

	res, err := h.svc.SignIn(context.Background(), "  Gabriel ", "correct horse battery")
	if err != nil {
		t.Fatalf("SignIn: %v", err)
	}
	if res.Token == "" || res.User.ID != "u-gabriel" {
		t.Fatalf("unexpected result: %+v", res)
	}
	stored, ok := h.sessions.byID[string(hashToken(res.Token))]
	if !ok {
		t.Fatal("session not stored under the token hash")
	}
	if _, raw := h.sessions.byID[res.Token]; raw {
		t.Fatal("raw token must never be stored")
	}
	if stored.ExpiresAt != t0.Add(domain.SessionLifetime) || h.throttle.resets != 1 {
		t.Errorf("session %+v, resets %d", stored, h.throttle.resets)
	}
}

func TestSignInRejectsWithoutRevealingWhy(t *testing.T) {
	cases := map[string]struct{ username, password string }{
		"malformed username": {"no", "correct horse battery"},
		"unknown username":   {"helena", "correct horse battery"},
		"wrong password":     {"gabriel", "wrong"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, gabriel())
			_, err := h.svc.SignIn(context.Background(), tc.username, tc.password)
			if !errors.Is(err, domain.ErrInvalidCredentials) {
				t.Fatalf("err = %v, want ErrInvalidCredentials", err)
			}
			if len(h.sessions.byID) != 0 {
				t.Error("no session should be created")
			}
		})
	}
}

func TestSignInRejectsDeactivatedUser(t *testing.T) {
	u := gabriel()
	u.DeactivatedAt = &t0
	h := newHarness(t, u)

	_, err := h.svc.SignIn(context.Background(), "gabriel", "correct horse battery")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("err = %v, want ErrInvalidCredentials", err)
	}
	if len(h.sessions.byID) != 0 || len(h.hasher.verified) != 1 {
		t.Errorf("sessions=%d verified=%d", len(h.sessions.byID), len(h.hasher.verified))
	}
}

func TestSignInEqualizesTimingAndCountsFailures(t *testing.T) {
	h := newHarness(t, gabriel())
	_, _ = h.svc.SignIn(context.Background(), "helena", "whatever")

	if len(h.hasher.verified) != 1 || h.hasher.verified[0] != h.svc.dummyHash {
		t.Errorf("unknown user must still run a hash verification, got %v", h.hasher.verified)
	}
	_, _ = h.svc.SignIn(context.Background(), "gabriel", "wrong")
	if h.throttle.failures["helena"] != 1 || h.throttle.failures["gabriel"] != 1 {
		t.Errorf("failures = %v", h.throttle.failures)
	}
}

func TestSignInBlockedByThrottle(t *testing.T) {
	h := newHarness(t, gabriel())
	h.throttle.blocked["gabriel"] = true

	_, err := h.svc.SignIn(context.Background(), "gabriel", "correct horse battery")
	if !errors.Is(err, domain.ErrTooManyAttempts) || len(h.hasher.verified) != 0 {
		t.Fatalf("err = %v, verified %v", err, h.hasher.verified)
	}
}

func TestSignInInfrastructureFailures(t *testing.T) {
	cases := map[string]func(h *harness){
		"find user":      func(h *harness) { h.users.findErr = errBoom },
		"verify":         func(h *harness) { h.hasher.verifyErr = errBoom },
		"create session": func(h *harness) { h.sessions.createErr = errBoom },
		"random":         func(h *harness) { h.svc.random = failingReader{} },
	}
	for name, breakIt := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, gabriel())
			breakIt(h)
			_, err := h.svc.SignIn(context.Background(), "gabriel", "correct horse battery")
			if !errors.Is(err, errBoom) {
				t.Fatalf("err = %v, want boom", err)
			}
			if h.throttle.failures["gabriel"] != 0 {
				t.Error("infrastructure failures must not count as failed attempts")
			}
		})
	}
}

func TestSignOut(t *testing.T) {
	h := newHarness(t, gabriel())
	res, _ := h.svc.SignIn(context.Background(), "gabriel", "correct horse battery")

	if err := h.svc.SignOut(context.Background(), res.Token); err != nil || len(h.sessions.byID) != 0 {
		t.Fatalf("SignOut: %v, sessions %d", err, len(h.sessions.byID))
	}
	if err := h.svc.SignOut(context.Background(), res.Token); err != nil {
		t.Errorf("signing out twice should be harmless: %v", err)
	}
	if err := h.svc.SignOut(context.Background(), ""); err != nil {
		t.Errorf("empty token: %v", err)
	}
	h.sessions.deleteErr = errBoom
	if err := h.svc.SignOut(context.Background(), "x"); !errors.Is(err, errBoom) {
		t.Errorf("err = %v, want boom", err)
	}
}
