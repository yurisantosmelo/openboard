package application

import (
	"context"
	"errors"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

// NewWorkspaceMembership holds what is needed to store a Workspace Membership.
type NewWorkspaceMembership struct {
	WorkspaceID    domain.WorkspaceID
	OrganizationID domain.OrganizationID
	Username       string
	Role           domain.Role
}

// WorkspaceMembershipRepository stores Workspace Memberships.
type WorkspaceMembershipRepository interface {
	// FindWorkspace returns the Workspace with id if scope can enter it, or
	// domain.ErrWorkspaceNotFound.
	FindWorkspace(ctx context.Context, id domain.WorkspaceID, scope Scope) (domain.Workspace, error)
	// Create links the User with Username (who must hold an Organization
	// Membership in the Workspace's Organization) to the Workspace. It returns
	// domain.ErrOrganizationMemberNotFound when no such User belongs to the
	// Organization, and domain.ErrWorkspaceMembershipExists when the User
	// already belongs to the Workspace.
	Create(ctx context.Context, membership NewWorkspaceMembership) (domain.WorkspaceMembership, error)
	// List returns one page of the Workspace's Memberships, ordered by name
	// ignoring case and then by username, and how many there are in total.
	List(ctx context.Context, id domain.WorkspaceID, page PageRequest) ([]domain.WorkspaceMembership, int, error)
	// UpdateRole changes a User's role in the Workspace, returning
	// domain.ErrWorkspaceMembershipNotFound when absent.
	UpdateRole(ctx context.Context, id domain.WorkspaceID, userID domain.UserID, role domain.Role) (domain.WorkspaceMembership, error)
	// Delete removes a User's Workspace Membership, returning
	// domain.ErrWorkspaceMembershipNotFound when absent.
	Delete(ctx context.Context, id domain.WorkspaceID, userID domain.UserID) error
}

// AddWorkspaceMembershipInput is the raw request to grant a Workspace Membership.
type AddWorkspaceMembershipInput struct {
	WorkspaceID string
	Username    string
	Role        string
}

// UpdateWorkspaceMembershipInput is the raw request to change a Workspace Membership role.
type UpdateWorkspaceMembershipInput struct {
	WorkspaceID string
	UserID      string
	Role        string
}

// RemoveWorkspaceMembershipInput identifies a Workspace Membership to remove.
type RemoveWorkspaceMembershipInput struct {
	WorkspaceID string
	UserID      string
}

// WorkspaceMembershipService runs the Workspace Membership use cases.
type WorkspaceMembershipService struct {
	memberships WorkspaceMembershipRepository
}

// NewWorkspaceMembershipService builds a WorkspaceMembershipService from its repository.
func NewWorkspaceMembershipService(memberships WorkspaceMembershipRepository) *WorkspaceMembershipService {
	return &WorkspaceMembershipService{memberships: memberships}
}

// ListMemberships returns one page of a Workspace's Memberships for an Actor
// who manages the Workspace, and how many there are in total.
func (s *WorkspaceMembershipService) ListMemberships(ctx context.Context, actor domain.Actor, rawWorkspaceID string, page PageRequest) ([]domain.WorkspaceMembership, int, error) {
	wsID, err := domain.ParseWorkspaceID(rawWorkspaceID)
	if err != nil {
		return nil, 0, err
	}
	if _, err := s.requireOwner(ctx, wsID, actor); err != nil {
		return nil, 0, err
	}
	return s.memberships.List(ctx, wsID, page)
}

// AddMembership grants a Workspace Membership in a Workspace the Actor manages.
// The target User must already hold an Organization Membership in the same
// Organization. Invalid fields are reported at once, joined.
func (s *WorkspaceMembershipService) AddMembership(ctx context.Context, actor domain.Actor, in AddWorkspaceMembershipInput) (domain.WorkspaceMembership, error) {
	wsID, err := domain.ParseWorkspaceID(in.WorkspaceID)
	if err != nil {
		return domain.WorkspaceMembership{}, err
	}
	username, usernameErr := domain.ParseUsername(in.Username)
	role, roleErr := domain.ParseWorkspaceRole(in.Role)
	if err := errors.Join(usernameErr, roleErr); err != nil {
		return domain.WorkspaceMembership{}, err
	}
	ws, err := s.requireOwner(ctx, wsID, actor)
	if err != nil {
		return domain.WorkspaceMembership{}, err
	}
	return s.memberships.Create(ctx, NewWorkspaceMembership{
		WorkspaceID:    ws.ID,
		OrganizationID: ws.OrganizationID,
		Username:       username,
		Role:           role,
	})
}

// UpdateMembership changes the role of a Workspace Membership for an Actor who
// manages the Workspace.
func (s *WorkspaceMembershipService) UpdateMembership(ctx context.Context, actor domain.Actor, in UpdateWorkspaceMembershipInput) (domain.WorkspaceMembership, error) {
	wsID, err := domain.ParseWorkspaceID(in.WorkspaceID)
	if err != nil {
		return domain.WorkspaceMembership{}, err
	}
	userID, err := domain.ParseWorkspaceMemberUserID(in.UserID)
	if err != nil {
		return domain.WorkspaceMembership{}, err
	}
	role, err := domain.ParseWorkspaceRoleChange(in.Role)
	if err != nil {
		return domain.WorkspaceMembership{}, err
	}
	if _, err := s.requireOwner(ctx, wsID, actor); err != nil {
		return domain.WorkspaceMembership{}, err
	}
	return s.memberships.UpdateRole(ctx, wsID, userID, role)
}

// RemoveMembership removes a Workspace Membership. Workspace Owners (including
// Organization Owners and Administrators) may remove anyone; other Users may
// only remove their own Workspace Membership.
func (s *WorkspaceMembershipService) RemoveMembership(ctx context.Context, actor domain.Actor, in RemoveWorkspaceMembershipInput) error {
	wsID, err := domain.ParseWorkspaceID(in.WorkspaceID)
	if err != nil {
		return err
	}
	userID, err := domain.ParseWorkspaceMemberUserID(in.UserID)
	if err != nil {
		return err
	}
	ws, err := s.memberships.FindWorkspace(ctx, wsID, scopeOf(actor))
	if err != nil {
		return err
	}
	if !ws.ViewerRole.CanManageWorkspace() && actor.UserID != userID {
		return domain.ErrForbidden
	}
	return s.memberships.Delete(ctx, wsID, userID)
}

func (s *WorkspaceMembershipService) requireOwner(ctx context.Context, wsID domain.WorkspaceID, actor domain.Actor) (domain.Workspace, error) {
	ws, err := s.memberships.FindWorkspace(ctx, wsID, scopeOf(actor))
	if err != nil {
		return domain.Workspace{}, err
	}
	if !ws.ViewerRole.CanManageWorkspace() {
		return domain.Workspace{}, domain.ErrForbidden
	}
	return ws, nil
}
