package domain

import (
	"errors"
	"time"
)

var (
	// ErrInvalidWorkspaceRole reports a Workspace role other than owner, contributor or viewer.
	ErrInvalidWorkspaceRole = errors.New("role must be owner, contributor or viewer")
	// ErrWorkspaceMembershipExists reports a User who already holds a Workspace Membership in the Workspace.
	ErrWorkspaceMembershipExists = errors.New("user already belongs to this workspace")
	// ErrWorkspaceMembershipNotFound reports a Workspace Membership that does not exist.
	ErrWorkspaceMembershipNotFound = errors.New("workspace membership not found")
	// ErrOrganizationMemberNotFound reports a User who holds no Organization Membership in the Workspace's Organization.
	ErrOrganizationMemberNotFound = errors.New("user does not belong to this organization")
)

// WorkspaceMembership links one User to one Workspace with one role.
type WorkspaceMembership struct {
	WorkspaceID    WorkspaceID
	OrganizationID OrganizationID
	UserID         UserID
	Username       string
	Name           string
	Role           Role
	CreatedAt      time.Time
}

// ParseWorkspaceMemberUserID normalizes a User ID path parameter; anything that
// is not a UUID names no Workspace Membership.
func ParseWorkspaceMemberUserID(raw string) (UserID, error) {
	id, err := ParseUserID(raw)
	if err != nil {
		return "", ErrWorkspaceMembershipNotFound
	}
	return id, nil
}

// ParseWorkspaceRole reads a Workspace Membership role. An empty value defaults
// to Workspace Contributor.
func ParseWorkspaceRole(raw string) (Role, error) {
	if raw == "" {
		return WorkspaceRoleContributor, nil
	}
	return ParseWorkspaceRoleChange(raw)
}

// ParseWorkspaceRoleChange reads the role a Workspace Membership changes to;
// unlike adding a new one, there is no default.
func ParseWorkspaceRoleChange(raw string) (Role, error) {
	switch r := Role(raw); r {
	case WorkspaceRoleOwner, WorkspaceRoleContributor, WorkspaceRoleViewer:
		return r, nil
	default:
		return "", ErrInvalidWorkspaceRole
	}
}
