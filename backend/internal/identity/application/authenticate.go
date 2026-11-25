package application

import (
	"context"
	"errors"
	"fmt"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

// Principal is the authenticated User behind a request and the session used.
type Principal struct {
	User      domain.User
	SessionID []byte
}

// Authenticate resolves a session token into a Principal. Missing, unknown and
// expired sessions all return domain.ErrUnauthenticated; expired ones are removed.
func (s *Service) Authenticate(ctx context.Context, token string) (Principal, error) {
	if token == "" {
		return Principal{}, domain.ErrUnauthenticated
	}
	session, err := s.activeSession(ctx, hashToken(token))
	if err != nil {
		return Principal{}, err
	}

	user, err := s.users.FindByID(ctx, session.UserID)
	if errors.Is(err, ErrNotFound) {
		return Principal{}, domain.ErrUnauthenticated
	}
	if err != nil {
		return Principal{}, fmt.Errorf("find session user: %w", err)
	}
	if user.IsDeactivated() {
		return Principal{}, domain.ErrUnauthenticated
	}
	return Principal{User: user, SessionID: session.ID}, nil
}

func (s *Service) activeSession(ctx context.Context, id []byte) (domain.Session, error) {
	session, err := s.sessions.Find(ctx, id)
	if errors.Is(err, ErrNotFound) {
		return domain.Session{}, domain.ErrUnauthenticated
	}
	if err != nil {
		return domain.Session{}, fmt.Errorf("find session: %w", err)
	}

	now := s.now()
	if session.IsExpired(now) {
		if err := s.sessions.Delete(ctx, id); err != nil && !errors.Is(err, ErrNotFound) {
			return domain.Session{}, fmt.Errorf("delete expired session: %w", err)
		}
		return domain.Session{}, domain.ErrUnauthenticated
	}

	if now.Sub(session.LastUsedAt) >= touchInterval {
		if err := s.sessions.Touch(ctx, id, now); err != nil {
			return domain.Session{}, fmt.Errorf("touch session: %w", err)
		}
	}
	return session, nil
}
