// Package domain holds the identity rules: Users, Usernames, passwords and
// sessions. It depends on nothing outside the standard library.
package domain

import "errors"

var (
	// ErrInvalidUsername reports a Username outside the allowed format.
	ErrInvalidUsername = errors.New("username must be 3-32 characters of a-z, 0-9, '.', '_' or '-'")
	// ErrInvalidName reports a blank or oversized display name.
	ErrInvalidName = errors.New("name must be 1-255 characters and not blank")
	// ErrWeakPassword reports a new password that breaks the password rules.
	ErrWeakPassword = errors.New("password does not meet the rules")
	// ErrInvalidCredentials reports a failed sign-in, without saying which part was wrong.
	ErrInvalidCredentials = errors.New("invalid username or password")
	// ErrWrongCurrentPassword reports a password change with an incorrect current password.
	ErrWrongCurrentPassword = errors.New("current password is incorrect")
	// ErrUnauthenticated reports a missing, unknown or expired session.
	ErrUnauthenticated = errors.New("not signed in")
	// ErrTooManyAttempts reports a Username temporarily blocked after repeated failures.
	ErrTooManyAttempts = errors.New("too many failed sign-in attempts")
	// ErrForbidden reports an Actor not allowed to perform an Instance administration action.
	ErrForbidden = errors.New("not allowed")
	// ErrUserNotFound reports a User that does not exist.
	ErrUserNotFound = errors.New("user not found")
	// ErrCannotDeactivateSelf reports an Administrator trying to deactivate their own User.
	ErrCannotDeactivateSelf = errors.New("you cannot deactivate yourself")
	// ErrLastOrganizationOwner reports a User who cannot be Deactivated because they are the last Organization Owner of an Organization.
	ErrLastOrganizationOwner = errors.New("user is the last organization owner of an organization")
	// ErrUserDeactivated reports an operation rejected because the target User is Deactivated.
	ErrUserDeactivated = errors.New("user is deactivated")
)
