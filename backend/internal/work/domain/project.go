// Package domain holds the Work Management core domain rules: Projects,
// Statuses, Work Item Types and hierarchies (ADR 0007, ADR 0010). It depends
// on nothing outside the standard library.
package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const maxProjectNameLength = 255

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

var (
	// ErrInvalidName reports a blank or oversized Project name.
	ErrInvalidName = errors.New("name must be 1-255 characters and not blank")
	// ErrProjectNameInUse reports another Project in the same Workspace with the same name.
	ErrProjectNameInUse = errors.New("a project with this name already exists in this workspace")
	// ErrNotFound reports a Project that does not exist or that the Actor cannot see (ADR 0003).
	ErrNotFound = errors.New("project not found")
	// ErrInvalidWorkspaceRef reports a workspace_id field or query parameter that is not a UUID.
	ErrInvalidWorkspaceRef = errors.New("workspace id must be a UUID")
	// ErrWorkspaceNotFound reports a Workspace that does not exist or that the Actor cannot enter.
	ErrWorkspaceNotFound = errors.New("workspace not found")
	// ErrForbidden reports an Actor not allowed to perform the operation.
	ErrForbidden = errors.New("not allowed")
	// ErrProjectReadOnly reports a mutation on an Archived Project or Archived Workspace.
	ErrProjectReadOnly = errors.New("project or workspace is archived and read-only")
)

// ProjectID identifies a Project.
type ProjectID string

// WorkspaceID identifies the Workspace that owns a Project.
type WorkspaceID string

// OrganizationID identifies the Organization tenant (ADR 0003).
type OrganizationID string

// UserID identifies the signed-in User behind a request.
type UserID string

// Role is the effective Workspace role an Actor holds in a Project's Workspace.
type Role string

// Effective Workspace roles.
const (
	RoleOwner       Role = "owner"
	RoleContributor Role = "contributor"
	RoleViewer      Role = "viewer"
)

// CanManageProject reports whether the Actor may create, rename or customize
// Projects in the Workspace (only Workspace Owners, including Organization
// Owners and Administrators).
func (r Role) CanManageProject() bool { return r == RoleOwner }

// CanWriteWorkItems reports whether the Actor may create, edit, transition or
// delete Work Items in the Workspace (Workspace Owners and Contributors).
func (r Role) CanWriteWorkItems() bool { return r == RoleOwner || r == RoleContributor }

// Actor is the signed-in User behind a request.
type Actor struct {
	UserID          UserID
	IsAdministrator bool
}

// WorkspaceAccess describes a Workspace the Actor can enter and their effective
// role inside it.
type WorkspaceAccess struct {
	WorkspaceID               WorkspaceID
	OrganizationID            OrganizationID
	Role                      Role
	Archived                  bool
	CanRestorePendingDeletion bool
}

// Project is the central unit of planned and executed work, owned by one Workspace.
type Project struct {
	ID                ProjectID
	OrganizationID    OrganizationID
	WorkspaceID       WorkspaceID
	Name              string
	CreatedAt         time.Time
	UpdatedAt         time.Time
	ArchivedAt        *time.Time
	DeletedAt         *time.Time
	PurgeAfter        *time.Time
	WorkspaceArchived bool
	// ViewerRole is the effective role the Actor holds in the Project's Workspace.
	ViewerRole Role
}

// IsReadOnly reports whether mutations on the Project are blocked because either
// the Project itself or its owning Workspace is Archived (CONTEXT.md).
func (p Project) IsReadOnly() bool { return p.ArchivedAt != nil || p.WorkspaceArchived }

// ParseProjectID normalizes a Project ID; anything that is not a UUID names no Project.
func ParseProjectID(raw string) (ProjectID, error) {
	id := strings.ToLower(strings.TrimSpace(raw))
	if !uuidPattern.MatchString(id) {
		return "", ErrNotFound
	}
	return ProjectID(id), nil
}

// ParseWorkspaceRef normalizes a workspace_id field or query parameter and checks it is a UUID.
func ParseWorkspaceRef(raw string) (WorkspaceID, error) {
	id := strings.ToLower(strings.TrimSpace(raw))
	if !uuidPattern.MatchString(id) {
		return "", ErrInvalidWorkspaceRef
	}
	return WorkspaceID(id), nil
}

// ParseProjectName trims a Project name and checks it is neither blank nor too long.
func ParseProjectName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxProjectNameLength {
		return "", ErrInvalidName
	}
	return name, nil
}
