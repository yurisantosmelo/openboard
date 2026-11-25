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
	MoveProject(ctx context.Context, actor domain.Actor, rawProjectID, rawTargetWorkspaceID string) (domain.Project, error)
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

type projectLifecycleService interface {
	ListProjectsFiltered(ctx context.Context, actor domain.Actor, rawWorkspaceID string, includeArchived bool, page application.PageRequest) ([]domain.Project, int, error)
	ListPendingDeletionProjects(ctx context.Context, actor domain.Actor, rawWorkspaceID string, page application.PageRequest) ([]domain.Project, int, error)
	ArchiveProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error)
	UnarchiveProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error)
	DeleteProject(ctx context.Context, actor domain.Actor, rawProjectID string) error
	RestoreProject(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error)
}

// Register adds the Work Management routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.create),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}", map[string]httpx.HandlerFunc{
		http.MethodGet:    h.auth.Authenticated(h.get),
		http.MethodPatch:  h.auth.Authenticated(h.update),
		http.MethodDelete: h.auth.Authenticated(h.delete),
	})
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/projects/{project_id}/move",
		h.auth.Authenticated(h.move))
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/projects/{project_id}/archive",
		h.auth.Authenticated(h.archive))
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/projects/{project_id}/unarchive",
		h.auth.Authenticated(h.unarchive))
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/projects/{project_id}/restore",
		h.auth.Authenticated(h.restore))
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	q, err := httpx.ParsePageQuery(r)
	if err != nil {
		return err
	}
	page := application.PageRequest{Limit: q.PageSize, Offset: q.Offset()}
	projects, total, err := h.queryProjects(r, h.auth.Actor(r.Context()), r.URL.Query().Get("workspace_id"), page)
	if err != nil {
		return mapError(err)
	}
	items := make([]projectResponse, 0, len(projects))
	for _, p := range projects {
		items = append(items, toProjectResponse(p))
	}
	return httpx.WriteJSON(w, http.StatusOK, httpx.NewPageResponse(items, q, total))
}

func (h *Handler) queryProjects(r *http.Request, actor domain.Actor, wsID string, page application.PageRequest) ([]domain.Project, int, error) {
	if r.URL.Query().Get("pending_deletion") == "true" {
		lc, ok := h.svc.(projectLifecycleService)
		if !ok {
			return nil, 0, domain.ErrNotFound
		}
		return lc.ListPendingDeletionProjects(r.Context(), actor, wsID, page)
	}
	if r.URL.Query().Get("include_archived") == "true" {
		if lc, ok := h.svc.(projectLifecycleService); ok {
			return lc.ListProjectsFiltered(r.Context(), actor, wsID, true, page)
		}
	}
	return h.svc.ListProjects(r.Context(), actor, wsID, page)
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

type moveProjectRequest struct {
	WorkspaceID string `json:"workspace_id"`
}

func (h *Handler) move(w http.ResponseWriter, r *http.Request) error {
	var req moveProjectRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	project, err := h.svc.MoveProject(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), req.WorkspaceID)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toProjectResponse(project))
}

func (h *Handler) archive(w http.ResponseWriter, r *http.Request) error {
	lc, ok := h.svc.(projectLifecycleService)
	if !ok {
		return httpx.ErrNotFound()
	}
	project, err := lc.ArchiveProject(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toProjectResponse(project))
}

func (h *Handler) unarchive(w http.ResponseWriter, r *http.Request) error {
	lc, ok := h.svc.(projectLifecycleService)
	if !ok {
		return httpx.ErrNotFound()
	}
	project, err := lc.UnarchiveProject(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toProjectResponse(project))
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) error {
	lc, ok := h.svc.(projectLifecycleService)
	if !ok {
		return httpx.ErrNotFound()
	}
	if err := lc.DeleteProject(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) restore(w http.ResponseWriter, r *http.Request) error {
	lc, ok := h.svc.(projectLifecycleService)
	if !ok {
		return httpx.ErrNotFound()
	}
	project, err := lc.RestoreProject(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toProjectResponse(project))
}

type projectResponse struct {
	ID                domain.ProjectID      `json:"id"`
	OrganizationID    domain.OrganizationID `json:"organization_id"`
	WorkspaceID       domain.WorkspaceID    `json:"workspace_id"`
	Name              string                `json:"name"`
	CreatedAt         time.Time             `json:"created_at"`
	UpdatedAt         time.Time             `json:"updated_at"`
	ArchivedAt        *time.Time            `json:"archived_at"`
	WorkspaceArchived bool                  `json:"workspace_archived"`
	IsReadOnly        bool                  `json:"is_read_only"`
	DeletedAt         *time.Time            `json:"deleted_at,omitempty"`
	PurgeAfter        *time.Time            `json:"purge_after,omitempty"`
	CurrentUserRole   domain.Role           `json:"current_user_role"`
}

func toProjectResponse(p domain.Project) projectResponse {
	return projectResponse{
		ID:                p.ID,
		OrganizationID:    p.OrganizationID,
		WorkspaceID:       p.WorkspaceID,
		Name:              p.Name,
		CreatedAt:         p.CreatedAt,
		UpdatedAt:         p.UpdatedAt,
		ArchivedAt:        p.ArchivedAt,
		WorkspaceArchived: p.WorkspaceArchived,
		IsReadOnly:        p.IsReadOnly(),
		DeletedAt:         p.DeletedAt,
		PurgeAfter:        p.PurgeAfter,
		CurrentUserRole:   p.ViewerRole,
	}
}
