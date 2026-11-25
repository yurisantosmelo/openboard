package identityhttp

import (
	"net/http"

	"github.com/elyosemite/openboard/backend/internal/identity/application"
	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
)

type temporaryPasswordResponse struct {
	userResponse
	TemporaryPassword string `json:"temporary_password"`
}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) error {
	q, err := httpx.ParsePageQuery(r)
	if err != nil {
		return err
	}
	p, _ := PrincipalFrom(r.Context())
	users, total, err := h.svc.ListUsers(r.Context(), p, application.PageRequest{Limit: q.PageSize, Offset: q.Offset()})
	if err != nil {
		return mapError(err)
	}
	items := make([]userResponse, 0, len(users))
	for _, u := range users {
		items = append(items, toUserResponse(u))
	}
	return httpx.WriteJSON(w, http.StatusOK, httpx.NewPageResponse(items, q, total))
}

func (h *Handler) deactivateUser(w http.ResponseWriter, r *http.Request) error {
	p, _ := PrincipalFrom(r.Context())
	user, err := h.svc.DeactivateUser(r.Context(), p, r.PathValue("user_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toUserResponse(user))
}

func (h *Handler) reactivateUser(w http.ResponseWriter, r *http.Request) error {
	p, _ := PrincipalFrom(r.Context())
	user, err := h.svc.ReactivateUser(r.Context(), p, r.PathValue("user_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toUserResponse(user))
}

func (h *Handler) issueTemporaryPassword(w http.ResponseWriter, r *http.Request) error {
	p, _ := PrincipalFrom(r.Context())
	issued, err := h.svc.IssueTemporaryPassword(r.Context(), p, r.PathValue("user_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, temporaryPasswordResponse{
		userResponse:      toUserResponse(issued.User),
		TemporaryPassword: issued.TemporaryPassword,
	})
}
