// Package identityhttp exposes the identity use cases over HTTP (signing in
// and out, the signed-in User, password changes) and the middleware that
// authenticates every other API request.
package identityhttp

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/elyosemite/openboard/backend/internal/identity/application"
	"github.com/elyosemite/openboard/backend/internal/identity/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
)

// Service is the part of the identity application the HTTP layer uses.
type Service interface {
	SignIn(ctx context.Context, username, password string) (application.SignInResult, error)
	SignOut(ctx context.Context, token string) error
	Authenticate(ctx context.Context, token string) (application.Principal, error)
	ChangePassword(ctx context.Context, p application.Principal, currentPassword, newPassword string) error
	ListUsers(ctx context.Context, actor application.Principal, page application.PageRequest) ([]domain.User, int, error)
	DeactivateUser(ctx context.Context, actor application.Principal, rawUserID string) (domain.User, error)
	ReactivateUser(ctx context.Context, actor application.Principal, rawUserID string) (domain.User, error)
	IssueTemporaryPassword(ctx context.Context, actor application.Principal, rawUserID string) (application.IssuedTemporaryPassword, error)
}

// Handler serves the identity endpoints.
type Handler struct {
	svc        Service
	logger     *slog.Logger
	retryAfter string
}

// NewHandler builds a Handler. retryAfter is announced to clients blocked by
// the sign-in throttle.
func NewHandler(svc Service, logger *slog.Logger, retryAfter time.Duration) *Handler {
	return &Handler{svc: svc, logger: logger, retryAfter: strconv.Itoa(int(retryAfter.Seconds()))}
}

// Register adds the identity routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/sessions", h.signIn)
	httpx.Route(mux, h.logger, http.MethodDelete, "/api/v1/sessions/current", h.signOut)
	httpx.Route(mux, h.logger, http.MethodGet, "/api/v1/users/me", h.withSession(h.currentUser))
	httpx.Route(mux, h.logger, http.MethodPut, "/api/v1/users/me/password", h.withSession(h.changePassword))
	httpx.Route(mux, h.logger, http.MethodGet, "/api/v1/users", h.Authenticated(h.listUsers))
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/users/{user_id}/deactivate", h.Authenticated(h.deactivateUser))
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/users/{user_id}/reactivate", h.Authenticated(h.reactivateUser))
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/users/{user_id}/temporary-password", h.Authenticated(h.issueTemporaryPassword))
}

type signInRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *Handler) signIn(w http.ResponseWriter, r *http.Request) error {
	var req signInRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	result, err := h.svc.SignIn(r.Context(), req.Username, req.Password)
	if err != nil {
		if isTooManyAttempts(err) {
			w.Header().Set("Retry-After", h.retryAfter)
		}
		return mapError(err)
	}
	setSessionCookie(w, result.Token)
	w.Header().Set("Location", "/api/v1/sessions/current")
	return httpx.WriteJSON(w, http.StatusCreated, toUserResponse(result.User))
}

func (h *Handler) signOut(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.SignOut(r.Context(), sessionToken(r)); err != nil {
		return err
	}
	clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) currentUser(w http.ResponseWriter, r *http.Request) error {
	p, _ := PrincipalFrom(r.Context())
	return httpx.WriteJSON(w, http.StatusOK, toUserResponse(p.User))
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request) error {
	var req changePasswordRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	p, _ := PrincipalFrom(r.Context())
	if err := h.svc.ChangePassword(r.Context(), p, req.CurrentPassword, req.NewPassword); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

type userResponse struct {
	ID                 domain.UserID   `json:"id"`
	Username           domain.Username `json:"username"`
	Name               string          `json:"name"`
	IsAdministrator    bool            `json:"is_administrator"`
	MustChangePassword bool            `json:"must_change_password"`
	DeactivatedAt      *time.Time      `json:"deactivated_at"`
	CreatedAt          time.Time       `json:"created_at"`
}

func toUserResponse(u domain.User) userResponse {
	return userResponse{
		ID:                 u.ID,
		Username:           u.Username,
		Name:               u.Name,
		IsAdministrator:    u.IsAdministrator,
		MustChangePassword: u.MustChangePassword,
		DeactivatedAt:      u.DeactivatedAt,
		CreatedAt:          u.CreatedAt,
	}
}
