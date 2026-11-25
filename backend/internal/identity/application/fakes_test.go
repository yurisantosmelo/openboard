package application

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

var (
	errBoom = errors.New("boom")
	t0      = time.Date(2026, 11, 15, 12, 0, 0, 0, time.UTC)
)

type fakeUsers struct {
	byID          map[domain.UserID]domain.User
	countErr      error
	createErr     error
	findErr       error
	listErr       error
	updateErr     error
	deactivateErr error
	reactivateErr error
}

func newFakeUsers(users ...domain.User) *fakeUsers {
	f := &fakeUsers{byID: map[domain.UserID]domain.User{}}
	for _, u := range users {
		f.byID[u.ID] = u
	}
	return f
}

func (f *fakeUsers) Count(context.Context) (int, error) { return len(f.byID), f.countErr }

func (f *fakeUsers) Create(_ context.Context, n NewUser) (domain.User, error) {
	if f.createErr != nil {
		return domain.User{}, f.createErr
	}
	u := domain.User{
		ID: domain.UserID(fmt.Sprintf("u%d", len(f.byID)+1)), Username: n.Username, Name: n.Name,
		PasswordHash: n.PasswordHash, MustChangePassword: n.MustChangePassword, IsAdministrator: n.IsAdministrator,
	}
	f.byID[u.ID] = u
	return u, nil
}

func (f *fakeUsers) FindByID(_ context.Context, id domain.UserID) (domain.User, error) {
	if f.findErr != nil {
		return domain.User{}, f.findErr
	}
	u, ok := f.byID[id]
	if !ok {
		return domain.User{}, ErrNotFound
	}
	return u, nil
}

func (f *fakeUsers) FindByUsername(_ context.Context, username domain.Username) (domain.User, error) {
	if f.findErr != nil {
		return domain.User{}, f.findErr
	}
	for _, u := range f.byID {
		if u.Username == username {
			return u, nil
		}
	}
	return domain.User{}, ErrNotFound
}

func (f *fakeUsers) UpdatePassword(_ context.Context, id domain.UserID, hash string, mustChange bool) error {
	if f.updateErr != nil {
		return f.updateErr
	}
	u := f.byID[id]
	u.PasswordHash, u.MustChangePassword = hash, mustChange
	f.byID[id] = u
	return nil
}

func (f *fakeUsers) List(_ context.Context, page PageRequest) ([]domain.User, int, error) {
	if f.listErr != nil {
		return nil, 0, f.listErr
	}
	all := make([]domain.User, 0, len(f.byID))
	for _, u := range f.byID {
		all = append(all, u)
	}
	sort.Slice(all, func(i, j int) bool {
		if li, lj := strings.ToLower(all[i].Name), strings.ToLower(all[j].Name); li != lj {
			return li < lj
		}
		if all[i].Username != all[j].Username {
			return all[i].Username < all[j].Username
		}
		return all[i].ID < all[j].ID
	})
	if page.Offset >= len(all) {
		return []domain.User{}, len(all), nil
	}
	end := page.Offset + page.Limit
	if page.Limit <= 0 || end > len(all) {
		end = len(all)
	}
	return all[page.Offset:end], len(all), nil
}

func (f *fakeUsers) Deactivate(_ context.Context, id domain.UserID, at time.Time) (domain.User, error) {
	if f.deactivateErr != nil {
		return domain.User{}, f.deactivateErr
	}
	u, ok := f.byID[id]
	if !ok {
		return domain.User{}, ErrNotFound
	}
	if u.DeactivatedAt == nil {
		t := at
		u.DeactivatedAt = &t
	}
	f.byID[id] = u
	return u, nil
}

func (f *fakeUsers) Reactivate(_ context.Context, id domain.UserID) (domain.User, error) {
	if f.reactivateErr != nil {
		return domain.User{}, f.reactivateErr
	}
	u, ok := f.byID[id]
	if !ok {
		return domain.User{}, ErrNotFound
	}
	u.DeactivatedAt = nil
	f.byID[id] = u
	return u, nil
}

type fakeSessions struct {
	byID         map[string]domain.Session
	createErr    error
	findErr      error
	touchErr     error
	deleteErr    error
	deleteOthErr error
	deleteAllErr error
	touched      int
}

func newFakeSessions(sessions ...domain.Session) *fakeSessions {
	f := &fakeSessions{byID: map[string]domain.Session{}}
	for _, s := range sessions {
		f.byID[string(s.ID)] = s
	}
	return f
}

func (f *fakeSessions) Create(_ context.Context, s domain.Session) error {
	if f.createErr != nil {
		return f.createErr
	}
	f.byID[string(s.ID)] = s
	return nil
}

func (f *fakeSessions) Find(_ context.Context, id []byte) (domain.Session, error) {
	if f.findErr != nil {
		return domain.Session{}, f.findErr
	}
	s, ok := f.byID[string(id)]
	if !ok {
		return domain.Session{}, ErrNotFound
	}
	return s, nil
}

func (f *fakeSessions) Touch(_ context.Context, id []byte, at time.Time) error {
	if f.touchErr != nil {
		return f.touchErr
	}
	s := f.byID[string(id)]
	s.LastUsedAt = at
	f.byID[string(id)] = s
	f.touched++
	return nil
}

func (f *fakeSessions) Delete(_ context.Context, id []byte) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	if _, ok := f.byID[string(id)]; !ok {
		return ErrNotFound
	}
	delete(f.byID, string(id))
	return nil
}

func (f *fakeSessions) DeleteOthers(_ context.Context, userID domain.UserID, keep []byte) error {
	if f.deleteOthErr != nil {
		return f.deleteOthErr
	}
	for k, s := range f.byID {
		if s.UserID == userID && k != string(keep) {
			delete(f.byID, k)
		}
	}
	return nil
}

func (f *fakeSessions) DeleteAll(_ context.Context, userID domain.UserID) error {
	if f.deleteAllErr != nil {
		return f.deleteAllErr
	}
	for k, s := range f.byID {
		if s.UserID == userID {
			delete(f.byID, k)
		}
	}
	return nil
}

type fakeOwnership struct {
	soleOwners map[domain.UserID]bool
	err        error
}

func (f *fakeOwnership) IsSoleOrganizationOwner(_ context.Context, userID domain.UserID) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	return f.soleOwners[userID], nil
}

// fakeHasher "hashes" by prefixing, so tests can read hashes directly.
type fakeHasher struct {
	hashErr   error
	verifyErr error
	verified  []string
}

func (f *fakeHasher) Hash(p string) (string, error) {
	if f.hashErr != nil {
		return "", f.hashErr
	}
	return "h:" + p, nil
}

func (f *fakeHasher) Verify(p, encoded string) (bool, error) {
	f.verified = append(f.verified, encoded)
	if f.verifyErr != nil {
		return false, f.verifyErr
	}
	return encoded == "h:"+p, nil
}

type fakeThrottle struct {
	blocked  map[domain.Username]bool
	failures map[domain.Username]int
	resets   int
}

func newFakeThrottle() *fakeThrottle {
	return &fakeThrottle{blocked: map[domain.Username]bool{}, failures: map[domain.Username]int{}}
}

func (f *fakeThrottle) Allow(u domain.Username) bool    { return !f.blocked[u] }
func (f *fakeThrottle) RecordFailure(u domain.Username) { f.failures[u]++ }
func (f *fakeThrottle) Reset(domain.Username)           { f.resets++ }

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errBoom }

type harness struct {
	svc       *Service
	users     *fakeUsers
	sessions  *fakeSessions
	hasher    *fakeHasher
	throttle  *fakeThrottle
	ownership *fakeOwnership
	now       time.Time
}

func newHarness(t *testing.T, users ...domain.User) *harness {
	t.Helper()
	h := &harness{
		users: newFakeUsers(users...), sessions: newFakeSessions(),
		hasher: &fakeHasher{}, throttle: newFakeThrottle(),
		ownership: &fakeOwnership{soleOwners: map[domain.UserID]bool{}}, now: t0,
	}
	svc, err := NewService(Deps{
		Users: h.users, Sessions: h.sessions, Hasher: h.hasher, Throttle: h.throttle,
		Ownership: h.ownership, Now: func() time.Time { return h.now },
	})
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	h.svc = svc
	return h
}

func gabriel() domain.User {
	return domain.User{ID: "u-gabriel", Username: "gabriel", Name: "Gabriel", PasswordHash: "h:correct horse battery"}
}
