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

// LinkService is the Work Item Links portion of the Work Management application.
type LinkService interface {
	ListLinks(ctx context.Context, actor domain.Actor, rawWorkItemID string) ([]domain.Link, error)
	CreateLink(ctx context.Context, actor domain.Actor, rawWorkItemID, rawTargetID, rawKind string) (domain.Link, error)
	DeleteLink(ctx context.Context, actor domain.Actor, rawWorkItemID, rawLinkID string) error
}

// EraService is the Project Eras portion of the Work Management application.
type EraService interface {
	ListEras(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.Era, error)
	CreateEra(ctx context.Context, actor domain.Actor, in application.CreateEraInput) (domain.Era, error)
	UpdateEra(ctx context.Context, actor domain.Actor, in application.UpdateEraInput) (domain.Era, error)
	StartEra(ctx context.Context, actor domain.Actor, rawProjectID, rawEraID string) (domain.Era, error)
	CloseEra(ctx context.Context, actor domain.Actor, rawProjectID, rawEraID string, rawNextEraID *string) (domain.Era, error)
	DeleteEra(ctx context.Context, actor domain.Actor, rawProjectID, rawEraID string) error
}

// LinkHandler serves Work Item Link endpoints.
type LinkHandler struct {
	svc    LinkService
	auth   Auth
	logger *slog.Logger
}

// NewLinkHandler builds a LinkHandler.
func NewLinkHandler(svc LinkService, auth Auth, logger *slog.Logger) *LinkHandler {
	return &LinkHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds Work Item Link routes to mux.
func (h *LinkHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/work-items/{work_item_id}/links", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.create),
	})
	httpx.Route(mux, h.logger, http.MethodDelete, "/api/v1/work-items/{work_item_id}/links/{link_id}",
		h.auth.Authenticated(h.delete))
}

type linkResponse struct {
	ID               domain.LinkID     `json:"id"`
	ProjectID        domain.ProjectID  `json:"project_id"`
	SourceWorkItemID domain.WorkItemID `json:"source_work_item_id"`
	SourceTitle      string            `json:"source_title"`
	TargetWorkItemID domain.WorkItemID `json:"target_work_item_id"`
	TargetTitle      string            `json:"target_title"`
	Kind             domain.LinkKind   `json:"kind"`
	CreatedAt        time.Time         `json:"created_at"`
}

func (h *LinkHandler) list(w http.ResponseWriter, r *http.Request) error {
	links, err := h.svc.ListLinks(r.Context(), h.auth.Actor(r.Context()), r.PathValue("work_item_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]linkResponse, 0, len(links))
	for _, l := range links {
		items = append(items, toLinkResponse(l))
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[linkResponse]{Items: items})
}

type createLinkRequest struct {
	TargetWorkItemID string `json:"target_work_item_id"`
	Kind             string `json:"kind"`
}

func (h *LinkHandler) create(w http.ResponseWriter, r *http.Request) error {
	var req createLinkRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	link, err := h.svc.CreateLink(r.Context(), h.auth.Actor(r.Context()), r.PathValue("work_item_id"), req.TargetWorkItemID, req.Kind)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, toLinkResponse(link))
}

func (h *LinkHandler) delete(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.DeleteLink(r.Context(), h.auth.Actor(r.Context()), r.PathValue("work_item_id"), r.PathValue("link_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func toLinkResponse(l domain.Link) linkResponse {
	return linkResponse{
		ID:               l.ID,
		ProjectID:        l.ProjectID,
		SourceWorkItemID: l.SourceWorkItemID,
		SourceTitle:      l.SourceTitle,
		TargetWorkItemID: l.TargetWorkItemID,
		TargetTitle:      l.TargetTitle,
		Kind:             l.Kind,
		CreatedAt:        l.CreatedAt,
	}
}

// EraHandler serves Project Era endpoints.
type EraHandler struct {
	svc    EraService
	auth   Auth
	logger *slog.Logger
}

// NewEraHandler builds an EraHandler.
func NewEraHandler(svc EraService, auth Auth, logger *slog.Logger) *EraHandler {
	return &EraHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds Project Era routes to mux.
func (h *EraHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/eras", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.create),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/eras/{era_id}", map[string]httpx.HandlerFunc{
		http.MethodPatch:  h.auth.Authenticated(h.update),
		http.MethodDelete: h.auth.Authenticated(h.delete),
	})
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/projects/{project_id}/eras/{era_id}/start",
		h.auth.Authenticated(h.start))
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/projects/{project_id}/eras/{era_id}/close",
		h.auth.Authenticated(h.close))
}

type eraResponse struct {
	ID        domain.EraID     `json:"id"`
	ProjectID domain.ProjectID `json:"project_id"`
	Name      string           `json:"name"`
	Goal      string           `json:"goal"`
	StartDate string           `json:"start_date"`
	EndDate   string           `json:"end_date"`
	State     domain.EraState  `json:"state"`
	ClosedAt  *time.Time       `json:"closed_at"`
	CreatedAt time.Time        `json:"created_at"`
	UpdatedAt time.Time        `json:"updated_at"`
}

func (h *EraHandler) list(w http.ResponseWriter, r *http.Request) error {
	eras, err := h.svc.ListEras(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]eraResponse, 0, len(eras))
	for _, e := range eras {
		items = append(items, toEraResponse(e))
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[eraResponse]{Items: items})
}

type createEraRequest struct {
	Name      string `json:"name"`
	Goal      string `json:"goal"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
}

func (h *EraHandler) create(w http.ResponseWriter, r *http.Request) error {
	var req createEraRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	era, err := h.svc.CreateEra(r.Context(), h.auth.Actor(r.Context()), application.CreateEraInput{
		ProjectID: r.PathValue("project_id"),
		Name:      req.Name,
		Goal:      req.Goal,
		StartDate: req.StartDate,
		EndDate:   req.EndDate,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, toEraResponse(era))
}

type updateEraRequest struct {
	Name      *string `json:"name"`
	Goal      *string `json:"goal"`
	StartDate *string `json:"start_date"`
	EndDate   *string `json:"end_date"`
}

func (h *EraHandler) update(w http.ResponseWriter, r *http.Request) error {
	var req updateEraRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	era, err := h.svc.UpdateEra(r.Context(), h.auth.Actor(r.Context()), application.UpdateEraInput{
		ProjectID: r.PathValue("project_id"),
		EraID:     r.PathValue("era_id"),
		Name:      req.Name,
		Goal:      req.Goal,
		StartDate: req.StartDate,
		EndDate:   req.EndDate,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toEraResponse(era))
}

func (h *EraHandler) start(w http.ResponseWriter, r *http.Request) error {
	era, err := h.svc.StartEra(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), r.PathValue("era_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toEraResponse(era))
}

type closeEraRequest struct {
	NextEraID *string `json:"next_era_id"`
}

func (h *EraHandler) close(w http.ResponseWriter, r *http.Request) error {
	var req closeEraRequest
	if r.ContentLength > 0 {
		if err := httpx.DecodeJSON(w, r, &req); err != nil {
			return err
		}
	}
	era, err := h.svc.CloseEra(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), r.PathValue("era_id"), req.NextEraID)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toEraResponse(era))
}

func (h *EraHandler) delete(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.DeleteEra(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), r.PathValue("era_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func toEraResponse(e domain.Era) eraResponse {
	return eraResponse{
		ID:        e.ID,
		ProjectID: e.ProjectID,
		Name:      e.Name,
		Goal:      e.Goal,
		StartDate: e.StartDate.Format(time.DateOnly),
		EndDate:   e.EndDate.Format(time.DateOnly),
		State:     e.State,
		ClosedAt:  e.ClosedAt,
		CreatedAt: e.CreatedAt,
		UpdatedAt: e.UpdatedAt,
	}
}
