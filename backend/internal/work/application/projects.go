package application

import (
	"context"
	"errors"

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

// Service runs the Work Management use cases.
type Service struct {
	projects   ProjectRepository
	mover      ProjectMover
	workspaces WorkspaceAccessChecker
}

// NewService builds a Service from its dependencies.
func NewService(projects ProjectRepository, workspaces WorkspaceAccessChecker) *Service {
	mover, _ := projects.(ProjectMover)
	return &Service{projects: projects, mover: mover, workspaces: workspaces}
}

// WithProjectMover configures a ProjectMover when separate from ProjectRepository.
func (s *Service) WithProjectMover(m ProjectMover) *Service {
	s.mover = m
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
	current, err := s.projectWithAccess(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	if !current.ViewerRole.CanManageProject() {
		return domain.Project{}, domain.ErrForbidden
	}
	targetAccess, err := s.workspaces.Access(ctx, actor, targetWSID)
	if err != nil {
		return domain.Project{}, err
	}
	if targetAccess.OrganizationID != current.OrganizationID {
		return domain.Project{}, domain.ErrCrossOrganizationMove
	}
	if !targetAccess.Role.CanManageProject() {
		return domain.Project{}, domain.ErrForbidden
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
	return project, nil
}
