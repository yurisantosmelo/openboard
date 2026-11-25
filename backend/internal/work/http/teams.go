package workhttp

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// TeamService is the Teams, Team Assignments and Project Teams portion of Work Management.
type TeamService interface {
	ListTeams(ctx context.Context, actor domain.Actor, rawWorkspaceID string) ([]domain.Team, error)
	CreateTeam(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawName string) (domain.Team, error)
	RenameTeam(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID, rawName string) (domain.Team, error)
	DeleteTeam(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID string) error

	ListTeamAssignments(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID string) ([]domain.TeamAssignment, error)
	AddTeamAssignment(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID, rawUserID string) (domain.TeamAssignment, error)
	RemoveTeamAssignment(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID, rawUserID string) error

	ListProjectTeams(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.Team, error)
	AddProjectTeam(ctx context.Context, actor domain.Actor, rawProjectID, rawTeamID string) (domain.Team, error)
	RemoveProjectTeam(ctx context.Context, actor domain.Actor, rawProjectID, rawTeamID string) error
}

// TeamHandler serves Workspace Team, Team Assignment and Project Team routes.
type TeamHandler struct {
	svc    TeamService
	auth   Auth
	logger *slog.Logger
}

// NewTeamHandler builds a TeamHandler.
func NewTeamHandler(svc TeamService, auth Auth, logger *slog.Logger) *TeamHandler {
	return &TeamHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds Team and Project Team routes to mux.
func (h *TeamHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/workspaces/{workspace_id}/teams", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.listTeams),
		http.MethodPost: h.auth.Authenticated(h.createTeam),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/workspaces/{workspace_id}/teams/{team_id}", map[string]httpx.HandlerFunc{
		http.MethodPatch:  h.auth.Authenticated(h.renameTeam),
		http.MethodDelete: h.auth.Authenticated(h.deleteTeam),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/workspaces/{workspace_id}/teams/{team_id}/assignments", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.listAssignments),
		http.MethodPost: h.auth.Authenticated(h.addAssignment),
	})
	httpx.Route(mux, h.logger, http.MethodDelete, "/api/v1/workspaces/{workspace_id}/teams/{team_id}/assignments/{user_id}",
		h.auth.Authenticated(h.removeAssignment))
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/teams", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.listProjectTeams),
		http.MethodPost: h.auth.Authenticated(h.addProjectTeam),
	})
	httpx.Route(mux, h.logger, http.MethodDelete, "/api/v1/projects/{project_id}/teams/{team_id}",
		h.auth.Authenticated(h.removeProjectTeam))
}

type teamResponse struct {
	ID          domain.TeamID      `json:"id"`
	WorkspaceID domain.WorkspaceID `json:"workspace_id"`
	Name        string             `json:"name"`
	CreatedAt   time.Time          `json:"created_at"`
	UpdatedAt   time.Time          `json:"updated_at"`
}

type teamAssignmentResponse struct {
	TeamID    domain.TeamID `json:"team_id"`
	UserID    domain.UserID `json:"user_id"`
	Username  string        `json:"username"`
	Name      string        `json:"name"`
	CreatedAt time.Time     `json:"created_at"`
}

func toTeamResponse(t domain.Team) teamResponse {
	return teamResponse{ID: t.ID, WorkspaceID: t.WorkspaceID, Name: t.Name, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt}
}

func toTeamResponses(teams []domain.Team) []teamResponse {
	items := make([]teamResponse, 0, len(teams))
	for _, t := range teams {
		items = append(items, toTeamResponse(t))
	}
	return items
}

func (h *TeamHandler) listTeams(w http.ResponseWriter, r *http.Request) error {
	teams, err := h.svc.ListTeams(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[teamResponse]{Items: toTeamResponses(teams)})
}

type teamNameRequest struct {
	Name string `json:"name"`
}

func (h *TeamHandler) createTeam(w http.ResponseWriter, r *http.Request) error {
	var req teamNameRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	team, err := h.svc.CreateTeam(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"), req.Name)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, toTeamResponse(team))
}

func (h *TeamHandler) renameTeam(w http.ResponseWriter, r *http.Request) error {
	var req teamNameRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	team, err := h.svc.RenameTeam(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"), r.PathValue("team_id"), req.Name)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toTeamResponse(team))
}

func (h *TeamHandler) deleteTeam(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.DeleteTeam(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"), r.PathValue("team_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *TeamHandler) listAssignments(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.svc.ListTeamAssignments(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"), r.PathValue("team_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]teamAssignmentResponse, 0, len(rows))
	for _, a := range rows {
		items = append(items, teamAssignmentResponse{
			TeamID: a.TeamID, UserID: a.UserID, Username: a.Username, Name: a.Name, CreatedAt: a.CreatedAt,
		})
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[teamAssignmentResponse]{Items: items})
}

type addAssignmentRequest struct {
	UserID string `json:"user_id"`
}

func (h *TeamHandler) addAssignment(w http.ResponseWriter, r *http.Request) error {
	var req addAssignmentRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	a, err := h.svc.AddTeamAssignment(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"), r.PathValue("team_id"), req.UserID)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, teamAssignmentResponse{
		TeamID: a.TeamID, UserID: a.UserID, Username: a.Username, Name: a.Name, CreatedAt: a.CreatedAt,
	})
}

func (h *TeamHandler) removeAssignment(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.RemoveTeamAssignment(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"), r.PathValue("team_id"), r.PathValue("user_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *TeamHandler) listProjectTeams(w http.ResponseWriter, r *http.Request) error {
	teams, err := h.svc.ListProjectTeams(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[teamResponse]{Items: toTeamResponses(teams)})
}

type addProjectTeamRequest struct {
	TeamID string `json:"team_id"`
}

func (h *TeamHandler) addProjectTeam(w http.ResponseWriter, r *http.Request) error {
	var req addProjectTeamRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	team, err := h.svc.AddProjectTeam(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), req.TeamID)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, toTeamResponse(team))
}

func (h *TeamHandler) removeProjectTeam(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.RemoveProjectTeam(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), r.PathValue("team_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
