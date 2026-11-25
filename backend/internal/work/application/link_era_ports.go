package application

import (
	"context"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// EraReader resolves one Era inside a Project so WorkItemService can validate
// era_id assignments without coupling to Era mutations.
type EraReader interface {
	Find(ctx context.Context, projectID domain.ProjectID, id domain.EraID) (domain.Era, error)
}

// LinkRepository stores non-hierarchical Links between Work Items in one Project.
type LinkRepository interface {
	ListForWorkItem(ctx context.Context, workItemID domain.WorkItemID) ([]domain.Link, error)
	Create(ctx context.Context, projectID domain.ProjectID, source, target domain.WorkItemID, kind domain.LinkKind) (domain.Link, error)
	Delete(ctx context.Context, projectID domain.ProjectID, workItemID domain.WorkItemID, linkID domain.LinkID) error
}

// NewEra holds validated fields to create a Planned Era inside a Project.
type NewEra struct {
	ProjectID domain.ProjectID
	Name      string
	Goal      string
	StartDate time.Time
	EndDate   time.Time
}

// EraUpdate holds resolved fields to update a Planned or Active Era.
type EraUpdate struct {
	ProjectID domain.ProjectID
	ID        domain.EraID
	Name      string
	Goal      string
	StartDate time.Time
	EndDate   time.Time
}

// EraRepository persists Project Eras and their lifecycle transitions.
type EraRepository interface {
	EraReader
	List(ctx context.Context, projectID domain.ProjectID) ([]domain.Era, error)
	Create(ctx context.Context, in NewEra) (domain.Era, error)
	Update(ctx context.Context, in EraUpdate) (domain.Era, error)
	Start(ctx context.Context, projectID domain.ProjectID, id domain.EraID) (domain.Era, error)
	// Close marks an Active Era Completed at `at` and moves all unfinished Work
	// Items (Status Group <> completed) to nextEraID (or NULL) without changing
	// any Work Item's Status.
	Close(ctx context.Context, projectID domain.ProjectID, id domain.EraID, nextEraID *domain.EraID, at time.Time) (domain.Era, error)
	Delete(ctx context.Context, projectID domain.ProjectID, id domain.EraID) error
}
