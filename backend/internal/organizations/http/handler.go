// Package organizationshttp exposes the Organization use cases over HTTP.
// Authentication comes from the identity module, injected by the caller, so
// this package never imports another module.
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

// Service is the part of the Organization application the HTTP layer uses.
type Service interface {
	CreateOrganization(ctx context.Context, actor domain.Actor, in application.CreateOrganizationInput) (domain.Organization, error)
	GetOrganization(ctx context.Context, actor domain.Actor, rawID string) (domain.Organization, error)
	ListOrganizations(ctx context.Context, actor domain.Actor, page application.PageRequest) ([]domain.Organization, int, error)
}

// Auth authenticates requests and tells who is behind them.
type Auth struct {
	// Authenticated rejects requests without a valid session.
	Authenticated func(next httpx.HandlerFunc) httpx.HandlerFunc
	// Actor returns the signed-in User of a request Authenticated let through.
	Actor func(ctx context.Context) domain.Actor
}

// Handler serves the Organization endpoints.
type Handler struct {
	svc    Service
	auth   Auth
	logger *slog.Logger
}

// NewHandler builds a Handler.
func NewHandler(svc Service, auth Auth, logger *slog.Logger) *Handler {
	return &Handler{svc: svc, auth: auth, logger: logger}
}

// organizationLifecycleService is optionally implemented by Service to support
// Organization Pending Deletion and restoration.
type organizationLifecycleService interface {
	DeleteOrganization(ctx context.Context, actor domain.Actor, rawID string) error
	RestoreOrganization(ctx context.Context, actor domain.Actor, rawID string) (domain.Organization, error)
	ListPendingDeletionOrganizations(ctx context.Context, actor domain.Actor, page application.PageRequest) ([]domain.Organization, int, error)
}

// Register adds the Organization routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/organizations", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.create),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/organizations/{organization_id}", map[string]httpx.HandlerFunc{
		http.MethodGet:    h.auth.Authenticated(h.get),
		http.MethodDelete: h.auth.Authenticated(h.delete),
	})
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/organizations/{organization_id}/restore", h.auth.Authenticated(h.restore))
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	q, err := httpx.ParsePageQuery(r)
	if err != nil {
		return err
	}
	page := application.PageRequest{Limit: q.PageSize, Offset: q.Offset()}
	var (
		orgs  []domain.Organization
		total int
	)
	if r.URL.Query().Get("pending_deletion") == "true" {
		lc, ok := h.svc.(organizationLifecycleService)
		if !ok {
			return httpx.ErrNotFound()
		}
		orgs, total, err = lc.ListPendingDeletionOrganizations(r.Context(), h.auth.Actor(r.Context()), page)
	} else {
		orgs, total, err = h.svc.ListOrganizations(r.Context(), h.auth.Actor(r.Context()), page)
	}
	if err != nil {
		return mapError(err)
	}
	items := make([]organizationResponse, 0, len(orgs))
	for _, org := range orgs {
		items = append(items, toOrganizationResponse(org))
	}
	return httpx.WriteJSON(w, http.StatusOK, httpx.NewPageResponse(items, q, total))
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) error {
	org, err := h.svc.GetOrganization(r.Context(), h.auth.Actor(r.Context()), r.PathValue("organization_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toOrganizationResponse(org))
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) error {
	lc, ok := h.svc.(organizationLifecycleService)
	if !ok {
		return httpx.ErrNotFound()
	}
	if err := lc.DeleteOrganization(r.Context(), h.auth.Actor(r.Context()), r.PathValue("organization_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) restore(w http.ResponseWriter, r *http.Request) error {
	lc, ok := h.svc.(organizationLifecycleService)
	if !ok {
		return httpx.ErrNotFound()
	}
	org, err := lc.RestoreOrganization(r.Context(), h.auth.Actor(r.Context()), r.PathValue("organization_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toOrganizationResponse(org))
}

type createRequest struct {
	Name        string `json:"name"`
	OwnerUserID string `json:"owner_user_id"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var req createRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	org, err := h.svc.CreateOrganization(r.Context(), h.auth.Actor(r.Context()),
		application.CreateOrganizationInput{Name: req.Name, OwnerUserID: req.OwnerUserID})
	if err != nil {
		return mapError(err)
	}
	w.Header().Set("Location", "/api/v1/organizations/"+string(org.ID))
	return httpx.WriteJSON(w, http.StatusCreated, toOrganizationResponse(org))
}

type organizationResponse struct {
	ID              domain.OrganizationID `json:"id"`
	Name            string                `json:"name"`
	CreatedAt       time.Time             `json:"created_at"`
	DeletedAt       *time.Time            `json:"deleted_at,omitempty"`
	PurgeAfter      *time.Time            `json:"purge_after,omitempty"`
	CurrentUserRole domain.Role           `json:"current_user_role"`
}

func toOrganizationResponse(org domain.Organization) organizationResponse {
	return organizationResponse{
		ID:              org.ID,
		Name:            org.Name,
		CreatedAt:       org.CreatedAt,
		DeletedAt:       org.DeletedAt,
		PurgeAfter:      org.PurgeAfter,
		CurrentUserRole: org.ViewerRole,
	}
}

// fieldRule ties a domain validation error to the request field it concerns.
type fieldRule struct {
	err   error
	field httpx.FieldError
}

// fieldErrors maps each domain validation error to the request field it concerns.
var fieldErrors = []fieldRule{
	{domain.ErrInvalidName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidName.Error()}},
	{domain.ErrInvalidUserID, httpx.FieldError{Field: "owner_user_id", Code: "invalid", Message: domain.ErrInvalidUserID.Error()}},
	{domain.ErrOwnerNotFound, httpx.FieldError{Field: "owner_user_id", Code: "not_found", Message: domain.ErrOwnerNotFound.Error()}},
}

// mapError turns Organization domain errors into problem responses; anything
// else passes through and becomes a 500.
func mapError(err error) error {
	if errors.Is(err, domain.ErrForbidden) {
		return &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}
	}
	if errors.Is(err, domain.ErrNotFound) {
		return httpx.ErrNotFound()
	}
	if errors.Is(err, domain.ErrUserDeactivated) {
		return errUserDeactivated()
	}
	return validationOr(err, fieldErrors)
}

func errUserDeactivated() *httpx.Error {
	return &httpx.Error{
		Status: http.StatusConflict,
		Slug:   "user-deactivated",
		Title:  "A Deactivated User cannot receive new Memberships",
	}
}

// validationOr reports the fields err concerns as a validation problem, or
// returns err unchanged when it concerns none.
func validationOr(err error, rules []fieldRule) error {
	var fields []httpx.FieldError
	for _, fe := range rules {
		if errors.Is(err, fe.err) {
			fields = append(fields, fe.field)
		}
	}
	if len(fields) > 0 {
		return httpx.ErrValidation(fields...)
	}
	return err
}
