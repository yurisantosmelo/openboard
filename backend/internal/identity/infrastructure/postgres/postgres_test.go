package postgres

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/identity/application"
	"github.com/elyosemite/openboard/backend/internal/identity/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/database"
	"github.com/elyosemite/openboard/backend/internal/testsupport/postgrestest"
)

var pool *pgxpool.Pool

func TestMain(m *testing.M) { os.Exit(runWithDatabase(m)) }

func runWithDatabase(m *testing.M) int {
	ctx := context.Background()
	db, err := postgrestest.Start(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer db.Stop()
	pool, err = database.Open(ctx, db.URL)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer pool.Close()
	return m.Run()
}

func reset(t *testing.T) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `TRUNCATE users, sessions CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func createUser(t *testing.T, username string) domain.User {
	t.Helper()
	u, err := NewUsers(pool).Create(context.Background(), application.NewUser{
		Username: domain.Username(username), Name: "Name of " + username, PasswordHash: "hash",
		MustChangePassword: true, IsAdministrator: username == "admin",
	})
	if err != nil {
		t.Fatalf("create %s: %v", username, err)
	}
	return u
}

func digest(s string) []byte {
	sum := sha256.Sum256([]byte(s))
	return sum[:]
}

func assertCount(t *testing.T, want int) {
	t.Helper()
	if n, err := NewUsers(pool).Count(context.Background()); err != nil || n != want {
		t.Fatalf("Count = %d, %v; want %d", n, err, want)
	}
}

func TestUsersCreateAndCount(t *testing.T) {
	reset(t)
	assertCount(t, 0)

	created := createUser(t, "admin")
	if created.ID == "" || created.CreatedAt.IsZero() || !created.IsAdministrator || !created.MustChangePassword {
		t.Fatalf("unexpected created user: %+v", created)
	}
	assertCount(t, 1)
}

func TestUsersFind(t *testing.T) {
	reset(t)
	ctx := context.Background()
	users := NewUsers(pool)
	created := createUser(t, "admin")

	byName, err := users.FindByUsername(ctx, "admin")
	if err != nil || byName.ID != created.ID {
		t.Fatalf("FindByUsername = %+v, %v", byName, err)
	}
	byID, err := users.FindByID(ctx, created.ID)
	if err != nil || byID.Username != "admin" || byID.Name != "Name of admin" {
		t.Fatalf("FindByID = %+v, %v", byID, err)
	}
}

func TestUsersNotFoundAndConstraints(t *testing.T) {
	reset(t)
	ctx := context.Background()
	users := NewUsers(pool)

	if _, err := users.FindByUsername(ctx, "nobody"); !errors.Is(err, application.ErrNotFound) {
		t.Errorf("FindByUsername: err = %v", err)
	}
	if _, err := users.FindByID(ctx, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, application.ErrNotFound) {
		t.Errorf("FindByID: err = %v", err)
	}
	if err := users.UpdatePassword(ctx, "00000000-0000-0000-0000-000000000000", "h", false); !errors.Is(err, application.ErrNotFound) {
		t.Errorf("UpdatePassword: err = %v", err)
	}

	createUser(t, "gabriel")
	_, err := users.Create(ctx, application.NewUser{Username: "gabriel", Name: "Again", PasswordHash: "h"})
	if !errors.Is(err, application.ErrUsernameTaken) {
		t.Errorf("duplicate Username: err = %v, want ErrUsernameTaken", err)
	}
	if err := users.UpdatePassword(ctx, "not-a-uuid", "h", false); err == nil || errors.Is(err, application.ErrNotFound) {
		t.Errorf("malformed id should surface a database error, got %v", err)
	}
}

func TestUsersUpdatePassword(t *testing.T) {
	reset(t)
	ctx := context.Background()
	users := NewUsers(pool)
	u := createUser(t, "gabriel")

	if err := users.UpdatePassword(ctx, u.ID, "new-hash", false); err != nil {
		t.Fatalf("UpdatePassword: %v", err)
	}
	got, _ := users.FindByID(ctx, u.ID)
	if got.PasswordHash != "new-hash" || got.MustChangePassword || got.UpdatedAt.Before(u.UpdatedAt) {
		t.Errorf("not updated: %+v", got)
	}
}

func storedSession(t *testing.T) (domain.Session, time.Time) {
	t.Helper()
	reset(t)
	u := createUser(t, "gabriel")
	now := time.Now().UTC().Truncate(time.Microsecond)
	s := domain.NewSession(digest("token-1"), u.ID, now)
	if err := NewSessions(pool).Create(context.Background(), s); err != nil {
		t.Fatalf("Create: %v", err)
	}
	return s, now
}

func TestSessionsCreateFindTouch(t *testing.T) {
	s, now := storedSession(t)
	ctx := context.Background()
	sessions := NewSessions(pool)

	got, err := sessions.Find(ctx, s.ID)
	if err != nil || got.UserID != s.UserID || !got.ExpiresAt.Equal(s.ExpiresAt) || string(got.ID) != string(s.ID) {
		t.Fatalf("Find = %+v, %v", got, err)
	}

	later := now.Add(time.Hour)
	if err := sessions.Touch(ctx, s.ID, later); err != nil {
		t.Fatalf("Touch: %v", err)
	}
	if got, _ := sessions.Find(ctx, s.ID); !got.LastUsedAt.Equal(later) {
		t.Errorf("LastUsedAt = %v, want %v", got.LastUsedAt, later)
	}
}

func TestSessionsDelete(t *testing.T) {
	s, now := storedSession(t)
	ctx := context.Background()
	sessions := NewSessions(pool)
	later := now.Add(time.Hour)

	if err := sessions.Delete(ctx, s.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	for name, err := range map[string]error{
		"find":   func() error { _, err := sessions.Find(ctx, s.ID); return err }(),
		"touch":  sessions.Touch(ctx, s.ID, later),
		"delete": sessions.Delete(ctx, s.ID),
	} {
		if !errors.Is(err, application.ErrNotFound) {
			t.Errorf("%s after delete: err = %v", name, err)
		}
	}
}

func TestSessionsDeleteOthersKeepsCurrentAndOtherUsers(t *testing.T) {
	reset(t)
	ctx := context.Background()
	sessions := NewSessions(pool)
	gabriel, helena := createUser(t, "gabriel"), createUser(t, "helena")
	now := time.Now().UTC()

	for _, s := range []domain.Session{
		domain.NewSession(digest("g1"), gabriel.ID, now),
		domain.NewSession(digest("g2"), gabriel.ID, now),
		domain.NewSession(digest("h1"), helena.ID, now),
	} {
		if err := sessions.Create(ctx, s); err != nil {
			t.Fatal(err)
		}
	}

	if err := sessions.DeleteOthers(ctx, gabriel.ID, digest("g1")); err != nil {
		t.Fatalf("DeleteOthers: %v", err)
	}
	for token, want := range map[string]bool{"g1": true, "g2": false, "h1": true} {
		_, err := sessions.Find(ctx, digest(token))
		if exists := err == nil; exists != want {
			t.Errorf("session %s exists=%v, want %v", token, exists, want)
		}
	}
}

func TestSessionsDatabaseErrors(t *testing.T) {
	reset(t)
	ctx := context.Background()
	sessions := NewSessions(pool)

	bad := domain.NewSession([]byte("not-32-bytes"), "00000000-0000-0000-0000-000000000000", time.Now())
	if err := sessions.Create(ctx, bad); err == nil {
		t.Error("constraint violation should surface as an error")
	}
	if err := sessions.DeleteOthers(ctx, "not-a-uuid", digest("x")); err == nil {
		t.Error("malformed user id should surface as an error")
	}
	if err := sessions.Touch(ctx, digest("x"), time.Time{}); !errors.Is(err, application.ErrNotFound) {
		t.Errorf("Touch unknown: err = %v", err)
	}
}

func TestClosedPoolErrors(t *testing.T) {
	closed, err := database.Open(context.Background(), pool.Config().ConnString())
	if err != nil {
		t.Fatal(err)
	}
	closed.Close()
	ctx := context.Background()
	users, sessions := NewUsers(closed), NewSessions(closed)

	errs := map[string]error{
		"count":        func() error { _, err := users.Count(ctx); return err }(),
		"find user":    func() error { _, err := users.FindByID(ctx, "x"); return err }(),
		"find session": func() error { _, err := sessions.Find(ctx, digest("x")); return err }(),
		"delete":       sessions.Delete(ctx, digest("x")),
	}
	for name, err := range errs {
		if err == nil || errors.Is(err, application.ErrNotFound) {
			t.Errorf("%s on a closed pool: err = %v", name, err)
		}
	}
}
