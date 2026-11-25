package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	identityapp "github.com/elyosemite/openboard/backend/internal/identity/application"
	identityhttp "github.com/elyosemite/openboard/backend/internal/identity/http"
	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
	organizationshttp "github.com/elyosemite/openboard/backend/internal/organizations/http"
	"github.com/elyosemite/openboard/backend/internal/organizations/infrastructure/postgres"
	workdomain "github.com/elyosemite/openboard/backend/internal/work/domain"
	workpostgres "github.com/elyosemite/openboard/backend/internal/work/infrastructure/postgres"
)

// setupOrganizations wires the Organization module, authenticating its
// requests through the identity module.
func setupOrganizations(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler) *organizationshttp.Handler {
	return setupOrganizationsWithGrace(logger, pool, identity, 0)
}

func setupOrganizationsWithGrace(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler, grace time.Duration) *organizationshttp.Handler {
	svc := application.NewService(postgres.NewOrganizations(pool)).WithDeletionGracePeriod(grace)
	auth := organizationshttp.Auth{Authenticated: identity.Authenticated, Actor: actorOf}
	return organizationshttp.NewHandler(svc, auth, logger)
}

// setupOrganizationMemberships wires the Organization Membership endpoints,
// delegating User creation and lookup to the identity service.
func setupOrganizationMemberships(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler, identitySvc *identityapp.Service) *organizationshttp.MembershipHandler {
	workItems := workpostgres.NewWorkItems(pool)
	svc := application.NewMembershipService(postgres.NewMemberships(pool), userProvisioner{svc: identitySvc}).
		WithAccessLostHook(func(ctx context.Context, orgID domain.OrganizationID, userID domain.UserID) error {
			return workItems.ClearInaccessibleAssigneesInOrganization(ctx, workdomain.OrganizationID(orgID), workdomain.UserID(userID))
		})
	auth := organizationshttp.Auth{Authenticated: identity.Authenticated, Actor: actorOf}
	return organizationshttp.NewMembershipHandler(svc, auth, logger)
}

// setupWorkspaces wires the Workspace endpoints of the Organization module.
func setupWorkspaces(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler) *organizationshttp.WorkspaceHandler {
	return setupWorkspacesWithGrace(logger, pool, identity, 0)
}

func setupWorkspacesWithGrace(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler, grace time.Duration) *organizationshttp.WorkspaceHandler {
	workItems := workpostgres.NewWorkItems(pool)
	svc := application.NewWorkspaceService(postgres.NewWorkspaces(pool)).
		WithDeletionGracePeriod(grace).
		WithVisibilityRestrictedHook(func(ctx context.Context, wsID domain.WorkspaceID) error {
			return workItems.ClearInaccessibleAssigneesInWorkspace(ctx, workdomain.WorkspaceID(wsID))
		})
	auth := organizationshttp.Auth{Authenticated: identity.Authenticated, Actor: actorOf}
	return organizationshttp.NewWorkspaceHandler(svc, auth, logger)
}

func purgeExpiredDeletions(ctx context.Context, pool *pgxpool.Pool) error {
	if err := workpostgres.NewProjects(pool).PurgeExpired(ctx); err != nil {
		return err
	}
	if err := postgres.NewWorkspaces(pool).PurgeExpired(ctx); err != nil {
		return err
	}
	return postgres.NewOrganizations(pool).PurgeExpired(ctx)
}

// setupWorkspaceMemberships wires the Workspace Membership endpoints.
func setupWorkspaceMemberships(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler) *organizationshttp.WorkspaceMembershipHandler {
	workItems := workpostgres.NewWorkItems(pool)
	svc := application.NewWorkspaceMembershipService(postgres.NewWorkspaceMemberships(pool)).
		WithAccessLostHook(func(ctx context.Context, wsID domain.WorkspaceID) error {
			return workItems.ClearInaccessibleAssigneesInWorkspace(ctx, workdomain.WorkspaceID(wsID))
		})
	auth := organizationshttp.Auth{Authenticated: identity.Authenticated, Actor: actorOf}
	return organizationshttp.NewWorkspaceMembershipHandler(svc, auth, logger)
}

type userProvisioner struct {
	svc *identityapp.Service
}

func (p userProvisioner) ProvisionUser(ctx context.Context, username, name string) (application.ProvisionedUser, error) {
	res, err := p.svc.ProvisionUser(ctx, username, name)
	if err != nil {
		return application.ProvisionedUser{}, err
	}
	return application.ProvisionedUser{
		ID:                domain.UserID(res.User.ID),
		Username:          res.User.Username.String(),
		Name:              res.User.Name,
		TemporaryPassword: res.TemporaryPassword,
		Deactivated:       res.User.IsDeactivated(),
	}, nil
}

// actorOf translates the identity Principal into the Organization module's Actor.
func actorOf(ctx context.Context) domain.Actor {
	p, _ := identityhttp.PrincipalFrom(ctx)
	return domain.Actor{UserID: domain.UserID(p.User.ID), IsAdministrator: p.User.IsAdministrator}
}
