package application

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

func TestProvisionUserLinksExistingUserAsIs(t *testing.T) {
	h := newHarness(t, gabriel())

	res, err := h.svc.ProvisionUser(context.Background(), "  GABRIEL  ", "Other Name")
	if err != nil {
		t.Fatalf("ProvisionUser: %v", err)
	}
	if res.User.ID != "u-gabriel" || res.User.Name != "Gabriel" || res.TemporaryPassword != "" {
		t.Errorf("got %+v, want existing Gabriel with no temporary password", res)
	}
	if len(h.users.byID) != 1 {
		t.Errorf("created extra user: %d", len(h.users.byID))
	}
}

func TestProvisionUserCreatesNewUserWithTemporaryPassword(t *testing.T) {
	h := newHarness(t)
	h.svc.random = strings.NewReader("123456789012345")

	res, err := h.svc.ProvisionUser(context.Background(), "  Ana.Silva ", "  Ana Silva  ")
	if err != nil {
		t.Fatalf("ProvisionUser: %v", err)
	}
	if res.User.Username != "ana.silva" || res.User.Name != "Ana Silva" ||
		!res.User.MustChangePassword || res.User.IsAdministrator {
		t.Fatalf("unexpected user: %+v", res.User)
	}
	if len(res.TemporaryPassword) < domain.MinPasswordLength {
		t.Fatalf("temporary password %q too short", res.TemporaryPassword)
	}
	if res.User.PasswordHash != "h:"+res.TemporaryPassword {
		t.Errorf("hash %q does not match temporary password %q", res.User.PasswordHash, res.TemporaryPassword)
	}
}

func TestProvisionUserValidatesAllFields(t *testing.T) {
	h := newHarness(t)

	_, err := h.svc.ProvisionUser(context.Background(), "x", "   ")
	if !errors.Is(err, domain.ErrInvalidUsername) || !errors.Is(err, domain.ErrInvalidName) {
		t.Fatalf("err = %v, want both ErrInvalidUsername and ErrInvalidName", err)
	}
}

func TestProvisionUserRecoversFromConcurrentCreate(t *testing.T) {
	h := newHarness(t)
	racing := &racingUsers{fakeUsers: h.users, created: gabriel()}
	svc, err := NewService(Deps{Users: racing, Sessions: h.sessions, Hasher: h.hasher, Throttle: h.throttle})
	if err != nil {
		t.Fatal(err)
	}

	res, err := svc.ProvisionUser(context.Background(), "gabriel", "Other Name")
	if err != nil {
		t.Fatalf("ProvisionUser: %v", err)
	}
	if res.User.ID != "u-gabriel" || res.TemporaryPassword != "" {
		t.Errorf("got %+v, want existing user with no temporary password", res)
	}
}

func TestProvisionUserReportsConcurrentLookupFailure(t *testing.T) {
	h := newHarness(t)
	h.users.createErr = ErrUsernameTaken

	if _, err := h.svc.ProvisionUser(context.Background(), "gabriel", "Gabriel"); err == nil {
		t.Fatal("expected error when concurrent user cannot be found")
	}
}

func TestProvisionUserPropagatesCollaboratorErrors(t *testing.T) {
	cases := map[string]func(*harness){
		"find error":   func(h *harness) { h.users.findErr = errBoom },
		"random error": func(h *harness) { h.svc.random = failingReader{} },
		"hash error":   func(h *harness) { h.hasher.hashErr = errBoom },
		"create error": func(h *harness) { h.users.createErr = errBoom },
	}
	for name, setup := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t)
			setup(h)
			if _, err := h.svc.ProvisionUser(context.Background(), "ana", "Ana"); !errors.Is(err, errBoom) {
				t.Errorf("err = %v, want %v", err, errBoom)
			}
		})
	}
}

// racingUsers simulates another caller inserting created between Find and Create.
type racingUsers struct {
	*fakeUsers
	created domain.User
}

func (r *racingUsers) Create(_ context.Context, _ NewUser) (domain.User, error) {
	r.byID[r.created.ID] = r.created
	return domain.User{}, ErrUsernameTaken
}
