package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	identityapp "github.com/elyosemite/openboard/backend/internal/identity/application"
	identitydomain "github.com/elyosemite/openboard/backend/internal/identity/domain"
	identityhttp "github.com/elyosemite/openboard/backend/internal/identity/http"
	identitypostgres "github.com/elyosemite/openboard/backend/internal/identity/infrastructure/postgres"
	orgapp "github.com/elyosemite/openboard/backend/internal/organizations/application"
	orgdomain "github.com/elyosemite/openboard/backend/internal/organizations/domain"
	orgpostgres "github.com/elyosemite/openboard/backend/internal/organizations/infrastructure/postgres"
	workapp "github.com/elyosemite/openboard/backend/internal/work/application"
	workdomain "github.com/elyosemite/openboard/backend/internal/work/domain"
	workhttp "github.com/elyosemite/openboard/backend/internal/work/http"
	workpostgres "github.com/elyosemite/openboard/backend/internal/work/infrastructure/postgres"
)

type workModule struct {
	projects  *workhttp.Handler
	workflow  *workhttp.WorkflowHandler
	workItems *workhttp.WorkItemHandler
	links     *workhttp.LinkHandler
	eras      *workhttp.EraHandler
	views     *workhttp.ViewHandler
	teams     *workhttp.TeamHandler
}

func (m workModule) Register(mux *http.ServeMux) {
	m.projects.Register(mux)
	m.workflow.Register(mux)
	m.workItems.Register(mux)
	m.links.Register(mux)
	m.eras.Register(mux)
	m.views.Register(mux)
	m.teams.Register(mux)
}

// setupWork wires the Work Management core domain module, checking Workspace
// access through the Organization module and User active status through identity.
func setupWork(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler) module {
	return setupWorkWithGrace(logger, pool, identity, 0)
}

func setupWorkWithGrace(logger *slog.Logger, pool *pgxpool.Pool, identity *identityhttp.Handler, grace time.Duration) module {
	wsRepo := orgpostgres.NewWorkspaces(pool)
	workspaces := orgapp.NewWorkspaceService(wsRepo)
	access := workspaceAccessAdapter{
		workspaces: workspaces,
		wsRepo:     wsRepo,
		users:      identitypostgres.NewUsers(pool),
	}
	projectsRepo := workpostgres.NewProjects(pool)
	workflowRepo := workpostgres.NewWorkflow(pool)
	workItemsRepo := workpostgres.NewWorkItems(pool)
	linksRepo := workpostgres.NewLinks(pool)
	erasRepo := workpostgres.NewEras(pool)
	viewsRepo := workpostgres.NewViews(pool)
	teamsRepo := workpostgres.NewTeams(pool)
	auth := workhttp.Auth{Authenticated: identity.Authenticated, Actor: workActorOf}
	workItemSvc := workapp.NewWorkItemService(projectsRepo, workItemsRepo, access, access).
		WithTransitionRules(workflowRepo).
		WithEras(erasRepo)
	return workModule{
		projects:  workhttp.NewHandler(workapp.NewService(projectsRepo, access).WithDeletionGracePeriod(grace), auth, logger),
		workflow:  workhttp.NewWorkflowHandler(workapp.NewWorkflowService(projectsRepo, workflowRepo, access), auth, logger),
		workItems: workhttp.NewWorkItemHandler(workItemSvc, auth, logger),
		links:     workhttp.NewLinkHandler(workapp.NewLinkService(projectsRepo, workItemsRepo, linksRepo, access), auth, logger),
		eras:      workhttp.NewEraHandler(workapp.NewEraService(projectsRepo, erasRepo, access), auth, logger),
		views:     workhttp.NewViewHandler(workapp.NewViewService(projectsRepo, viewsRepo, access), auth, logger),
		teams:     workhttp.NewTeamHandler(workapp.NewTeamService(projectsRepo, teamsRepo, access, access), auth, logger),
	}
}

type workspaceAccessAdapter struct {
	workspaces *orgapp.WorkspaceService
	wsRepo     *orgpostgres.Workspaces
	users      *identitypostgres.Users
}

func (a workspaceAccessAdapter) Access(ctx context.Context, actor workdomain.Actor, workspaceID workdomain.WorkspaceID) (workdomain.WorkspaceAccess, error) {
	orgActor := orgdomain.Actor{
		UserID:          orgdomain.UserID(actor.UserID),
		IsAdministrator: actor.IsAdministrator,
	}
	ws, err := a.workspaces.GetWorkspace(ctx, orgActor, string(workspaceID))
	if errors.Is(err, orgdomain.ErrWorkspaceNotFound) {
		return workdomain.WorkspaceAccess{}, workdomain.ErrWorkspaceNotFound
	}
	if err != nil {
		return workdomain.WorkspaceAccess{}, err
	}
	canRestore := actor.IsAdministrator
	if !canRestore {
		orgRole, roleErr := a.wsRepo.RoleIn(ctx, ws.OrganizationID, orgapp.Scope{UserID: orgActor.UserID})
		canRestore = roleErr == nil && orgRole == orgdomain.RoleOwner
	}
	return workdomain.WorkspaceAccess{
		WorkspaceID:               workdomain.WorkspaceID(ws.ID),
		OrganizationID:            workdomain.OrganizationID(ws.OrganizationID),
		Role:                      workdomain.Role(ws.ViewerRole),
		Archived:                  ws.IsArchived(),
		CanRestorePendingDeletion: canRestore,
	}, nil
}

func (a workspaceAccessAdapter) CanBeAssigned(ctx context.Context, userID workdomain.UserID, workspaceID workdomain.WorkspaceID) (bool, error) {
	user, err := a.users.FindByID(ctx, identitydomain.UserID(userID))
	if errors.Is(err, identityapp.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if user.IsDeactivated() {
		return false, nil
	}
	_, err = a.workspaces.GetWorkspace(ctx, orgdomain.Actor{
		UserID:          orgdomain.UserID(user.ID),
		IsAdministrator: user.IsAdministrator,
	}, string(workspaceID))
	if errors.Is(err, orgdomain.ErrWorkspaceNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func workActorOf(ctx context.Context) workdomain.Actor {
	p, _ := identityhttp.PrincipalFrom(ctx)
	return workdomain.Actor{UserID: workdomain.UserID(p.User.ID), IsAdministrator: p.User.IsAdministrator}
}
