package application

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

// temporaryPasswordBytes gives 120 bits of entropy encoded into 20 URL-safe
// characters, comfortably above domain.MinPasswordLength.
const temporaryPasswordBytes = 15

// ProvisionResult carries the User resolved by ProvisionUser and, when a new
// User was created, the Temporary Password to show once.
type ProvisionResult struct {
	User              domain.User
	TemporaryPassword string
}

// ProvisionUser returns the User with rawUsername, or creates a new User with
// rawName and a generated Temporary Password when the Username is unknown.
// Invalid fields are all reported at once, joined.
func (s *Service) ProvisionUser(ctx context.Context, rawUsername, rawName string) (ProvisionResult, error) {
	username, usernameErr := domain.ParseUsername(rawUsername)
	name, nameErr := domain.ParseName(rawName)
	if err := errors.Join(usernameErr, nameErr); err != nil {
		return ProvisionResult{}, err
	}

	user, err := s.users.FindByUsername(ctx, username)
	if err == nil {
		return ProvisionResult{User: user}, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return ProvisionResult{}, fmt.Errorf("find user: %w", err)
	}
	return s.createProvisionedUser(ctx, username, name)
}

func (s *Service) createProvisionedUser(ctx context.Context, username domain.Username, name string) (ProvisionResult, error) {
	password, err := s.generateTemporaryPassword()
	if err != nil {
		return ProvisionResult{}, err
	}
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return ProvisionResult{}, fmt.Errorf("hash temporary password: %w", err)
	}

	user, err := s.users.Create(ctx, NewUser{
		Username:           username,
		Name:               name,
		PasswordHash:       hash,
		MustChangePassword: true,
	})
	if errors.Is(err, ErrUsernameTaken) {
		existing, findErr := s.users.FindByUsername(ctx, username)
		if findErr != nil {
			return ProvisionResult{}, fmt.Errorf("find concurrent user: %w", findErr)
		}
		return ProvisionResult{User: existing}, nil
	}
	if err != nil {
		return ProvisionResult{}, fmt.Errorf("create user: %w", err)
	}
	return ProvisionResult{User: user, TemporaryPassword: password}, nil
}

func (s *Service) generateTemporaryPassword() (string, error) {
	raw := make([]byte, temporaryPasswordBytes)
	if _, err := io.ReadFull(s.random, raw); err != nil {
		return "", fmt.Errorf("generate temporary password: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
