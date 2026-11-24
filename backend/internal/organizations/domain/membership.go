package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

var (
	// ErrInvalidUsername reports a Username outside the allowed format.
	ErrInvalidUsername = errors.New("username must be 3-32 characters of a-z, 0-9, '.', '_' or '-'")
	// ErrInvalidRole reports an Organization role other than owner or contributor.
	ErrInvalidRole = errors.New("role must be owner or contributor")
	// ErrMembershipExists reports a User who already holds an Organization Membership in the Organization.
	ErrMembershipExists = errors.New("user already belongs to this organization")
	// ErrMembershipNotFound reports an Organization Membership that does not exist.
	ErrMembershipNotFound = errors.New("organization membership not found")
	// ErrLastOrganizationOwner reports an attempt to demote or remove an Organization's last Organization Owner.
	ErrLastOrganizationOwner = errors.New("an organization must keep at least one organization owner")
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9._-]{3,32}$`)

// OrganizationMembership links one User to one Organization with one role.
type OrganizationMembership struct {
	OrganizationID OrganizationID
	UserID         UserID
	Username       string
	Name           string
	Role           Role
	CreatedAt      time.Time
}

// ParseUsername normalizes a Username to lowercase and checks its format.
func ParseUsername(raw string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	if !usernamePattern.MatchString(normalized) {
		return "", ErrInvalidUsername
	}
	return normalized, nil
}

// ParseMemberUserID normalizes a User ID path parameter; anything that is not
// a UUID names no Organization Membership.
func ParseMemberUserID(raw string) (UserID, error) {
	id, err := ParseUserID(raw)
	if err != nil {
		return "", ErrMembershipNotFound
	}
	return id, nil
}

// ParseOrganizationRole reads an Organization Membership role. An empty value
// defaults to Organization Contributor.
func ParseOrganizationRole(raw string) (Role, error) {
	if raw == "" {
		return RoleContributor, nil
	}
	return ParseOrganizationRoleChange(raw)
}

// ParseOrganizationRoleChange reads the role an Organization Membership changes
// to; unlike adding a new one, there is no default.
func ParseOrganizationRoleChange(raw string) (Role, error) {
	switch r := Role(raw); r {
	case RoleOwner, RoleContributor:
		return r, nil
	default:
		return "", ErrInvalidRole
	}
}

// CanManageOrganization reports whether this Organization role may manage the
// Organization, including its Organization Memberships.
func (r Role) CanManageOrganization() bool { return r == RoleOwner }
