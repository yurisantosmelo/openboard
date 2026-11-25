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

// AssigneeChecker reports whether a User is active (not Deactivated) and able
// to enter the given Workspace.
type AssigneeChecker interface {
	CanBeAssigned(ctx context.Context, userID domain.UserID, workspaceID domain.WorkspaceID) (bool, error)
}

// Optional tracks an explicitly provided nullable patch field so callers can
// distinguish omitted fields from explicit null clears.
type Optional[T any] struct {
	Set   bool
	Value *T
}

// WorkItemFilter narrows a Project's Work Items list.
type WorkItemFilter struct {
	StatusID       *domain.StatusID
	WorkItemTypeID *domain.WorkItemTypeID
	Priority       *domain.Priority
	AssigneeID     *domain.UserID
	EraID          *domain.EraID
}

// NewWorkItem holds the validated fields required to persist a new Work Item.
type NewWorkItem struct {
	OrganizationID domain.OrganizationID
	ProjectID      domain.ProjectID
	WorkItemTypeID domain.WorkItemTypeID
	StatusID       domain.StatusID
	ParentID       *domain.WorkItemID
	EraID          *domain.EraID
	AssigneeID     *domain.UserID
	Title          string
	Description    string
	Priority       domain.Priority
	StoryPoints    *float64
	Hours          *float64
	CreatedBy      domain.UserID
}

// WorkItemUpdate holds the resolved next state of a Work Item after a PATCH.
type WorkItemUpdate struct {
	ID             domain.WorkItemID
	WorkItemTypeID domain.WorkItemTypeID
	ParentID       *domain.WorkItemID
	EraID          *domain.EraID
	AssigneeID     *domain.UserID
	Title          string
	Description    string
	Priority       domain.Priority
	StoryPoints    *float64
	Hours          *float64
}

// WorkItemRepository stores Work Items inside Projects.
type WorkItemRepository interface {
	Create(ctx context.Context, item NewWorkItem) (domain.WorkItem, error)
	Find(ctx context.Context, id domain.WorkItemID) (domain.WorkItem, error)
	List(ctx context.Context, projectID domain.ProjectID, filter WorkItemFilter, page PageRequest) ([]domain.WorkItem, int, error)
	Update(ctx context.Context, item WorkItemUpdate) (domain.WorkItem, error)
	UpdateStatus(ctx context.Context, id domain.WorkItemID, statusID domain.StatusID) (domain.WorkItem, error)
	Delete(ctx context.Context, id domain.WorkItemID) error
	// AncestorIDs returns the IDs of all ancestors of id (its Parent, its
	// Parent's Parent, and so on) for hierarchy cycle detection.
	AncestorIDs(ctx context.Context, id domain.WorkItemID) ([]domain.WorkItemID, error)
	// ListChildTypes returns the distinct Work Item Type IDs of direct Children
	// of parentID so changing a Work Item's type can validate existing Children.
	ListChildTypes(ctx context.Context, parentID domain.WorkItemID) ([]domain.WorkItemTypeID, error)
}
