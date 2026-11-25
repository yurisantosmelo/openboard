// Package application implements the identity use cases: signing in and out,
// authenticating sessions, changing passwords and creating the first
// Administrator. Storage, hashing and throttling are injected through ports.
package application

import (
	"context"
	"errors"
	"time"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

// ErrNotFound is returned by repositories when a record does not exist.
var ErrNotFound = errors.New("not found")

// ErrUsernameTaken is returned by UserRepository.Create when another User
// already holds the Username.
var ErrUsernameTaken = errors.New("username already in use")

// NewUser holds what is needed to create a User; the repository assigns the ID.
type NewUser struct {
	Username           domain.Username
	Name               string
	PasswordHash       string
	MustChangePassword bool
	IsAdministrator    bool
}

// PageRequest selects one page from a collection.
type PageRequest struct {
	Limit  int
	Offset int
}

// UserRepository stores Users.
type UserRepository interface {
	Count(ctx context.Context) (int, error)
	Create(ctx context.Context, user NewUser) (domain.User, error)
	FindByID(ctx context.Context, id domain.UserID) (domain.User, error)
	FindByUsername(ctx context.Context, username domain.Username) (domain.User, error)
	List(ctx context.Context, page PageRequest) ([]domain.User, int, error)
	UpdatePassword(ctx context.Context, id domain.UserID, passwordHash string, mustChange bool) error
	Deactivate(ctx context.Context, id domain.UserID, at time.Time) (domain.User, error)
	Reactivate(ctx context.Context, id domain.UserID) (domain.User, error)
}

// SessionRepository stores sessions by the SHA-256 digest of their token.
type SessionRepository interface {
	Create(ctx context.Context, session domain.Session) error
	Find(ctx context.Context, id []byte) (domain.Session, error)
	Touch(ctx context.Context, id []byte, at time.Time) error
	Delete(ctx context.Context, id []byte) error
	DeleteOthers(ctx context.Context, userID domain.UserID, keep []byte) error
	DeleteAll(ctx context.Context, userID domain.UserID) error
}

// OwnershipChecker reports whether a User is the sole active Organization Owner
// of any Organization, preventing deactivation while they are.
type OwnershipChecker interface {
	IsSoleOrganizationOwner(ctx context.Context, userID domain.UserID) (bool, error)
}

// PasswordHasher hashes passwords and checks them against stored hashes.
type PasswordHasher interface {
	Hash(password string) (string, error)
	Verify(password, encodedHash string) (bool, error)
}

// SignInThrottle blocks a Username after repeated failed sign-ins.
type SignInThrottle interface {
	Allow(username domain.Username) bool
	RecordFailure(username domain.Username)
	Reset(username domain.Username)
}
