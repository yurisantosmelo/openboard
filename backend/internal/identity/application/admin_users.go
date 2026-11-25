package application

import (
	"context"
	"errors"
	"fmt"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
)

// IssuedTemporaryPassword carries the User whose password was reset and the
// one-time Temporary Password to share with them.
type IssuedTemporaryPassword struct {
	User              domain.User
	TemporaryPassword string
}

// ListUsers returns one page of all Users in the Instance for an Administrator,
// along with the total count.
func (s *Service) ListUsers(ctx context.Context, actor Principal, page PageRequest) ([]domain.User, int, error) {
	if !actor.User.IsAdministrator {
		return nil, 0, domain.ErrForbidden
	}
	return s.users.List(ctx, page)
}

// DeactivateUser marks a User as Deactivated and revokes all of their sessions.
// Only Administrators may deactivate Users, an Administrator cannot deactivate
// themselves, and the sole active Organization Owner of any Organization cannot
// be Deactivated.
func (s *Service) DeactivateUser(ctx context.Context, actor Principal, rawUserID string) (domain.User, error) {
	if !actor.User.IsAdministrator {
		return domain.User{}, domain.ErrForbidden
	}
	userID, err := domain.ParseUserID(rawUserID)
	if err != nil {
		return domain.User{}, err
	}
	if userID == actor.User.ID {
		return domain.User{}, domain.ErrCannotDeactivateSelf
	}
	soleOwner, err := s.ownership.IsSoleOrganizationOwner(ctx, userID)
	if err != nil {
		return domain.User{}, fmt.Errorf("check organization ownership: %w", err)
	}
	if soleOwner {
		return domain.User{}, domain.ErrLastOrganizationOwner
	}

	user, err := s.users.Deactivate(ctx, userID, s.now())
	if errors.Is(err, ErrNotFound) {
		return domain.User{}, domain.ErrUserNotFound
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("deactivate user: %w", err)
	}
	if err := s.sessions.DeleteAll(ctx, userID); err != nil {
		return domain.User{}, fmt.Errorf("revoke user sessions: %w", err)
	}
	return user, nil
}

// ReactivateUser restores a Deactivated User so they can sign in again and
// receive new Memberships. Only Administrators may reactivate Users.
func (s *Service) ReactivateUser(ctx context.Context, actor Principal, rawUserID string) (domain.User, error) {
	if !actor.User.IsAdministrator {
		return domain.User{}, domain.ErrForbidden
	}
	userID, err := domain.ParseUserID(rawUserID)
	if err != nil {
		return domain.User{}, err
	}
	user, err := s.users.Reactivate(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return domain.User{}, domain.ErrUserNotFound
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("reactivate user: %w", err)
	}
	return user, nil
}

// IssueTemporaryPassword assigns a fresh one-time Temporary Password to an
// active User and revokes their existing sessions. Only Administrators may
// issue a Temporary Password to an existing User.
func (s *Service) IssueTemporaryPassword(ctx context.Context, actor Principal, rawUserID string) (IssuedTemporaryPassword, error) {
	if !actor.User.IsAdministrator {
		return IssuedTemporaryPassword{}, domain.ErrForbidden
	}
	userID, err := domain.ParseUserID(rawUserID)
	if err != nil {
		return IssuedTemporaryPassword{}, err
	}
	user, err := s.users.FindByID(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return IssuedTemporaryPassword{}, domain.ErrUserNotFound
	}
	if err != nil {
		return IssuedTemporaryPassword{}, fmt.Errorf("find user: %w", err)
	}
	if user.IsDeactivated() {
		return IssuedTemporaryPassword{}, domain.ErrUserDeactivated
	}

	password, hash, err := s.newTemporaryPasswordHash()
	if err != nil {
		return IssuedTemporaryPassword{}, err
	}
	if err := s.users.UpdatePassword(ctx, user.ID, hash, true); err != nil {
		return IssuedTemporaryPassword{}, fmt.Errorf("update temporary password: %w", err)
	}
	if err := s.revokeAfterTemporaryPassword(ctx, actor, user.ID); err != nil {
		return IssuedTemporaryPassword{}, err
	}
	user.PasswordHash = hash
	user.MustChangePassword = true
	return IssuedTemporaryPassword{User: user, TemporaryPassword: password}, nil
}

func (s *Service) newTemporaryPasswordHash() (string, string, error) {
	password, err := s.generateTemporaryPassword()
	if err != nil {
		return "", "", err
	}
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return "", "", fmt.Errorf("hash temporary password: %w", err)
	}
	return password, hash, nil
}

func (s *Service) revokeAfterTemporaryPassword(ctx context.Context, actor Principal, targetID domain.UserID) error {
	if targetID == actor.User.ID {
		if err := s.sessions.DeleteOthers(ctx, targetID, actor.SessionID); err != nil {
			return fmt.Errorf("end other sessions: %w", err)
		}
		return nil
	}
	if err := s.sessions.DeleteAll(ctx, targetID); err != nil {
		return fmt.Errorf("revoke user sessions: %w", err)
	}
	return nil
}
