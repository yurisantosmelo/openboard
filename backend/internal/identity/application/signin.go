package application

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

const tokenBytes = 32

// SignInResult carries the session token for the cookie and the signed-in User.
type SignInResult struct {
	Token string
	User  domain.User
}

// SignIn checks a Username and password and starts a session. Every credential
// failure returns domain.ErrInvalidCredentials, so callers cannot tell whether
// the Username exists.
func (s *Service) SignIn(ctx context.Context, rawUsername, password string) (SignInResult, error) {
	username, err := domain.ParseUsername(rawUsername)
	if err != nil {
		return SignInResult{}, domain.ErrInvalidCredentials
	}
	if !s.throttle.Allow(username) {
		return SignInResult{}, domain.ErrTooManyAttempts
	}

	user, err := s.verifyCredentials(ctx, username, password)
	if errors.Is(err, domain.ErrInvalidCredentials) {
		s.throttle.RecordFailure(username)
	}
	if err != nil {
		return SignInResult{}, err
	}
	s.throttle.Reset(username)

	token, err := s.startSession(ctx, user.ID)
	if err != nil {
		return SignInResult{}, err
	}
	return SignInResult{Token: token, User: user}, nil
}

func (s *Service) verifyCredentials(ctx context.Context, username domain.Username, password string) (domain.User, error) {
	user, err := s.users.FindByUsername(ctx, username)
	if errors.Is(err, ErrNotFound) {
		_, _ = s.hasher.Verify(password, s.dummyHash)
		return domain.User{}, domain.ErrInvalidCredentials
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("find user: %w", err)
	}

	ok, err := s.hasher.Verify(password, user.PasswordHash)
	if err != nil {
		return domain.User{}, fmt.Errorf("verify password: %w", err)
	}
	if !ok || user.IsDeactivated() {
		return domain.User{}, domain.ErrInvalidCredentials
	}
	return user, nil
}

func (s *Service) startSession(ctx context.Context, userID domain.UserID) (string, error) {
	raw := make([]byte, tokenBytes)
	if _, err := io.ReadFull(s.random, raw); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)

	session := domain.NewSession(hashToken(token), userID, s.now())
	if err := s.sessions.Create(ctx, session); err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

// SignOut ends the session behind token. Unknown tokens are ignored.
func (s *Service) SignOut(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	if err := s.sessions.Delete(ctx, hashToken(token)); err != nil && !errors.Is(err, ErrNotFound) {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
