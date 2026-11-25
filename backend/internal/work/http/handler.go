// Package workhttp exposes the Work Management use cases over HTTP.
// Authentication comes from the identity module, injected by the caller, so
// this package never imports another module.
package workhttp

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// Service is the part of the Work Management application the HTTP layer uses.
type Service interface {
	CreateProject(ctx context.Context, actor domain.Actor, in application.CreateProjectInput) (domain.Project, error)
	ListProjects(ctx context.Context, actor domain.Actor, rawWorkspaceID string, page application.PageRequest) ([]domain.Project, int, error)
	GetProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error)
	UpdateProject(ctx context.Context, actor domain.Actor, in application.UpdateProjectInput) (domain.Project, error)
	ListStatuses(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.Status, error)
	ListWorkItemTypes(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.WorkItemType, error)
}

// Auth authenticates requests and resolves the Actor behind them.
type Auth struct {
	Authenticated func(next httpx.HandlerFunc) httpx.HandlerFunc
	Actor         func(ctx context.Context) domain.Actor
}

// Handler serves the Work Management endpoints.
type Handler struct {
	svc    Service
	auth   Auth
	logger *slog.Logger
}

// NewHandler builds a Handler.
func NewHandler(svc Service, auth Auth, logger *slog.Logger) *Handler {
	return &Handler{svc: svc, auth: auth, logger: logger}
}

// Register adds the Work Management routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.create),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}", map[string]httpx.HandlerFunc{
		http.MethodGet:   h.auth.Authenticated(h.get),
		http.MethodPatch: h.auth.Authenticated(h.update),
	})
	httpx.Route(mux, h.logger, http.MethodGet, "/api/v1/projects/{project_id}/statuses", h.auth.Authenticated(h.listStatuses))
	httpx.Route(mux, h.logger, http.MethodGet, "/api/v1/projects/{project_id}/work-item-types", h.auth.Authenticated(h.listWorkItemTypes))
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	q, err := httpx.ParsePageQuery(r)
	if err != nil {
		return err
	}
	projects, total, err := h.svc.ListProjects(r.Context(), h.auth.Actor(r.Context()), r.URL.Query().Get("workspace_id"),
		application.PageRequest{Limit: q.PageSize, Offset: q.Offset()})
	if err != nil {
		return mapError(err)
	}
	items := make([]projectResponse, 0, len(projects))
	for _, p := range projects {
		items = append(items, toProjectResponse(p))
	}
	return httpx.WriteJSON(w, http.StatusOK, httpx.NewPageResponse(items, q, total))
}

type createProjectRequest struct {
	WorkspaceID string `json:"workspace_id"`
	Name        string `json:"name"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var req createProjectRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	project, err := h.svc.CreateProject(r.Context(), h.auth.Actor(r.Context()), application.CreateProjectInput{
		WorkspaceID: req.WorkspaceID, Name: req.Name,
	})
	if err != nil {
		return mapError(err)
	}
	w.Header().Set("Location", "/api/v1/projects/"+string(project.ID))
	return httpx.WriteJSON(w, http.StatusCreated, toProjectResponse(project))
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) error {
	project, err := h.svc.GetProject(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toProjectResponse(project))
}

type updateProjectRequest struct {
	Name *string `json:"name"`
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) error {
	var req updateProjectRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	project, err := h.svc.UpdateProject(r.Context(), h.auth.Actor(r.Context()), application.UpdateProjectInput{
		ID: r.PathValue("project_id"), Name: req.Name,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toProjectResponse(project))
}

type projectResponse struct {
	ID              domain.ProjectID      `json:"id"`
	OrganizationID  domain.OrganizationID `json:"organization_id"`
	WorkspaceID     domain.WorkspaceID    `json:"workspace_id"`
	Name            string                `json:"name"`
	CreatedAt       time.Time             `json:"created_at"`
	UpdatedAt       time.Time             `json:"updated_at"`
	CurrentUserRole domain.Role           `json:"current_user_role"`
}

func toProjectResponse(p domain.Project) projectResponse {
	return projectResponse{
		ID:              p.ID,
		OrganizationID:  p.OrganizationID,
		WorkspaceID:     p.WorkspaceID,
		Name:            p.Name,
		CreatedAt:       p.CreatedAt,
		UpdatedAt:       p.UpdatedAt,
		CurrentUserRole: p.ViewerRole,
	}
}
