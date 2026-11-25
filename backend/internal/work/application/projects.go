package application

import (
	"context"
	"errors"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// CreateProjectInput is the raw request to create a Project.
type CreateProjectInput struct {
	WorkspaceID string
	Name        string
}

// UpdateProjectInput is the raw request to rename a Project; nil Name leaves it as is.
type UpdateProjectInput struct {
	ID   string
	Name *string
}

// ProjectMover moves a Project to another Workspace in the same Organization,
// removing its Project Teams while preserving all Project content (CONTEXT.md).
type ProjectMover interface {
	Move(ctx context.Context, id domain.ProjectID, targetWorkspaceID domain.WorkspaceID) (domain.Project, error)
}

const defaultDeletionGracePeriod = 30 * 24 * time.Hour

// Service runs the Work Management use cases.
type Service struct {
	projects    ProjectRepository
	mover       ProjectMover
	lifecycle   ProjectLifecycleRepository
	workspaces  WorkspaceAccessChecker
	gracePeriod time.Duration
	now         func() time.Time
}

// NewService builds a Service from its dependencies.
func NewService(projects ProjectRepository, workspaces WorkspaceAccessChecker) *Service {
	mover, _ := projects.(ProjectMover)
	lc, _ := projects.(ProjectLifecycleRepository)
	return &Service{
		projects:    projects,
		mover:       mover,
		lifecycle:   lc,
		workspaces:  workspaces,
		gracePeriod: defaultDeletionGracePeriod,
		now:         time.Now,
	}
}

// WithProjectMover configures a ProjectMover when separate from ProjectRepository.
func (s *Service) WithProjectMover(m ProjectMover) *Service {
	s.mover = m
	return s
}

// WithProjectLifecycle configures a ProjectLifecycleRepository when separate from ProjectRepository.
func (s *Service) WithProjectLifecycle(lc ProjectLifecycleRepository) *Service {
	s.lifecycle = lc
	return s
}

// WithDeletionGracePeriod configures the Pending Deletion grace period.
func (s *Service) WithDeletionGracePeriod(d time.Duration) *Service {
	if d > 0 {
		s.gracePeriod = d
	}
	return s
}

// CreateProject creates a Project inside a Workspace the Actor manages, seeded
// with the default Statuses, Work Item Types and hierarchy (ADR 0010).
// Invalid fields are all reported at once, joined.
func (s *Service) CreateProject(ctx context.Context, actor domain.Actor, in CreateProjectInput) (domain.Project, error) {
	wsID, wsErr := domain.ParseWorkspaceRef(in.WorkspaceID)
	name, nameErr := domain.ParseProjectName(in.Name)
	if err := errors.Join(wsErr, nameErr); err != nil {
		return domain.Project{}, err
	}
	access, err := s.workspaces.Access(ctx, actor, wsID)
	if err != nil {
		return domain.Project{}, err
	}
	if !access.Role.CanManageProject() {
		return domain.Project{}, domain.ErrForbidden
	}
	if access.Archived {
		return domain.Project{}, domain.ErrProjectReadOnly
	}
	project, err := s.projects.Create(ctx, NewProject{
		OrganizationID: access.OrganizationID,
		WorkspaceID:    access.WorkspaceID,
		Name:           name,
		Statuses:       domain.DefaultStatuses(),
		WorkItemTypes:  domain.DefaultWorkItemTypes(),
		Hierarchy:      domain.DefaultHierarchy(),
	})
	if err != nil {
		return domain.Project{}, err
	}
	project.ViewerRole = access.Role
	project.WorkspaceArchived = access.Archived
	return project, nil
}

// ListProjects returns one page of Projects inside a Workspace the Actor can
// enter, and the total count.
func (s *Service) ListProjects(ctx context.Context, actor domain.Actor, rawWorkspaceID string, page PageRequest) ([]domain.Project, int, error) {
	wsID, err := domain.ParseWorkspaceRef(rawWorkspaceID)
	if err != nil {
		return nil, 0, err
	}
	access, err := s.workspaces.Access(ctx, actor, wsID)
	if err != nil {
		return nil, 0, err
	}
	items, total, err := s.projects.ListByWorkspace(ctx, access.WorkspaceID, page)
	if err != nil {
		return nil, 0, err
	}
	for i := range items {
		items[i].ViewerRole = access.Role
		items[i].WorkspaceArchived = access.Archived
	}
	return items, total, nil
}

// GetProject returns a Project the Actor can see via its Workspace, or
// domain.ErrNotFound without leaking existence (ADR 0003).
func (s *Service) GetProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	return s.projectWithAccess(ctx, actor, rawProjectID)
}

// UpdateProject renames a Project for an Actor who manages its Workspace.
func (s *Service) UpdateProject(ctx context.Context, actor domain.Actor, in UpdateProjectInput) (domain.Project, error) {
	var parsedName *string
	if in.Name != nil {
		name, err := domain.ParseProjectName(*in.Name)
		if err != nil {
			return domain.Project{}, err
		}
		parsedName = &name
	}
	current, err := s.projectWithAccess(ctx, actor, in.ID)
	if err != nil {
		return domain.Project{}, err
	}
	if !current.ViewerRole.CanManageProject() {
		return domain.Project{}, domain.ErrForbidden
	}
	if current.IsReadOnly() {
		return domain.Project{}, domain.ErrProjectReadOnly
	}
	if parsedName == nil {
		return current, nil
	}
	updated, err := s.projects.Rename(ctx, current.ID, *parsedName)
	if err != nil {
		return domain.Project{}, err
	}
	updated.ViewerRole = current.ViewerRole
	return updated, nil
}

// MoveProject moves a Project to another Workspace of the same Organization,
// taking all its content and losing its Project Teams (CONTEXT.md).
func (s *Service) MoveProject(ctx context.Context, actor domain.Actor, rawProjectID, rawTargetWorkspaceID string) (domain.Project, error) {
	targetWSID, err := domain.ParseWorkspaceRef(rawTargetWorkspaceID)
	if err != nil {
		return domain.Project{}, err
	}
	current, err := s.writableOwnerProject(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	targetAccess, err := s.writableTargetWorkspace(ctx, actor, current.OrganizationID, targetWSID)
	if err != nil {
		return domain.Project{}, err
	}
	if targetAccess.WorkspaceID == current.WorkspaceID {
		return current, nil
	}
	moved, err := s.mover.Move(ctx, current.ID, targetAccess.WorkspaceID)
	if err != nil {
		return domain.Project{}, err
	}
	moved.ViewerRole = targetAccess.Role
	return moved, nil
}

func (s *Service) writableOwnerProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	current, err := s.projectWithAccess(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	if !current.ViewerRole.CanManageProject() {
		return domain.Project{}, domain.ErrForbidden
	}
	if current.IsReadOnly() {
		return domain.Project{}, domain.ErrProjectReadOnly
	}
	return current, nil
}

func (s *Service) writableTargetWorkspace(
	ctx context.Context,
	actor domain.Actor,
	orgID domain.OrganizationID,
	targetWSID domain.WorkspaceID,
) (domain.WorkspaceAccess, error) {
	targetAccess, err := s.workspaces.Access(ctx, actor, targetWSID)
	if err != nil {
		return domain.WorkspaceAccess{}, err
	}
	if targetAccess.OrganizationID != orgID {
		return domain.WorkspaceAccess{}, domain.ErrCrossOrganizationMove
	}
	if !targetAccess.Role.CanManageProject() {
		return domain.WorkspaceAccess{}, domain.ErrForbidden
	}
	if targetAccess.Archived {
		return domain.WorkspaceAccess{}, domain.ErrProjectReadOnly
	}
	return targetAccess, nil
}

// ListStatuses returns the Statuses of a Project the Actor can see.
func (s *Service) ListStatuses(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.Status, error) {
	project, err := s.projectWithAccess(ctx, actor, rawProjectID)
	if err != nil {
		return nil, err
	}
	return s.projects.ListStatuses(ctx, project.ID)
}

// ListWorkItemTypes returns the Work Item Types (with hierarchy) of a Project
// the Actor can see.
func (s *Service) ListWorkItemTypes(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.WorkItemType, error) {
	project, err := s.projectWithAccess(ctx, actor, rawProjectID)
	if err != nil {
		return nil, err
	}
	return s.projects.ListWorkItemTypes(ctx, project.ID)
}

func (s *Service) projectWithAccess(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	projectID, err := domain.ParseProjectID(rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	project, err := s.projects.Find(ctx, projectID)
	if err != nil {
		return domain.Project{}, err
	}
	access, err := s.workspaces.Access(ctx, actor, project.WorkspaceID)
	if errors.Is(err, domain.ErrWorkspaceNotFound) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, err
	}
	project.ViewerRole = access.Role
	project.WorkspaceArchived = access.Archived
	return project, nil
}
