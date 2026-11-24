package domain

import (
	"errors"
	"strings"
	"time"
)

var (
	// ErrInvalidOrganizationRef reports an organization_id that is not a UUID.
	ErrInvalidOrganizationRef = errors.New("organization id must be a UUID")
	// ErrUnknownOrganization reports a referenced Organization that does not
	// exist or that the Actor cannot see, without telling which (ADR 0003).
	ErrUnknownOrganization = errors.New("organization not found")
	// ErrInvalidVisibility reports a visibility other than open or restricted.
	ErrInvalidVisibility = errors.New("visibility must be open or restricted")
	// ErrWorkspaceNameTaken reports a name already used in the Organization.
	ErrWorkspaceNameTaken = errors.New("workspace name already in use")
	// ErrWorkspaceNotFound reports a Workspace that does not exist or that the
	// Actor cannot enter, without telling which.
	ErrWorkspaceNotFound = errors.New("workspace not found")
)

// Workspace roles. Organization Owners act as Workspace Owner in every
// Workspace of their Organization, and a User who enters an Open Workspace
// without a Workspace Membership acts as Workspace Contributor.
const (
	WorkspaceRoleOwner       Role = "owner"
	WorkspaceRoleContributor Role = "contributor"
	WorkspaceRoleViewer      Role = "viewer"
)

// WorkspaceID identifies a Workspace.
type WorkspaceID string

// Workspace is a division inside one Organization.
type Workspace struct {
	ID             WorkspaceID
	OrganizationID OrganizationID
	Name           string
	Visibility     Visibility
	CreatedAt      time.Time
	UpdatedAt      time.Time
	// ViewerRole is the Workspace role of the User who reads it.
	ViewerRole Role
}

// ParseWorkspaceID normalizes a Workspace ID; anything that is not a UUID
// names no Workspace.
func ParseWorkspaceID(raw string) (WorkspaceID, error) {
	id := strings.ToLower(strings.TrimSpace(raw))
	if !uuidPattern.MatchString(id) {
		return "", ErrWorkspaceNotFound
	}
	return WorkspaceID(id), nil
}

// ParseOrganizationRef normalizes the Organization a request refers to.
func ParseOrganizationRef(raw string) (OrganizationID, error) {
	id, err := ParseOrganizationID(raw)
	if err != nil {
		return "", ErrInvalidOrganizationRef
	}
	return id, nil
}

// ParseVisibility reads a Workspace visibility. Every new Workspace is
// Restricted unless the request says otherwise.
func ParseVisibility(raw string) (Visibility, error) {
	if raw == "" {
		return VisibilityRestricted, nil
	}
	return ParseVisibilityChange(raw)
}

// ParseVisibilityChange reads the visibility a Workspace changes to; unlike a
// new Workspace, there is no default.
func ParseVisibilityChange(raw string) (Visibility, error) {
	switch v := Visibility(raw); v {
	case VisibilityRestricted, VisibilityOpen:
		return v, nil
	default:
		return "", ErrInvalidVisibility
	}
}

// CanCreateWorkspace reports whether this Organization role may create
// Workspaces: only Organization Owners can.
func (r Role) CanCreateWorkspace() bool { return r == RoleOwner }

// CanManageWorkspace reports whether this Workspace role may rename a
// Workspace or change its visibility: only Workspace Owners can.
func (r Role) CanManageWorkspace() bool { return r == WorkspaceRoleOwner }
