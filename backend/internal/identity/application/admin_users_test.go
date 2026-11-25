package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

const (
	adminUUID   = domain.UserID("11111111-1111-1111-1111-111111111111")
	gabrielUUID = domain.UserID("22222222-2222-2222-2222-222222222222")
	unknownUUID = "99999999-9999-9999-9999-999999999999"
)

func adminPrincipal() Principal {
	return Principal{
		User:      domain.User{ID: adminUUID, Username: "admin", Name: "Administrator", IsAdministrator: true},
		SessionID: []byte("admin-session"),
	}
}

func memberPrincipal() Principal {
	return Principal{
		User:      domain.User{ID: gabrielUUID, Username: "gabriel", Name: "Gabriel"},
		SessionID: []byte("gabriel-session"),
	}
}

func userWithUUID() domain.User {
	return domain.User{ID: gabrielUUID, Username: "gabriel", Name: "Gabriel", PasswordHash: "h:old-secret"}
}

func TestListUsersRequiresAdministrator(t *testing.T) {
	h := newHarness(t, adminPrincipal().User, userWithUUID())

	if _, _, err := h.svc.ListUsers(context.Background(), memberPrincipal(), PageRequest{Limit: 10}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("non-admin err = %v, want ErrForbidden", err)
	}
	users, total, err := h.svc.ListUsers(context.Background(), adminPrincipal(), PageRequest{Limit: 1, Offset: 0})
	if err != nil || total != 2 || len(users) != 1 || users[0].Username != "admin" {
		t.Fatalf("ListUsers = %+v, total=%d, err=%v", users, total, err)
	}
}

func TestDeactivateUserRevokesSessions(t *testing.T) {
	h := newHarness(t, adminPrincipal().User, userWithUUID())
	_ = h.sessions.Create(context.Background(), domain.NewSession([]byte("g1"), gabrielUUID, t0))
	_ = h.sessions.Create(context.Background(), domain.NewSession([]byte("a1"), adminUUID, t0))

	got, err := h.svc.DeactivateUser(context.Background(), adminPrincipal(), string(gabrielUUID))
	if err != nil || !got.IsDeactivated() {
		t.Fatalf("DeactivateUser = %+v, %v", got, err)
	}
	if _, exists := h.sessions.byID["g1"]; exists {
		t.Error("target user sessions must be revoked on deactivation")
	}
	if _, exists := h.sessions.byID["a1"]; !exists {
		t.Error("other users sessions must stay intact")
	}
}

func TestDeactivateUserCallsHook(t *testing.T) {
	h := newHarness(t, adminPrincipal().User, userWithUUID())
	var calledWith domain.UserID
	h.svc.onDeactivated = func(_ context.Context, id domain.UserID) error {
		calledWith = id
		return nil
	}
	if _, err := h.svc.DeactivateUser(context.Background(), adminPrincipal(), string(gabrielUUID)); err != nil {
		t.Fatalf("DeactivateUser err = %v", err)
	}
	if calledWith != gabrielUUID {
		t.Fatalf("hook called with %q, want %q", calledWith, gabrielUUID)
	}
	h.svc.onDeactivated = func(context.Context, domain.UserID) error { return errBoom }
	if _, err := h.svc.DeactivateUser(context.Background(), adminPrincipal(), string(gabrielUUID)); !errors.Is(err, errBoom) {
		t.Fatalf("hook err = %v, want boom", err)
	}
}

func TestDeactivateUserRejections(t *testing.T) {
	cases := map[string]struct {
		actor  Principal
		target string
		setup  func(h *harness)
		want   error
	}{
		"non-admin":   {memberPrincipal(), string(gabrielUUID), nil, domain.ErrForbidden},
		"bad uuid":    {adminPrincipal(), "bad", nil, domain.ErrUserNotFound},
		"self":        {adminPrincipal(), string(adminUUID), nil, domain.ErrCannotDeactivateSelf},
		"last owner":  {adminPrincipal(), string(gabrielUUID), func(h *harness) { h.ownership.soleOwners[gabrielUUID] = true }, domain.ErrLastOrganizationOwner},
		"not found":   {adminPrincipal(), unknownUUID, nil, domain.ErrUserNotFound},
		"check error": {adminPrincipal(), string(gabrielUUID), func(h *harness) { h.ownership.err = errBoom }, errBoom},
		"store error": {adminPrincipal(), string(gabrielUUID), func(h *harness) { h.users.deactivateErr = errBoom }, errBoom},
		"revoke err":  {adminPrincipal(), string(gabrielUUID), func(h *harness) { h.sessions.deleteAllErr = errBoom }, errBoom},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, adminPrincipal().User, userWithUUID())
			if tc.setup != nil {
				tc.setup(h)
			}
			if _, err := h.svc.DeactivateUser(context.Background(), tc.actor, tc.target); !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestReactivateUser(t *testing.T) {
	u := userWithUUID()
	u.DeactivatedAt = &t0
	h := newHarness(t, adminPrincipal().User, u)

	got, err := h.svc.ReactivateUser(context.Background(), adminPrincipal(), string(gabrielUUID))
	if err != nil || got.IsDeactivated() {
		t.Fatalf("ReactivateUser = %+v, %v", got, err)
	}

	for name, err := range map[string]error{
		"non-admin": func() error {
			_, e := h.svc.ReactivateUser(context.Background(), memberPrincipal(), string(gabrielUUID))
			return e
		}(),
		"bad uuid": func() error { _, e := h.svc.ReactivateUser(context.Background(), adminPrincipal(), "bad"); return e }(),
		"not found": func() error {
			_, e := h.svc.ReactivateUser(context.Background(), adminPrincipal(), unknownUUID)
			return e
		}(),
	} {
		if err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
	h.users.reactivateErr = errBoom
	if _, err := h.svc.ReactivateUser(context.Background(), adminPrincipal(), string(gabrielUUID)); !errors.Is(err, errBoom) {
		t.Errorf("store err = %v, want boom", err)
	}
}

func TestIssueTemporaryPassword(t *testing.T) {
	h := newHarness(t, adminPrincipal().User, userWithUUID())
	_ = h.sessions.Create(context.Background(), domain.NewSession([]byte("g1"), gabrielUUID, t0))
	_ = h.sessions.Create(context.Background(), domain.NewSession([]byte("admin-session"), adminUUID, t0))
	_ = h.sessions.Create(context.Background(), domain.NewSession([]byte("admin-other"), adminUUID, t0))

	issued, err := h.svc.IssueTemporaryPassword(context.Background(), adminPrincipal(), string(gabrielUUID))
	if err != nil || issued.TemporaryPassword == "" || !issued.User.MustChangePassword {
		t.Fatalf("IssueTemporaryPassword = %+v, %v", issued, err)
	}
	if _, exists := h.sessions.byID["g1"]; exists {
		t.Error("target user sessions must be revoked")
	}

	selfIssued, err := h.svc.IssueTemporaryPassword(context.Background(), adminPrincipal(), string(adminUUID))
	if err != nil || selfIssued.TemporaryPassword == "" {
		t.Fatalf("self IssueTemporaryPassword = %+v, %v", selfIssued, err)
	}
	if _, kept := h.sessions.byID["admin-session"]; !kept {
		t.Error("current admin session should stay active when issuing for self")
	}
	if _, dropped := h.sessions.byID["admin-other"]; dropped {
		t.Error("other admin sessions should be revoked")
	}
}

func TestIssueTemporaryPasswordRejections(t *testing.T) {
	deactivated := userWithUUID()
	deactivated.DeactivatedAt = &t0

	cases := map[string]struct {
		actor  Principal
		target string
		users  []domain.User
		setup  func(h *harness)
		want   error
	}{
		"non-admin":   {memberPrincipal(), string(gabrielUUID), []domain.User{userWithUUID()}, nil, domain.ErrForbidden},
		"bad uuid":    {adminPrincipal(), "bad", []domain.User{userWithUUID()}, nil, domain.ErrUserNotFound},
		"not found":   {adminPrincipal(), unknownUUID, []domain.User{userWithUUID()}, nil, domain.ErrUserNotFound},
		"deactivated": {adminPrincipal(), string(gabrielUUID), []domain.User{deactivated}, nil, domain.ErrUserDeactivated},
		"find err":    {adminPrincipal(), string(gabrielUUID), []domain.User{userWithUUID()}, func(h *harness) { h.users.findErr = errBoom }, errBoom},
		"random err":  {adminPrincipal(), string(gabrielUUID), []domain.User{userWithUUID()}, func(h *harness) { h.svc.random = failingReader{} }, errBoom},
		"hash err":    {adminPrincipal(), string(gabrielUUID), []domain.User{userWithUUID()}, func(h *harness) { h.hasher.hashErr = errBoom }, errBoom},
		"update err":  {adminPrincipal(), string(gabrielUUID), []domain.User{userWithUUID()}, func(h *harness) { h.users.updateErr = errBoom }, errBoom},
		"revoke all":  {adminPrincipal(), string(gabrielUUID), []domain.User{userWithUUID()}, func(h *harness) { h.sessions.deleteAllErr = errBoom }, errBoom},
		"revoke oth":  {adminPrincipal(), string(adminUUID), []domain.User{adminPrincipal().User}, func(h *harness) { h.sessions.deleteOthErr = errBoom }, errBoom},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, tc.users...)
			if tc.setup != nil {
				tc.setup(h)
			}
			if _, err := h.svc.IssueTemporaryPassword(context.Background(), tc.actor, tc.target); !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
}
