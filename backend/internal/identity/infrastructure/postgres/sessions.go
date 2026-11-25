package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/identity/application"
	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

// Sessions stores sessions in the sessions table, keyed by token digest.
type Sessions struct {
	pool *pgxpool.Pool
}

// NewSessions returns a Sessions repository backed by pool.
func NewSessions(pool *pgxpool.Pool) *Sessions {
	return &Sessions{pool: pool}
}

// Create inserts a session.
func (r *Sessions) Create(ctx context.Context, s domain.Session) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO sessions (id, user_id, created_at, last_used_at, expires_at)
		VALUES ($1, $2, $3, $4, $5)`,
		s.ID, string(s.UserID), s.CreatedAt, s.LastUsedAt, s.ExpiresAt)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// Find returns the session with id, or application.ErrNotFound.
func (r *Sessions) Find(ctx context.Context, id []byte) (domain.Session, error) {
	var (
		s      domain.Session
		userID string
	)
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id::text, created_at, last_used_at, expires_at
		FROM sessions WHERE id = $1`, id).
		Scan(&s.ID, &userID, &s.CreatedAt, &s.LastUsedAt, &s.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Session{}, application.ErrNotFound
	}
	if err != nil {
		return domain.Session{}, fmt.Errorf("find session: %w", err)
	}
	s.UserID = domain.UserID(userID)
	return s, nil
}

// Touch records that the session was used at the given time.
func (r *Sessions) Touch(ctx context.Context, id []byte, at time.Time) error {
	return r.exec(ctx, `UPDATE sessions SET last_used_at = $2 WHERE id = $1`, id, at)
}

// Delete removes the session with id, or returns application.ErrNotFound.
func (r *Sessions) Delete(ctx context.Context, id []byte) error {
	return r.exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
}

// DeleteOthers removes every session of userID except keep.
func (r *Sessions) DeleteOthers(ctx context.Context, userID domain.UserID, keep []byte) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, string(userID), keep)
	if err != nil {
		return fmt.Errorf("delete other sessions: %w", err)
	}
	return nil
}

// DeleteAll removes every session of userID.
func (r *Sessions) DeleteAll(ctx context.Context, userID domain.UserID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, string(userID))
	if err != nil {
		return fmt.Errorf("delete all sessions: %w", err)
	}
	return nil
}

// exec runs a statement that must affect exactly the session it targets.
func (r *Sessions) exec(ctx context.Context, sql string, args ...any) error {
	tag, err := r.pool.Exec(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("session statement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return application.ErrNotFound
	}
	return nil
}
