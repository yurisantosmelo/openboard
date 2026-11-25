// Package application implements the Work Management use cases: creating,
// reading, listing and renaming Projects, and reading each Project's Statuses
// and Work Item Types. Storage and Workspace access checks are injected through
// ports so this package never imports another module.
package application

import (
	"context"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// PageRequest selects one page from a collection.
type PageRequest struct {
	Limit  int
	Offset int
}

// WorkspaceAccessChecker resolves whether an Actor may enter a Workspace and
// their effective role inside it, returning domain.ErrWorkspaceNotFound when
// absent or inaccessible.
type WorkspaceAccessChecker interface {
	Access(ctx context.Context, actor domain.Actor, workspaceID domain.WorkspaceID) (domain.WorkspaceAccess, error)
}

// NewProject holds what is needed to create a Project with its initial workflow
// atomically.
type NewProject struct {
	OrganizationID domain.OrganizationID
	WorkspaceID    domain.WorkspaceID
	Name           string
	Statuses       []domain.StatusSpec
	WorkItemTypes  []domain.WorkItemTypeSpec
	Hierarchy      []domain.HierarchyRule
}

// ProjectRepository stores Projects and their workflow configuration.
type ProjectRepository interface {
	// Create inserts the Project and seeds its initial Statuses, Work Item Types
	// and hierarchy atomically. It returns domain.ErrProjectNameInUse when the
	// Workspace already has a Project with the same name ignoring case.
	Create(ctx context.Context, project NewProject) (domain.Project, error)
	// Find returns the Project with id, or domain.ErrNotFound.
	Find(ctx context.Context, id domain.ProjectID) (domain.Project, error)
	// ListByWorkspace returns one page of Projects in workspaceID, ordered by
	// name ignoring case and ID, and the total count.
	ListByWorkspace(ctx context.Context, workspaceID domain.WorkspaceID, page PageRequest) ([]domain.Project, int, error)
	// Rename changes the Project's name, returning domain.ErrProjectNameInUse on
	// duplicate names in the same Workspace and domain.ErrNotFound when absent.
	Rename(ctx context.Context, id domain.ProjectID, name string) (domain.Project, error)
	// ListStatuses returns the Project's Statuses ordered by position.
	ListStatuses(ctx context.Context, projectID domain.ProjectID) ([]domain.Status, error)
	// ListWorkItemTypes returns the Project's Work Item Types ordered by
	// position, each carrying its allowed Child Work Item Type IDs.
	ListWorkItemTypes(ctx context.Context, projectID domain.ProjectID) ([]domain.WorkItemType, error)
}
