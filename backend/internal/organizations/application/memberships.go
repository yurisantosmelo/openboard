package application

import (
	"context"
	"errors"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

// ProvisionedUser is a User resolved or created by the identity module.
// TemporaryPassword is set only when a new User was created.
type ProvisionedUser struct {
	ID                domain.UserID
	Username          string
	Name              string
	TemporaryPassword string
}

// UserProvisioner links an existing User or creates a new one with a
// Temporary Password.
type UserProvisioner interface {
	ProvisionUser(ctx context.Context, username, name string) (ProvisionedUser, error)
}

// NewOrganizationMembership holds what is needed to store an Organization Membership.
type NewOrganizationMembership struct {
	OrganizationID domain.OrganizationID
	UserID         domain.UserID
	Role           domain.Role
}

// OrganizationMembershipRepository stores Organization Memberships.
type OrganizationMembershipRepository interface {
	// RoleIn returns the role scope acts with in the Organization, or
	// domain.ErrNotFound when scope does not see it.
	RoleIn(ctx context.Context, id domain.OrganizationID, scope Scope) (domain.Role, error)
	// Create stores the Organization Membership and returns it with the linked
	// User's Username and Name. It returns domain.ErrMembershipExists when the
	// User already belongs to the Organization.
	Create(ctx context.Context, membership NewOrganizationMembership) (domain.OrganizationMembership, error)
	// List returns one page of the Organization's Memberships, ordered by name
	// ignoring case and then by username, and how many there are in total.
	List(ctx context.Context, id domain.OrganizationID, page PageRequest) ([]domain.OrganizationMembership, int, error)
}

// AddOrganizationMembershipInput is the raw request to grant an Organization Membership.
type AddOrganizationMembershipInput struct {
	OrganizationID string
	Username       string
	Name           string
	Role           string
}

// AddedOrganizationMembership carries the granted Organization Membership and,
// when an unknown Username created a new User, their one-time Temporary Password.
type AddedOrganizationMembership struct {
	Membership        domain.OrganizationMembership
	TemporaryPassword string
}

// MembershipService runs the Organization Membership use cases.
type MembershipService struct {
	memberships OrganizationMembershipRepository
	users       UserProvisioner
}

// NewMembershipService builds a MembershipService from its dependencies.
func NewMembershipService(memberships OrganizationMembershipRepository, users UserProvisioner) *MembershipService {
	return &MembershipService{memberships: memberships, users: users}
}

// ListMemberships returns one page of the Organization's Memberships for an
// Actor who manages the Organization, and how many there are in total.
func (s *MembershipService) ListMemberships(ctx context.Context, actor domain.Actor, rawOrganizationID string, page PageRequest) ([]domain.OrganizationMembership, int, error) {
	orgID, err := domain.ParseOrganizationID(rawOrganizationID)
	if err != nil {
		return nil, 0, err
	}
	if err := s.requireOwner(ctx, orgID, actor); err != nil {
		return nil, 0, err
	}
	return s.memberships.List(ctx, orgID, page)
}

// AddMembership grants an Organization Membership in an Organization the Actor
// manages. An existing User is linked as is; an unknown Username creates a new
// User with a one-time Temporary Password. Invalid fields are reported at once, joined.
func (s *MembershipService) AddMembership(ctx context.Context, actor domain.Actor, in AddOrganizationMembershipInput) (AddedOrganizationMembership, error) {
	orgID, err := domain.ParseOrganizationID(in.OrganizationID)
	if err != nil {
		return AddedOrganizationMembership{}, err
	}
	username, usernameErr := domain.ParseUsername(in.Username)
	name, nameErr := domain.ParseName(in.Name)
	role, roleErr := domain.ParseOrganizationRole(in.Role)
	if err := errors.Join(usernameErr, nameErr, roleErr); err != nil {
		return AddedOrganizationMembership{}, err
	}
	if err := s.requireOwner(ctx, orgID, actor); err != nil {
		return AddedOrganizationMembership{}, err
	}

	user, err := s.users.ProvisionUser(ctx, username, name)
	if err != nil {
		return AddedOrganizationMembership{}, err
	}
	membership, err := s.memberships.Create(ctx, NewOrganizationMembership{
		OrganizationID: orgID,
		UserID:         user.ID,
		Role:           role,
	})
	if err != nil {
		return AddedOrganizationMembership{}, err
	}
	return AddedOrganizationMembership{
		Membership:        membership,
		TemporaryPassword: user.TemporaryPassword,
	}, nil
}

func (s *MembershipService) requireOwner(ctx context.Context, orgID domain.OrganizationID, actor domain.Actor) error {
	role, err := s.memberships.RoleIn(ctx, orgID, scopeOf(actor))
	if err != nil {
		return err
	}
	if !role.CanManageOrganization() {
		return domain.ErrForbidden
	}
	return nil
}
