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

// MembershipService is the part of the Organization Membership application the
// HTTP layer uses.
type MembershipService interface {
	ListMemberships(ctx context.Context, actor domain.Actor, rawOrganizationID string, page application.PageRequest) ([]domain.OrganizationMembership, int, error)
	AddMembership(ctx context.Context, actor domain.Actor, in application.AddOrganizationMembershipInput) (application.AddedOrganizationMembership, error)
}

// MembershipHandler serves the Organization Membership endpoints.
type MembershipHandler struct {
	svc    MembershipService
	auth   Auth
	logger *slog.Logger
}

// NewMembershipHandler builds a MembershipHandler.
func NewMembershipHandler(svc MembershipService, auth Auth, logger *slog.Logger) *MembershipHandler {
	return &MembershipHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds the Organization Membership routes to mux.
func (h *MembershipHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/organizations/{organization_id}/memberships", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.add),
	})
}

func (h *MembershipHandler) list(w http.ResponseWriter, r *http.Request) error {
	q, err := httpx.ParsePageQuery(r)
	if err != nil {
		return err
	}
	memberships, total, err := h.svc.ListMemberships(r.Context(), h.auth.Actor(r.Context()), r.PathValue("organization_id"),
		application.PageRequest{Limit: q.PageSize, Offset: q.Offset()})
	if err != nil {
		return mapMembershipError(err)
	}
	items := make([]membershipResponse, 0, len(memberships))
	for _, m := range memberships {
		items = append(items, toMembershipResponse(m))
	}
	return httpx.WriteJSON(w, http.StatusOK, httpx.NewPageResponse(items, q, total))
}

type addMembershipRequest struct {
	Username string `json:"username"`
	Name     string `json:"name"`
	Role     string `json:"role"`
}

func (h *MembershipHandler) add(w http.ResponseWriter, r *http.Request) error {
	var req addMembershipRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	added, err := h.svc.AddMembership(r.Context(), h.auth.Actor(r.Context()), application.AddOrganizationMembershipInput{
		OrganizationID: r.PathValue("organization_id"),
		Username:       req.Username,
		Name:           req.Name,
		Role:           req.Role,
	})
	if err != nil {
		return mapMembershipError(err)
	}
	m := added.Membership
	w.Header().Set("Location", "/api/v1/organizations/"+string(m.OrganizationID)+"/memberships/"+string(m.UserID))
	return httpx.WriteJSON(w, http.StatusCreated, addedMembershipResponse{
		membershipResponse: toMembershipResponse(m),
		TemporaryPassword:  added.TemporaryPassword,
	})
}

type membershipResponse struct {
	OrganizationID domain.OrganizationID `json:"organization_id"`
	UserID         domain.UserID         `json:"user_id"`
	Username       string                `json:"username"`
	Name           string                `json:"name"`
	Role           domain.Role           `json:"role"`
	CreatedAt      time.Time             `json:"created_at"`
}

type addedMembershipResponse struct {
	membershipResponse
	TemporaryPassword string `json:"temporary_password,omitempty"`
}

func toMembershipResponse(m domain.OrganizationMembership) membershipResponse {
	return membershipResponse{
		OrganizationID: m.OrganizationID,
		UserID:         m.UserID,
		Username:       m.Username,
		Name:           m.Name,
		Role:           m.Role,
		CreatedAt:      m.CreatedAt,
	}
}

var membershipFieldErrors = []fieldRule{
	{domain.ErrInvalidUsername, httpx.FieldError{Field: "username", Code: "invalid", Message: domain.ErrInvalidUsername.Error()}},
	{domain.ErrInvalidName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidName.Error()}},
	{domain.ErrInvalidRole, httpx.FieldError{Field: "role", Code: "invalid", Message: domain.ErrInvalidRole.Error()}},
}

func mapMembershipError(err error) error {
	switch {
	case errors.Is(err, domain.ErrForbidden):
		return &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}
	case errors.Is(err, domain.ErrNotFound):
		return httpx.ErrNotFound()
	case errors.Is(err, domain.ErrMembershipExists):
		return &httpx.Error{Status: http.StatusConflict, Slug: "organization-membership-exists", Title: "User already belongs to this Organization"}
	}
	return validationOr(err, membershipFieldErrors)
}
