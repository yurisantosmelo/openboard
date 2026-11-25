// Package application implements the Organization use cases. Storage is
// injected through ports.
package application

import (
	"context"
	"errors"
	"time"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

// NewOrganization holds what is needed to create an Organization together
// with its Default Workspace and first Organization Owner.
type NewOrganization struct {
	Name                 string
	OwnerID              domain.UserID
	DefaultWorkspaceName string
}

// OrganizationRepository stores Organizations.
type OrganizationRepository interface {
	// Create stores the Organization, its Open Default Workspace and the
	// Owner's Organization Membership atomically. It returns
	// domain.ErrOwnerNotFound when OwnerID is not a User.
	Create(ctx context.Context, org NewOrganization) (domain.Organization, error)
	// Find returns the Organization with id if scope sees it, or domain.ErrNotFound.
	Find(ctx context.Context, id domain.OrganizationID, scope Scope) (domain.Organization, error)
	// List returns one page of the Organizations scope sees, ordered by
	// name ignoring case, and how many it sees in total.
	List(ctx context.Context, scope Scope, page PageRequest) ([]domain.Organization, int, error)
}

// Scope limits which Organizations a query returns: every one, or only those
// UserID holds an Organization Membership in.
type Scope struct {
	UserID domain.UserID
	All    bool
}

func scopeOf(actor domain.Actor) Scope {
	return Scope{UserID: actor.UserID, All: actor.SeesAllOrganizations()}
}

// PageRequest selects a page of a collection.
type PageRequest struct {
	Limit  int
	Offset int
}

// CreateOrganizationInput is the raw request to create an Organization.
// An empty OwnerUserID makes the creator the first Organization Owner.
type CreateOrganizationInput struct {
	Name        string
	OwnerUserID string
}

const defaultDeletionGracePeriod = 30 * 24 * time.Hour

// Service runs the Organization use cases.
type Service struct {
	organizations OrganizationRepository
	lifecycle     OrganizationLifecycleRepository
	gracePeriod   time.Duration
	now           func() time.Time
}

// NewService builds a Service from its repository.
func NewService(organizations OrganizationRepository) *Service {
	lc, _ := organizations.(OrganizationLifecycleRepository)
	return &Service{
		organizations: organizations,
		lifecycle:     lc,
		gracePeriod:   defaultDeletionGracePeriod,
		now:           time.Now,
	}
}

// WithDeletionGracePeriod configures the Pending Deletion grace period.
func (s *Service) WithDeletionGracePeriod(d time.Duration) *Service {
	if d > 0 {
		s.gracePeriod = d
	}
	return s
}

// CreateOrganization creates an Organization with its Default Workspace and
// gives the first Organization Owner an Organization Membership. Invalid
// fields are all reported at once, joined.
func (s *Service) CreateOrganization(ctx context.Context, actor domain.Actor, in CreateOrganizationInput) (domain.Organization, error) {
	if !actor.CanCreateOrganization() {
		return domain.Organization{}, domain.ErrForbidden
	}
	name, nameErr := domain.ParseName(in.Name)
	owner, ownerErr := ownerOf(actor, in.OwnerUserID)
	if err := errors.Join(nameErr, ownerErr); err != nil {
		return domain.Organization{}, err
	}
	return s.organizations.Create(ctx, NewOrganization{
		Name:                 name,
		OwnerID:              owner,
		DefaultWorkspaceName: domain.DefaultWorkspaceName,
	})
}

func ownerOf(actor domain.Actor, raw string) (domain.UserID, error) {
	if raw == "" {
		return actor.UserID, nil
	}
	return domain.ParseUserID(raw)
}
