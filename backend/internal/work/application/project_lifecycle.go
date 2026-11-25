package application

import (
	"context"
	"errors"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// ProjectLifecycleRepository handles Archiving, Pending Deletion and restoration of Projects.
type ProjectLifecycleRepository interface {
	ListByWorkspaceFiltered(ctx context.Context, workspaceID domain.WorkspaceID, includeArchived bool, page PageRequest) ([]domain.Project, int, error)
	ListPendingDeletionByWorkspace(ctx context.Context, workspaceID domain.WorkspaceID, page PageRequest) ([]domain.Project, int, error)
	Archive(ctx context.Context, id domain.ProjectID) (domain.Project, error)
	Unarchive(ctx context.Context, id domain.ProjectID) (domain.Project, error)
	MarkPendingDeletion(ctx context.Context, id domain.ProjectID, purgeAfter time.Time) error
	FindPendingDeletion(ctx context.Context, id domain.ProjectID) (domain.Project, error)
	Restore(ctx context.Context, id domain.ProjectID) (domain.Project, error)
	PurgeExpired(ctx context.Context) error
}

// ListProjectsFiltered returns Projects inside a Workspace, optionally including Archived ones.
func (s *Service) ListProjectsFiltered(
	ctx context.Context,
	actor domain.Actor,
	rawWorkspaceID string,
	includeArchived bool,
	page PageRequest,
) ([]domain.Project, int, error) {
	if !includeArchived || s.lifecycle == nil {
		return s.ListProjects(ctx, actor, rawWorkspaceID, page)
	}
	wsID, err := domain.ParseWorkspaceRef(rawWorkspaceID)
	if err != nil {
		return nil, 0, err
	}
	access, err := s.workspaces.Access(ctx, actor, wsID)
	if err != nil {
		return nil, 0, err
	}
	items, total, err := s.lifecycle.ListByWorkspaceFiltered(ctx, access.WorkspaceID, true, page)
	if err != nil {
		return nil, 0, err
	}
	for i := range items {
		items[i].ViewerRole = access.Role
		items[i].WorkspaceArchived = access.Archived
	}
	return items, total, nil
}

// ListPendingDeletionProjects returns Pending Deletion Projects in a Workspace
// for Organization Owners (including Administrators).
func (s *Service) ListPendingDeletionProjects(
	ctx context.Context,
	actor domain.Actor,
	rawWorkspaceID string,
	page PageRequest,
) ([]domain.Project, int, error) {
	wsID, err := domain.ParseWorkspaceRef(rawWorkspaceID)
	if err != nil {
		return nil, 0, err
	}
	access, err := s.workspaces.Access(ctx, actor, wsID)
	if err != nil {
		return nil, 0, err
	}
	if !access.CanRestorePendingDeletion {
		return nil, 0, domain.ErrForbidden
	}
	items, total, err := s.lifecycle.ListPendingDeletionByWorkspace(ctx, access.WorkspaceID, page)
	if err != nil {
		return nil, 0, err
	}
	for i := range items {
		items[i].ViewerRole = access.Role
		items[i].WorkspaceArchived = access.Archived
	}
	return items, total, nil
}

// ArchiveProject archives a Project (hidden from default lists and read-only).
func (s *Service) ArchiveProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	current, err := s.projectWithAccess(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	if !current.ViewerRole.CanManageProject() {
		return domain.Project{}, domain.ErrForbidden
	}
	if current.ArchivedAt != nil {
		return current, nil
	}
	updated, err := s.lifecycle.Archive(ctx, current.ID)
	if err != nil {
		return domain.Project{}, err
	}
	updated.ViewerRole = current.ViewerRole
	updated.WorkspaceArchived = current.WorkspaceArchived
	return updated, nil
}

// UnarchiveProject restores an Archived Project intact.
func (s *Service) UnarchiveProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	current, err := s.projectWithAccess(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	if !current.ViewerRole.CanManageProject() {
		return domain.Project{}, domain.ErrForbidden
	}
	if current.ArchivedAt == nil {
		return current, nil
	}
	updated, err := s.lifecycle.Unarchive(ctx, current.ID)
	if err != nil {
		return domain.Project{}, err
	}
	updated.ViewerRole = current.ViewerRole
	updated.WorkspaceArchived = current.WorkspaceArchived
	return updated, nil
}

// DeleteProject places a Project into Pending Deletion without requiring it to
// be Archived first (CONTEXT.md).
func (s *Service) DeleteProject(ctx context.Context, actor domain.Actor, rawProjectID string) error {
	current, err := s.projectWithAccess(ctx, actor, rawProjectID)
	if err != nil {
		return err
	}
	if !current.ViewerRole.CanManageProject() {
		return domain.ErrForbidden
	}
	return s.lifecycle.MarkPendingDeletion(ctx, current.ID, s.now().UTC().Add(s.gracePeriod))
}

// RestoreProject restores a Pending Deletion Project within its grace period.
// Only an Organization Owner (or Administrator) can restore Pending Deletion resources.
func (s *Service) RestoreProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	projectID, err := domain.ParseProjectID(rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	pending, err := s.lifecycle.FindPendingDeletion(ctx, projectID)
	if err != nil {
		return domain.Project{}, err
	}
	access, err := s.workspaces.Access(ctx, actor, pending.WorkspaceID)
	if errors.Is(err, domain.ErrWorkspaceNotFound) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, err
	}
	if !access.CanRestorePendingDeletion {
		return domain.Project{}, domain.ErrForbidden
	}
	restored, err := s.lifecycle.Restore(ctx, pending.ID)
	if err != nil {
		return domain.Project{}, err
	}
	restored.ViewerRole = access.Role
	restored.WorkspaceArchived = access.Archived
	return restored, nil
}
