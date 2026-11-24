// Package postgres implements the identity repositories on PostgreSQL with pgx.
package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/identity/application"
	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

const (
	userColumns     = `id::text, username, name, password_hash, must_change_password, is_administrator, created_at, updated_at`
	uqUsersUsername = "uq_users_username"
)

// Users stores Users in the users table.
type Users struct {
	pool *pgxpool.Pool
}

// NewUsers returns a Users repository backed by pool.
func NewUsers(pool *pgxpool.Pool) *Users {
	return &Users{pool: pool}
}

// Count returns how many Users exist in the Instance.
func (r *Users) Count(ctx context.Context) (int, error) {
	var n int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count users: %w", err)
	}
	return n, nil
}

// Create inserts a User and returns it with its generated ID and timestamps.
// It returns application.ErrUsernameTaken when the Username is already used.
func (r *Users) Create(ctx context.Context, u application.NewUser) (domain.User, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO users (username, name, password_hash, must_change_password, is_administrator)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+userColumns,
		u.Username.String(), u.Name, u.PasswordHash, u.MustChangePassword, u.IsAdministrator)
	user, err := scanUser(row)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == uqUsersUsername {
		return domain.User{}, application.ErrUsernameTaken
	}
	return user, err
}

// FindByID returns the User with id, or application.ErrNotFound.
func (r *Users) FindByID(ctx context.Context, id domain.UserID) (domain.User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, string(id)))
}

// FindByUsername returns the User with username, or application.ErrNotFound.
func (r *Users) FindByUsername(ctx context.Context, username domain.Username) (domain.User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE username = $1`, username.String()))
}

// UpdatePassword replaces a User's password hash and Temporary Password flag.
func (r *Users) UpdatePassword(ctx context.Context, id domain.UserID, passwordHash string, mustChange bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET password_hash = $2, must_change_password = $3, updated_at = NOW()
		WHERE id = $1`,
		string(id), passwordHash, mustChange)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return application.ErrNotFound
	}
	return nil
}

func scanUser(row pgx.Row) (domain.User, error) {
	var (
		u            domain.User
		id, username string
	)
	err := row.Scan(&id, &username, &u.Name, &u.PasswordHash, &u.MustChangePassword, &u.IsAdministrator, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, application.ErrNotFound
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("scan user: %w", err)
	}
	u.ID = domain.UserID(id)
	u.Username = domain.Username(username)
	return u, nil
}
