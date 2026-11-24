package organizationshttp

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
)

// WorkspaceService is the part of the Workspace application the HTTP layer uses.
type WorkspaceService interface {
	CreateWorkspace(ctx context.Context, actor domain.Actor, in application.CreateWorkspaceInput) (domain.Workspace, error)
	GetWorkspace(ctx context.Context, actor domain.Actor, rawID string) (domain.Workspace, error)
	ListWorkspaces(ctx context.Context, actor domain.Actor, rawOrganizationID string, page application.PageRequest) ([]domain.Workspace, int, error)
	UpdateWorkspace(ctx context.Context, actor domain.Actor, in application.UpdateWorkspaceInput) (domain.Workspace, error)
}

// WorkspaceHandler serves the Workspace endpoints.
type WorkspaceHandler struct {
	svc    WorkspaceService
	auth   Auth
	logger *slog.Logger
}

// NewWorkspaceHandler builds a WorkspaceHandler.
func NewWorkspaceHandler(svc WorkspaceService, auth Auth, logger *slog.Logger) *WorkspaceHandler {
	return &WorkspaceHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds the Workspace routes to mux.
func (h *WorkspaceHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/workspaces", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.create),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/workspaces/{workspace_id}", map[string]httpx.HandlerFunc{
		http.MethodGet:   h.auth.Authenticated(h.get),
		http.MethodPatch: h.auth.Authenticated(h.update),
	})
}

func (h *WorkspaceHandler) list(w http.ResponseWriter, r *http.Request) error {
	q, err := httpx.ParsePageQuery(r)
	if err != nil {
		return err
	}
	workspaces, total, err := h.svc.ListWorkspaces(r.Context(), h.auth.Actor(r.Context()), r.URL.Query().Get("organization_id"),
		application.PageRequest{Limit: q.PageSize, Offset: q.Offset()})
	if err != nil {
		return mapWorkspaceError(err)
	}
	items := make([]workspaceResponse, 0, len(workspaces))
	for _, ws := range workspaces {
		items = append(items, toWorkspaceResponse(ws))
	}
	return httpx.WriteJSON(w, http.StatusOK, httpx.NewPageResponse(items, q, total))
}

func (h *WorkspaceHandler) get(w http.ResponseWriter, r *http.Request) error {
	ws, err := h.svc.GetWorkspace(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"))
	if err != nil {
		return mapWorkspaceError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toWorkspaceResponse(ws))
}

type createWorkspaceRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Visibility     string `json:"visibility"`
}

func (h *WorkspaceHandler) create(w http.ResponseWriter, r *http.Request) error {
	var req createWorkspaceRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	ws, err := h.svc.CreateWorkspace(r.Context(), h.auth.Actor(r.Context()), application.CreateWorkspaceInput{
		OrganizationID: req.OrganizationID, Name: req.Name, Visibility: req.Visibility,
	})
	if err != nil {
		return mapWorkspaceError(err)
	}
	w.Header().Set("Location", "/api/v1/workspaces/"+string(ws.ID))
	return httpx.WriteJSON(w, http.StatusCreated, toWorkspaceResponse(ws))
}

// updateWorkspaceRequest leaves nil the fields that stay as they are.
type updateWorkspaceRequest struct {
	Name       *string `json:"name"`
	Visibility *string `json:"visibility"`
}

func (h *WorkspaceHandler) update(w http.ResponseWriter, r *http.Request) error {
	var req updateWorkspaceRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	ws, err := h.svc.UpdateWorkspace(r.Context(), h.auth.Actor(r.Context()), application.UpdateWorkspaceInput{
		ID: r.PathValue("workspace_id"), Name: req.Name, Visibility: req.Visibility,
	})
	if err != nil {
		return mapWorkspaceError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toWorkspaceResponse(ws))
}

type workspaceResponse struct {
	ID              domain.WorkspaceID    `json:"id"`
	OrganizationID  domain.OrganizationID `json:"organization_id"`
	Name            string                `json:"name"`
	Visibility      domain.Visibility     `json:"visibility"`
	CreatedAt       time.Time             `json:"created_at"`
	UpdatedAt       time.Time             `json:"updated_at"`
	CurrentUserRole domain.Role           `json:"current_user_role"`
}

func toWorkspaceResponse(ws domain.Workspace) workspaceResponse {
	return workspaceResponse{
		ID:              ws.ID,
		OrganizationID:  ws.OrganizationID,
		Name:            ws.Name,
		Visibility:      ws.Visibility,
		CreatedAt:       ws.CreatedAt,
		UpdatedAt:       ws.UpdatedAt,
		CurrentUserRole: ws.ViewerRole,
	}
}

// workspaceFieldErrors maps each validation error to the field it concerns.
var workspaceFieldErrors = []fieldRule{
	{domain.ErrInvalidOrganizationRef, httpx.FieldError{Field: "organization_id", Code: "invalid", Message: domain.ErrInvalidOrganizationRef.Error()}},
	{domain.ErrUnknownOrganization, httpx.FieldError{Field: "organization_id", Code: "not_found", Message: domain.ErrUnknownOrganization.Error()}},
	{domain.ErrInvalidName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidName.Error()}},
	{domain.ErrInvalidVisibility, httpx.FieldError{Field: "visibility", Code: "invalid", Message: domain.ErrInvalidVisibility.Error()}},
}

// mapWorkspaceError turns Workspace domain errors into problem responses;
// anything else passes through and becomes a 500.
func mapWorkspaceError(err error) error {
	switch {
	case errors.Is(err, domain.ErrForbidden):
		return &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}
	case errors.Is(err, domain.ErrWorkspaceNotFound):
		return httpx.ErrNotFound()
	case errors.Is(err, domain.ErrWorkspaceNameTaken):
		return &httpx.Error{Status: http.StatusConflict, Slug: "workspace-name-taken", Title: "Workspace name already in use"}
	}
	return validationOr(err, workspaceFieldErrors)
}
