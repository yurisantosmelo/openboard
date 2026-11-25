package main

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	identityapp "github.com/elyosemite/openboard/backend/internal/identity/application"
	identityhttp "github.com/elyosemite/openboard/backend/internal/identity/http"
	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
	organizationshttp "github.com/elyosemite/openboard/backend/internal/organizations/http"
	"github.com/elyosemite/openboard/backend/internal/organizations/infrastructure/postgres"
)

// setupOrganizations wires the Organization module, authenticating its
// requests through the identity module.
func setupOrganizations(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler) *organizationshttp.Handler {
	svc := application.NewService(postgres.NewOrganizations(pool))
	auth := organizationshttp.Auth{Authenticated: identity.Authenticated, Actor: actorOf}
	return organizationshttp.NewHandler(svc, auth, logger)
}

// setupOrganizationMemberships wires the Organization Membership endpoints,
// delegating User creation and lookup to the identity service.
func setupOrganizationMemberships(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler, identitySvc *identityapp.Service) *organizationshttp.MembershipHandler {
	svc := application.NewMembershipService(postgres.NewMemberships(pool), userProvisioner{svc: identitySvc})
	auth := organizationshttp.Auth{Authenticated: identity.Authenticated, Actor: actorOf}
	return organizationshttp.NewMembershipHandler(svc, auth, logger)
}

// setupWorkspaces wires the Workspace endpoints of the Organization module.
func setupWorkspaces(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler) *organizationshttp.WorkspaceHandler {
	svc := application.NewWorkspaceService(postgres.NewWorkspaces(pool))
	auth := organizationshttp.Auth{Authenticated: identity.Authenticated, Actor: actorOf}
	return organizationshttp.NewWorkspaceHandler(svc, auth, logger)
}

// setupWorkspaceMemberships wires the Workspace Membership endpoints.
func setupWorkspaceMemberships(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler) *organizationshttp.WorkspaceMembershipHandler {
	svc := application.NewWorkspaceMembershipService(postgres.NewWorkspaceMemberships(pool))
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
