package application

import (
	"context"
	"errors"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// NewView holds validated fields to create a Personal View inside a Project.
type NewView struct {
	ProjectID domain.ProjectID
	Name      string
	Layout    domain.ViewLayout
	Filters   domain.ViewFilters
	CreatedBy domain.UserID
}

// ViewUpdate holds resolved fields to update a saved View.
type ViewUpdate struct {
	ProjectID  domain.ProjectID
	ID         domain.ViewID
	Name       string
	Layout     domain.ViewLayout
	Visibility domain.ViewVisibility
	Filters    domain.ViewFilters
}

// ViewRepository persists saved Views scoped to one Project.
type ViewRepository interface {
	ListVisible(ctx context.Context, projectID domain.ProjectID, viewerID domain.UserID) ([]domain.View, error)
	Find(ctx context.Context, projectID domain.ProjectID, id domain.ViewID) (domain.View, error)
	Create(ctx context.Context, in NewView) (domain.View, error)
	Update(ctx context.Context, in ViewUpdate) (domain.View, error)
	Delete(ctx context.Context, projectID domain.ProjectID, id domain.ViewID) error
}

// CreateViewInput is the raw request to create a Personal View in a Project.
type CreateViewInput struct {
	ProjectID string
	Name      string
	Layout    string
	Filters   domain.ViewFilters
}

// UpdateViewInput is the raw request to update a View's name, layout, visibility or filters.
type UpdateViewInput struct {
	ProjectID  string
	ViewID     string
	Name       *string
	Layout     *string
	Visibility *string
	Filters    *domain.ViewFilters
}

// ViewService runs saved View use cases (Personal View and Shared View).
type ViewService struct {
	projects   ProjectRepository
	views      ViewRepository
	workspaces WorkspaceAccessChecker
}

// NewViewService builds a ViewService from its dependencies.
func NewViewService(
	projects ProjectRepository,
	views ViewRepository,
	workspaces WorkspaceAccessChecker,
) *ViewService {
	return &ViewService{projects: projects, views: views, workspaces: workspaces}
}

// ListViews returns all Shared Views of a Project plus the Actor's own Personal Views.
func (s *ViewService) ListViews(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.View, error) {
	project, _, err := s.projectAccess(ctx, actor, rawProjectID)
	if err != nil {
		return nil, err
	}
	return s.views.ListVisible(ctx, project.ID, actor.UserID)
}

// GetView returns one visible View inside a Project.
func (s *ViewService) GetView(ctx context.Context, actor domain.Actor, rawProjectID, rawViewID string) (domain.View, error) {
	project, _, err := s.projectAccess(ctx, actor, rawProjectID)
	if err != nil {
		return domain.View{}, err
	}
	viewID, err := domain.ParseViewID(rawViewID)
	if err != nil {
		return domain.View{}, err
	}
	view, err := s.views.Find(ctx, project.ID, viewID)
	if err != nil {
		return domain.View{}, err
	}
	if !domain.CanSeeView(view, actor) {
		return domain.View{}, domain.ErrViewNotFound
	}
	return view, nil
}

// CreateView creates a new Personal View for the Actor (CONTEXT.md: every View starts Personal).
func (s *ViewService) CreateView(ctx context.Context, actor domain.Actor, in CreateViewInput) (domain.View, error) {
	project, role, err := s.projectAccess(ctx, actor, in.ProjectID)
	if err != nil {
		return domain.View{}, err
	}
	if !role.CanWriteWorkItems() {
		return domain.View{}, domain.ErrForbidden
	}
	name, nameErr := domain.ParseViewName(in.Name)
	layout, layoutErr := domain.ParseViewLayout(in.Layout)
	filters, filterErr := domain.ParseViewFilters(in.Filters)
	if err := errors.Join(nameErr, layoutErr, filterErr); err != nil {
		return domain.View{}, err
	}
	return s.views.Create(ctx, NewView{
		ProjectID: project.ID,
		Name:      name,
		Layout:    layout,
		Filters:   filters,
		CreatedBy: actor.UserID,
	})
}

// UpdateView edits a View's name, layout, visibility or filters.
func (s *ViewService) UpdateView(ctx context.Context, actor domain.Actor, in UpdateViewInput) (domain.View, error) {
	project, role, view, err := s.editableView(ctx, actor, in.ProjectID, in.ViewID)
	if err != nil {
		return domain.View{}, err
	}
	_ = role
	update, err := resolveViewUpdate(project.ID, view, actor, in)
	if err != nil {
		return domain.View{}, err
	}
	return s.views.Update(ctx, update)
}

// DeleteView permanently removes a View when permitted.
func (s *ViewService) DeleteView(ctx context.Context, actor domain.Actor, rawProjectID, rawViewID string) error {
	project, _, view, err := s.editableView(ctx, actor, rawProjectID, rawViewID)
	if err != nil {
		return err
	}
	return s.views.Delete(ctx, project.ID, view.ID)
}

func resolveViewUpdate(projectID domain.ProjectID, current domain.View, actor domain.Actor, in UpdateViewInput) (ViewUpdate, error) {
	name, nameErr := resolveViewName(current.Name, in.Name)
	layout, layoutErr := resolveViewLayout(current.Layout, in.Layout)
	visibility, visErr := resolveViewVisibility(current.Visibility, in.Visibility)
	filters, filterErr := resolveViewFilters(current.Filters, in.Filters)
	if err := errors.Join(nameErr, layoutErr, visErr, filterErr); err != nil {
		return ViewUpdate{}, err
	}
	if !domain.CanSetViewVisibility(current, actor, visibility) {
		return ViewUpdate{}, domain.ErrForbidden
	}
	return ViewUpdate{
		ProjectID:  projectID,
		ID:         current.ID,
		Name:       name,
		Layout:     layout,
		Visibility: visibility,
		Filters:    filters,
	}, nil
}

func resolveViewName(current string, raw *string) (string, error) {
	if raw == nil {
		return current, nil
	}
	return domain.ParseViewName(*raw)
}

func resolveViewLayout(current domain.ViewLayout, raw *string) (domain.ViewLayout, error) {
	if raw == nil {
		return current, nil
	}
	return domain.ParseViewLayout(*raw)
}

func resolveViewVisibility(current domain.ViewVisibility, raw *string) (domain.ViewVisibility, error) {
	if raw == nil {
		return current, nil
	}
	return domain.ParseViewVisibility(*raw)
}

func resolveViewFilters(current domain.ViewFilters, raw *domain.ViewFilters) (domain.ViewFilters, error) {
	if raw == nil {
		return current, nil
	}
	return domain.ParseViewFilters(*raw)
}

func (s *ViewService) editableView(
	ctx context.Context,
	actor domain.Actor,
	rawProjectID, rawViewID string,
) (domain.Project, domain.Role, domain.View, error) {
	project, role, err := s.projectAccess(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Project{}, "", domain.View{}, err
	}
	viewID, err := domain.ParseViewID(rawViewID)
	if err != nil {
		return domain.Project{}, "", domain.View{}, err
	}
	view, err := s.views.Find(ctx, project.ID, viewID)
	if err != nil {
		return domain.Project{}, "", domain.View{}, err
	}
	if !domain.CanSeeView(view, actor) {
		return domain.Project{}, "", domain.View{}, domain.ErrViewNotFound
	}
	if !domain.CanEditView(view, actor, role) {
		return domain.Project{}, "", domain.View{}, domain.ErrForbidden
	}
	return project, role, view, nil
}

func (s *ViewService) projectAccess(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, domain.Role, error) {
	id, err := domain.ParseProjectID(rawProjectID)
	if err != nil {
		return domain.Project{}, "", err
	}
	project, err := s.projects.Find(ctx, id)
	if err != nil {
		return domain.Project{}, "", err
	}
	access, err := s.workspaces.Access(ctx, actor, project.WorkspaceID)
	if errors.Is(err, domain.ErrWorkspaceNotFound) {
		return domain.Project{}, "", domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, "", err
	}
	return project, access.Role, nil
}
