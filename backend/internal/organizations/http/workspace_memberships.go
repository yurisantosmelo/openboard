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

// WorkspaceMembershipService is the part of the Workspace Membership
// application the HTTP layer uses.
type WorkspaceMembershipService interface {
	ListMemberships(ctx context.Context, actor domain.Actor, rawWorkspaceID string, page application.PageRequest) ([]domain.WorkspaceMembership, int, error)
	AddMembership(ctx context.Context, actor domain.Actor, in application.AddWorkspaceMembershipInput) (domain.WorkspaceMembership, error)
	UpdateMembership(ctx context.Context, actor domain.Actor, in application.UpdateWorkspaceMembershipInput) (domain.WorkspaceMembership, error)
	RemoveMembership(ctx context.Context, actor domain.Actor, in application.RemoveWorkspaceMembershipInput) error
}

// WorkspaceMembershipHandler serves the Workspace Membership endpoints.
type WorkspaceMembershipHandler struct {
	svc    WorkspaceMembershipService
	auth   Auth
	logger *slog.Logger
}

// NewWorkspaceMembershipHandler builds a WorkspaceMembershipHandler.
func NewWorkspaceMembershipHandler(svc WorkspaceMembershipService, auth Auth, logger *slog.Logger) *WorkspaceMembershipHandler {
	return &WorkspaceMembershipHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds the Workspace Membership routes to mux.
func (h *WorkspaceMembershipHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/workspaces/{workspace_id}/memberships", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.add),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/workspaces/{workspace_id}/memberships/{user_id}", map[string]httpx.HandlerFunc{
		http.MethodPatch:  h.auth.Authenticated(h.update),
		http.MethodDelete: h.auth.Authenticated(h.remove),
	})
}

func (h *WorkspaceMembershipHandler) list(w http.ResponseWriter, r *http.Request) error {
	q, err := httpx.ParsePageQuery(r)
	if err != nil {
		return err
	}
	memberships, total, err := h.svc.ListMemberships(r.Context(), h.auth.Actor(r.Context()), r.PathValue("workspace_id"),
		application.PageRequest{Limit: q.PageSize, Offset: q.Offset()})
	if err != nil {
		return mapWorkspaceMembershipError(err)
	}
	items := make([]workspaceMembershipResponse, 0, len(memberships))
	for _, m := range memberships {
		items = append(items, toWorkspaceMembershipResponse(m))
	}
	return httpx.WriteJSON(w, http.StatusOK, httpx.NewPageResponse(items, q, total))
}

type addWorkspaceMembershipRequest struct {
	Username string `json:"username"`
	Role     string `json:"role"`
}

func (h *WorkspaceMembershipHandler) add(w http.ResponseWriter, r *http.Request) error {
	var req addWorkspaceMembershipRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	m, err := h.svc.AddMembership(r.Context(), h.auth.Actor(r.Context()), application.AddWorkspaceMembershipInput{
		WorkspaceID: r.PathValue("workspace_id"),
		Username:    req.Username,
		Role:        req.Role,
	})
	if err != nil {
		return mapWorkspaceMembershipError(err)
	}
	w.Header().Set("Location", "/api/v1/workspaces/"+string(m.WorkspaceID)+"/memberships/"+string(m.UserID))
	return httpx.WriteJSON(w, http.StatusCreated, toWorkspaceMembershipResponse(m))
}

func (h *WorkspaceMembershipHandler) update(w http.ResponseWriter, r *http.Request) error {
	var req updateMembershipRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	m, err := h.svc.UpdateMembership(r.Context(), h.auth.Actor(r.Context()), application.UpdateWorkspaceMembershipInput{
		WorkspaceID: r.PathValue("workspace_id"),
		UserID:      r.PathValue("user_id"),
		Role:        req.Role,
	})
	if err != nil {
		return mapWorkspaceMembershipError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toWorkspaceMembershipResponse(m))
}

func (h *WorkspaceMembershipHandler) remove(w http.ResponseWriter, r *http.Request) error {
	err := h.svc.RemoveMembership(r.Context(), h.auth.Actor(r.Context()), application.RemoveWorkspaceMembershipInput{
		WorkspaceID: r.PathValue("workspace_id"),
		UserID:      r.PathValue("user_id"),
	})
	if err != nil {
		return mapWorkspaceMembershipError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

type workspaceMembershipResponse struct {
	WorkspaceID    domain.WorkspaceID    `json:"workspace_id"`
	OrganizationID domain.OrganizationID `json:"organization_id"`
	UserID         domain.UserID         `json:"user_id"`
	Username       string                `json:"username"`
	Name           string                `json:"name"`
	Role           domain.Role           `json:"role"`
	CreatedAt      time.Time             `json:"created_at"`
}

func toWorkspaceMembershipResponse(m domain.WorkspaceMembership) workspaceMembershipResponse {
	return workspaceMembershipResponse{
		WorkspaceID:    m.WorkspaceID,
		OrganizationID: m.OrganizationID,
		UserID:         m.UserID,
		Username:       m.Username,
		Name:           m.Name,
		Role:           m.Role,
		CreatedAt:      m.CreatedAt,
	}
}

var workspaceMembershipFieldErrors = []fieldRule{
	{domain.ErrInvalidUsername, httpx.FieldError{Field: "username", Code: "invalid", Message: domain.ErrInvalidUsername.Error()}},
	{domain.ErrOrganizationMemberNotFound, httpx.FieldError{Field: "username", Code: "not_found", Message: domain.ErrOrganizationMemberNotFound.Error()}},
	{domain.ErrInvalidWorkspaceRole, httpx.FieldError{Field: "role", Code: "invalid", Message: domain.ErrInvalidWorkspaceRole.Error()}},
}

func mapWorkspaceMembershipError(err error) error {
	switch {
	case errors.Is(err, domain.ErrForbidden):
		return &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}
	case errors.Is(err, domain.ErrWorkspaceNotFound), errors.Is(err, domain.ErrWorkspaceMembershipNotFound):
		return httpx.ErrNotFound()
	case errors.Is(err, domain.ErrWorkspaceMembershipExists):
		return &httpx.Error{Status: http.StatusConflict, Slug: "workspace-membership-exists", Title: "User already belongs to this Workspace"}
	case errors.Is(err, domain.ErrUserDeactivated):
		return errUserDeactivated()
	case errors.Is(err, domain.ErrWorkspaceArchived):
		return &httpx.Error{Status: http.StatusConflict, Slug: "workspace-archived", Title: "Workspace is archived and read-only"}
	}
	return validationOr(err, workspaceMembershipFieldErrors)
}
