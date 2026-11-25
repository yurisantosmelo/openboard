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

// ViewService is the saved Views portion of the Work Management application.
type ViewService interface {
	ListViews(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.View, error)
	GetView(ctx context.Context, actor domain.Actor, rawProjectID, rawViewID string) (domain.View, error)
	CreateView(ctx context.Context, actor domain.Actor, in application.CreateViewInput) (domain.View, error)
	UpdateView(ctx context.Context, actor domain.Actor, in application.UpdateViewInput) (domain.View, error)
	DeleteView(ctx context.Context, actor domain.Actor, rawProjectID, rawViewID string) error
}

// ViewHandler serves Project View endpoints.
type ViewHandler struct {
	svc    ViewService
	auth   Auth
	logger *slog.Logger
}

// NewViewHandler builds a ViewHandler.
func NewViewHandler(svc ViewService, auth Auth, logger *slog.Logger) *ViewHandler {
	return &ViewHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds saved View routes to mux.
func (h *ViewHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/views", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.create),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/views/{view_id}", map[string]httpx.HandlerFunc{
		http.MethodGet:    h.auth.Authenticated(h.get),
		http.MethodPatch:  h.auth.Authenticated(h.update),
		http.MethodDelete: h.auth.Authenticated(h.delete),
	})
}

type viewResponse struct {
	ID         domain.ViewID         `json:"id"`
	ProjectID  domain.ProjectID      `json:"project_id"`
	Name       string                `json:"name"`
	Layout     domain.ViewLayout     `json:"layout"`
	Visibility domain.ViewVisibility `json:"visibility"`
	Filters    domain.ViewFilters    `json:"filters"`
	CreatedBy  domain.UserID         `json:"created_by"`
	CreatedAt  time.Time             `json:"created_at"`
	UpdatedAt  time.Time             `json:"updated_at"`
}

func toViewResponse(v domain.View) viewResponse {
	return viewResponse{
		ID:         v.ID,
		ProjectID:  v.ProjectID,
		Name:       v.Name,
		Layout:     v.Layout,
		Visibility: v.Visibility,
		Filters:    v.Filters,
		CreatedBy:  v.CreatedBy,
		CreatedAt:  v.CreatedAt,
		UpdatedAt:  v.UpdatedAt,
	}
}

func (h *ViewHandler) list(w http.ResponseWriter, r *http.Request) error {
	views, err := h.svc.ListViews(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]viewResponse, 0, len(views))
	for _, v := range views {
		items = append(items, toViewResponse(v))
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[viewResponse]{Items: items})
}

func (h *ViewHandler) get(w http.ResponseWriter, r *http.Request) error {
	v, err := h.svc.GetView(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), r.PathValue("view_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toViewResponse(v))
}

type createViewRequest struct {
	Name    string             `json:"name"`
	Layout  string             `json:"layout"`
	Filters domain.ViewFilters `json:"filters"`
}

func (h *ViewHandler) create(w http.ResponseWriter, r *http.Request) error {
	var req createViewRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	v, err := h.svc.CreateView(r.Context(), h.auth.Actor(r.Context()), application.CreateViewInput{
		ProjectID: r.PathValue("project_id"),
		Name:      req.Name,
		Layout:    req.Layout,
		Filters:   req.Filters,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, toViewResponse(v))
}

type updateViewRequest struct {
	Name       *string             `json:"name"`
	Layout     *string             `json:"layout"`
	Visibility *string             `json:"visibility"`
	Filters    *domain.ViewFilters `json:"filters"`
}

func (h *ViewHandler) update(w http.ResponseWriter, r *http.Request) error {
	var req updateViewRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	v, err := h.svc.UpdateView(r.Context(), h.auth.Actor(r.Context()), application.UpdateViewInput{
		ProjectID:  r.PathValue("project_id"),
		ViewID:     r.PathValue("view_id"),
		Name:       req.Name,
		Layout:     req.Layout,
		Visibility: req.Visibility,
		Filters:    req.Filters,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toViewResponse(v))
}

func (h *ViewHandler) delete(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.DeleteView(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), r.PathValue("view_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
