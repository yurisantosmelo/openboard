// Package domain holds the Organization rules: the tenant (ADR 0003), its
// Workspaces and Organization Memberships. It depends on nothing outside the
// standard library.
package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	// ErrInvalidName reports a blank or oversized Organization name.
	ErrInvalidName = errors.New("name must be 1-255 characters and not blank")
	// ErrInvalidUserID reports a User ID that is not a UUID.
	ErrInvalidUserID = errors.New("user id must be a UUID")
	// ErrOwnerNotFound reports a named Organization Owner who is not a User.
	ErrOwnerNotFound = errors.New("user not found")
	// ErrForbidden reports an Actor not allowed to perform the operation.
	ErrForbidden = errors.New("not allowed")
	// ErrNotFound reports an Organization that does not exist or that the
	// Actor cannot see, without telling which (ADR 0003).
	ErrNotFound = errors.New("organization not found")
)

const maxNameLength = 255

// DefaultWorkspaceName names the Default Workspace created with every Organization.
const DefaultWorkspaceName = "Default"

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// OrganizationID identifies an Organization.
type OrganizationID string

// UserID identifies a User, owned by the identity module.
type UserID string

// ParseUserID normalizes a User ID to lowercase and checks it is a UUID.
func ParseUserID(raw string) (UserID, error) {
	id := strings.ToLower(strings.TrimSpace(raw))
	if !uuidPattern.MatchString(id) {
		return "", ErrInvalidUserID
	}
	return UserID(id), nil
}

// ParseOrganizationID normalizes an Organization ID; anything that is not a
// UUID names no Organization.
func ParseOrganizationID(raw string) (OrganizationID, error) {
	id := strings.ToLower(strings.TrimSpace(raw))
	if !uuidPattern.MatchString(id) {
		return "", ErrNotFound
	}
	return OrganizationID(id), nil
}

// ParseName trims an Organization name and checks it is neither blank nor too long.
func ParseName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxNameLength {
		return "", ErrInvalidName
	}
	return name, nil
}

// Role is the role an Organization Membership carries.
type Role string

// Organization roles.
const (
	RoleOwner       Role = "owner"
	RoleContributor Role = "contributor"
)

// Visibility says who can enter a Workspace.
type Visibility string

// Workspace visibilities.
const (
	VisibilityOpen       Visibility = "open"
	VisibilityRestricted Visibility = "restricted"
)

// Organization is the tenant: the outermost boundary of data and access.
type Organization struct {
	ID         OrganizationID
	Name       string
	CreatedAt  time.Time
	DeletedAt  *time.Time
	PurgeAfter *time.Time
	// ViewerRole is the role the Actor who read the Organization acts with.
	ViewerRole Role
}

// Actor is the signed-in User behind a request.
type Actor struct {
	UserID          UserID
	IsAdministrator bool
}

// CanCreateOrganization reports whether the Actor may create Organizations.
// Only Administrators can, until the Instance setting that opens it to any
// User exists.
func (a Actor) CanCreateOrganization() bool { return a.IsAdministrator }

// SeesAllOrganizations reports whether the Actor sees every Organization,
// as Administrators do (ADR 0009); others see only those they hold an
// Organization Membership in.
func (a Actor) SeesAllOrganizations() bool { return a.IsAdministrator }
