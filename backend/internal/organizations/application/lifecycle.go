package application

import (
	"context"
	"time"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

// OrganizationLifecycleRepository handles Pending Deletion and restoration of Organizations.
type OrganizationLifecycleRepository interface {
	MarkPendingDeletion(ctx context.Context, id domain.OrganizationID, purgeAfter time.Time) error
	Restore(ctx context.Context, id domain.OrganizationID) (domain.Organization, error)
	ListPendingDeletion(ctx context.Context, page PageRequest) ([]domain.Organization, int, error)
	PurgeExpired(ctx context.Context) error
}

// WorkspaceLifecycleRepository handles Archiving, Pending Deletion and restoration of Workspaces.
type WorkspaceLifecycleRepository interface {
	ListFiltered(ctx context.Context, id domain.OrganizationID, scope Scope, includeArchived bool, page PageRequest) ([]domain.Workspace, int, error)
	Archive(ctx context.Context, id domain.WorkspaceID) (domain.Workspace, error)
	Unarchive(ctx context.Context, id domain.WorkspaceID) (domain.Workspace, error)
	MarkPendingDeletion(ctx context.Context, id domain.WorkspaceID, purgeAfter time.Time) error
	FindPendingDeletion(ctx context.Context, id domain.WorkspaceID) (domain.Workspace, error)
	Restore(ctx context.Context, id domain.WorkspaceID) (domain.Workspace, error)
	ListPendingDeletion(ctx context.Context, id domain.OrganizationID, page PageRequest) ([]domain.Workspace, int, error)
	PurgeExpired(ctx context.Context) error
}

// DeleteOrganization places an Organization into Pending Deletion for an
// Organization Owner (including Administrators).
func (s *Service) DeleteOrganization(ctx context.Context, actor domain.Actor, rawID string) error {
	id, err := domain.ParseOrganizationID(rawID)
	if err != nil {
		return err
	}
	org, err := s.organizations.Find(ctx, id, scopeOf(actor))
	if err != nil {
		return err
	}
	if org.ViewerRole != domain.RoleOwner {
		return domain.ErrForbidden
	}
	return s.lifecycle.MarkPendingDeletion(ctx, org.ID, s.now().UTC().Add(s.gracePeriod))
}

// RestoreOrganization restores a Pending Deletion Organization within its grace
// period. Only an Administrator can restore a whole Organization (CONTEXT.md).
func (s *Service) RestoreOrganization(ctx context.Context, actor domain.Actor, rawID string) (domain.Organization, error) {
	if !actor.IsAdministrator {
		return domain.Organization{}, domain.ErrForbidden
	}
	id, err := domain.ParseOrganizationID(rawID)
	if err != nil {
		return domain.Organization{}, err
	}
	org, err := s.lifecycle.Restore(ctx, id)
	if err != nil {
		return domain.Organization{}, err
	}
	org.ViewerRole = domain.RoleOwner
	return org, nil
}

// ListPendingDeletionOrganizations returns Pending Deletion Organizations for Administrators.
func (s *Service) ListPendingDeletionOrganizations(ctx context.Context, actor domain.Actor, page PageRequest) ([]domain.Organization, int, error) {
	if !actor.IsAdministrator {
		return nil, 0, domain.ErrForbidden
	}
	orgs, total, err := s.lifecycle.ListPendingDeletion(ctx, page)
	if err != nil {
		return nil, 0, err
	}
	for i := range orgs {
		orgs[i].ViewerRole = domain.RoleOwner
	}
	return orgs, total, nil
}

// ListWorkspacesFiltered returns Workspaces the Actor can enter, optionally including Archived ones.
func (s *WorkspaceService) ListWorkspacesFiltered(
	ctx context.Context,
	actor domain.Actor,
	rawOrganizationID string,
	includeArchived bool,
	page PageRequest,
) ([]domain.Workspace, int, error) {
	if !includeArchived || s.lifecycle == nil {
		return s.ListWorkspaces(ctx, actor, rawOrganizationID, page)
	}
	organizationID, err := domain.ParseOrganizationRef(rawOrganizationID)
	if err != nil {
		return nil, 0, err
	}
	scope := scopeOf(actor)
	if _, err := s.workspaces.RoleIn(ctx, organizationID, scope); err != nil {
		return nil, 0, err
	}
	return s.lifecycle.ListFiltered(ctx, organizationID, scope, true, page)
}

// ListPendingDeletionWorkspaces returns Pending Deletion Workspaces in an
// Organization for its Organization Owners (including Administrators).
func (s *WorkspaceService) ListPendingDeletionWorkspaces(
	ctx context.Context,
	actor domain.Actor,
	rawOrganizationID string,
	page PageRequest,
) ([]domain.Workspace, int, error) {
	organizationID, err := domain.ParseOrganizationRef(rawOrganizationID)
	if err != nil {
		return nil, 0, err
	}
	role, err := s.workspaces.RoleIn(ctx, organizationID, scopeOf(actor))
	if err != nil {
		return nil, 0, err
	}
	if role != domain.RoleOwner {
		return nil, 0, domain.ErrForbidden
	}
	items, total, err := s.lifecycle.ListPendingDeletion(ctx, organizationID, page)
	if err != nil {
		return nil, 0, err
	}
	for i := range items {
		items[i].ViewerRole = domain.WorkspaceRoleOwner
	}
	return items, total, nil
}

// ArchiveWorkspace archives a Workspace (making it and all its Projects read-only),
// rejecting archiving the Organization's last active Workspace (CONTEXT.md).
func (s *WorkspaceService) ArchiveWorkspace(ctx context.Context, actor domain.Actor, rawID string) (domain.Workspace, error) {
	id, err := domain.ParseWorkspaceID(rawID)
	if err != nil {
		return domain.Workspace{}, err
	}
	current, err := s.workspaces.Find(ctx, id, scopeOf(actor))
	if err != nil {
		return domain.Workspace{}, err
	}
	if !current.ViewerRole.CanManageWorkspace() {
		return domain.Workspace{}, domain.ErrForbidden
	}
	if current.IsArchived() {
		return current, nil
	}
	updated, err := s.lifecycle.Archive(ctx, current.ID)
	if err != nil {
		return domain.Workspace{}, err
	}
	updated.ViewerRole = current.ViewerRole
	return updated, nil
}

// UnarchiveWorkspace restores an Archived Workspace and brings its Projects back.
func (s *WorkspaceService) UnarchiveWorkspace(ctx context.Context, actor domain.Actor, rawID string) (domain.Workspace, error) {
	id, err := domain.ParseWorkspaceID(rawID)
	if err != nil {
		return domain.Workspace{}, err
	}
	current, err := s.workspaces.Find(ctx, id, scopeOf(actor))
	if err != nil {
		return domain.Workspace{}, err
	}
	if !current.ViewerRole.CanManageWorkspace() {
		return domain.Workspace{}, domain.ErrForbidden
	}
	if !current.IsArchived() {
		return current, nil
	}
	updated, err := s.lifecycle.Unarchive(ctx, current.ID)
	if err != nil {
		return domain.Workspace{}, err
	}
	updated.ViewerRole = current.ViewerRole
	return updated, nil
}

// DeleteWorkspace places a Workspace into Pending Deletion without requiring it
// to be Archived first, rejecting deleting the Organization's last active Workspace.
func (s *WorkspaceService) DeleteWorkspace(ctx context.Context, actor domain.Actor, rawID string) error {
	id, err := domain.ParseWorkspaceID(rawID)
	if err != nil {
		return err
	}
	current, err := s.workspaces.Find(ctx, id, scopeOf(actor))
	if err != nil {
		return err
	}
	if !current.ViewerRole.CanManageWorkspace() {
		return domain.ErrForbidden
	}
	return s.lifecycle.MarkPendingDeletion(ctx, current.ID, s.now().UTC().Add(s.gracePeriod))
}

// RestoreWorkspace restores a Pending Deletion Workspace within its grace period.
// Only an Organization Owner (or Administrator) can restore Pending Deletion resources.
func (s *WorkspaceService) RestoreWorkspace(ctx context.Context, actor domain.Actor, rawID string) (domain.Workspace, error) {
	id, err := domain.ParseWorkspaceID(rawID)
	if err != nil {
		return domain.Workspace{}, err
	}
	pending, err := s.lifecycle.FindPendingDeletion(ctx, id)
	if err != nil {
		return domain.Workspace{}, err
	}
	role, err := s.workspaces.RoleIn(ctx, pending.OrganizationID, scopeOf(actor))
	if err != nil {
		return domain.Workspace{}, domain.ErrWorkspaceNotFound
	}
	if role != domain.RoleOwner {
		return domain.Workspace{}, domain.ErrForbidden
	}
	restored, err := s.lifecycle.Restore(ctx, pending.ID)
	if err != nil {
		return domain.Workspace{}, err
	}
	restored.ViewerRole = domain.WorkspaceRoleOwner
	return restored, nil
}
