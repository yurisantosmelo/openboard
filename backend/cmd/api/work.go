package main

import (
	"context"
	"errors"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	identityhttp "github.com/elyosemite/openboard/backend/internal/identity/http"
	orgapp "github.com/elyosemite/openboard/backend/internal/organizations/application"
	orgdomain "github.com/elyosemite/openboard/backend/internal/organizations/domain"
	orgpostgres "github.com/elyosemite/openboard/backend/internal/organizations/infrastructure/postgres"
	workapp "github.com/elyosemite/openboard/backend/internal/work/application"
	workdomain "github.com/elyosemite/openboard/backend/internal/work/domain"
	workhttp "github.com/elyosemite/openboard/backend/internal/work/http"
	workpostgres "github.com/elyosemite/openboard/backend/internal/work/infrastructure/postgres"
)

// setupWork wires the Work Management core domain module, checking Workspace
// access through the Organization module's Workspace service.
func setupWork(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler) *workhttp.Handler {
	workspaces := orgapp.NewWorkspaceService(orgpostgres.NewWorkspaces(pool))
	svc := workapp.NewService(workpostgres.NewProjects(pool), workspaceAccessAdapter{workspaces: workspaces})
	auth := workhttp.Auth{Authenticated: identity.Authenticated, Actor: workActorOf}
	return workhttp.NewHandler(svc, auth, logger)
}

type workspaceAccessAdapter struct {
	workspaces *orgapp.WorkspaceService
}

func (a workspaceAccessAdapter) Access(ctx context.Context, actor workdomain.Actor, workspaceID workdomain.WorkspaceID) (workdomain.WorkspaceAccess, error) {
	ws, err := a.workspaces.GetWorkspace(ctx, orgdomain.Actor{
		UserID:          orgdomain.UserID(actor.UserID),
		IsAdministrator: actor.IsAdministrator,
	}, string(workspaceID))
	if errors.Is(err, orgdomain.ErrWorkspaceNotFound) {
		return workdomain.WorkspaceAccess{}, workdomain.ErrWorkspaceNotFound
	}
	if err != nil {
		return workdomain.WorkspaceAccess{}, err
	}
	return workdomain.WorkspaceAccess{
		WorkspaceID:    workdomain.WorkspaceID(ws.ID),
		OrganizationID: workdomain.OrganizationID(ws.OrganizationID),
		Role:           workdomain.Role(ws.ViewerRole),
	}, nil
}

func workActorOf(ctx context.Context) workdomain.Actor {
	p, _ := identityhttp.PrincipalFrom(ctx)
	return workdomain.Actor{UserID: workdomain.UserID(p.User.ID), IsAdministrator: p.User.IsAdministrator}
}
