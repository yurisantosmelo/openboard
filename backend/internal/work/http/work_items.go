package workhttp

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// WorkItemService is the Work Item portion of the Work Management application.
type WorkItemService interface {
	CreateWorkItem(ctx context.Context, actor domain.Actor, in application.CreateWorkItemInput) (domain.WorkItem, error)
	ListWorkItems(ctx context.Context, actor domain.Actor, rawProjectID string, filter application.ListWorkItemsFilter, page application.PageRequest) ([]domain.WorkItem, int, error)
	GetWorkItem(ctx context.Context, actor domain.Actor, rawWorkItemID string) (domain.WorkItem, error)
	UpdateWorkItem(ctx context.Context, actor domain.Actor, in application.UpdateWorkItemInput) (domain.WorkItem, error)
	TransitionWorkItem(ctx context.Context, actor domain.Actor, rawWorkItemID, rawStatusID string) (domain.WorkItem, error)
	DeleteWorkItem(ctx context.Context, actor domain.Actor, rawWorkItemID string) error
}

// WorkItemHandler serves the Work Item HTTP endpoints.
type WorkItemHandler struct {
	svc    WorkItemService
	auth   Auth
	logger *slog.Logger
}

// NewWorkItemHandler builds a WorkItemHandler.
func NewWorkItemHandler(svc WorkItemService, auth Auth, logger *slog.Logger) *WorkItemHandler {
	return &WorkItemHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds the Work Item routes to mux.
func (h *WorkItemHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/work-items", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.list),
		http.MethodPost: h.auth.Authenticated(h.create),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/work-items/{work_item_id}", map[string]httpx.HandlerFunc{
		http.MethodGet:    h.auth.Authenticated(h.get),
		http.MethodPatch:  h.auth.Authenticated(h.update),
		http.MethodDelete: h.auth.Authenticated(h.delete),
	})
	httpx.Route(mux, h.logger, http.MethodPost, "/api/v1/work-items/{work_item_id}/transitions", h.auth.Authenticated(h.transition))
}

func (h *WorkItemHandler) list(w http.ResponseWriter, r *http.Request) error {
	q, err := httpx.ParsePageQuery(r)
	if err != nil {
		return err
	}
	query := r.URL.Query()
	filter := application.ListWorkItemsFilter{
		StatusID:       query.Get("status_id"),
		WorkItemTypeID: query.Get("work_item_type_id"),
		Priority:       query.Get("priority"),
		AssigneeID:     query.Get("assignee_id"),
	}
	items, total, err := h.svc.ListWorkItems(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), filter,
		application.PageRequest{Limit: q.PageSize, Offset: q.Offset()})
	if err != nil {
		return mapError(err)
	}
	out := make([]workItemResponse, 0, len(items))
	for _, item := range items {
		out = append(out, toWorkItemResponse(item))
	}
	return httpx.WriteJSON(w, http.StatusOK, httpx.NewPageResponse(out, q, total))
}

type createWorkItemRequest struct {
	WorkItemTypeID string   `json:"work_item_type_id"`
	StatusID       *string  `json:"status_id"`
	ParentID       *string  `json:"parent_id"`
	AssigneeID     *string  `json:"assignee_id"`
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Priority       string   `json:"priority"`
	StoryPoints    *float64 `json:"story_points"`
	Hours          *float64 `json:"hours"`
}

func (h *WorkItemHandler) create(w http.ResponseWriter, r *http.Request) error {
	var req createWorkItemRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	item, err := h.svc.CreateWorkItem(r.Context(), h.auth.Actor(r.Context()), application.CreateWorkItemInput{
		ProjectID:      r.PathValue("project_id"),
		WorkItemTypeID: req.WorkItemTypeID,
		StatusID:       req.StatusID,
		ParentID:       req.ParentID,
		AssigneeID:     req.AssigneeID,
		Title:          req.Title,
		Description:    req.Description,
		Priority:       req.Priority,
		StoryPoints:    req.StoryPoints,
		Hours:          req.Hours,
	})
	if err != nil {
		return mapError(err)
	}
	w.Header().Set("Location", "/api/v1/work-items/"+string(item.ID))
	return httpx.WriteJSON(w, http.StatusCreated, toWorkItemResponse(item))
}

func (h *WorkItemHandler) get(w http.ResponseWriter, r *http.Request) error {
	item, err := h.svc.GetWorkItem(r.Context(), h.auth.Actor(r.Context()), r.PathValue("work_item_id"))
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toWorkItemResponse(item))
}

type nullableField[T any] struct {
	set   bool
	value *T
}

func (n *nullableField[T]) UnmarshalJSON(data []byte) error {
	n.set = true
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		n.value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	n.value = &v
	return nil
}

func (n nullableField[T]) optional() application.Optional[T] {
	return application.Optional[T]{Set: n.set, Value: n.value}
}

type updateWorkItemRequest struct {
	Title          *string                `json:"title"`
	Description    *string                `json:"description"`
	Priority       *string                `json:"priority"`
	WorkItemTypeID *string                `json:"work_item_type_id"`
	ParentID       nullableField[string]  `json:"parent_id"`
	AssigneeID     nullableField[string]  `json:"assignee_id"`
	StoryPoints    nullableField[float64] `json:"story_points"`
	Hours          nullableField[float64] `json:"hours"`
}

func (h *WorkItemHandler) update(w http.ResponseWriter, r *http.Request) error {
	var req updateWorkItemRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	item, err := h.svc.UpdateWorkItem(r.Context(), h.auth.Actor(r.Context()), application.UpdateWorkItemInput{
		ID:             r.PathValue("work_item_id"),
		Title:          req.Title,
		Description:    req.Description,
		Priority:       req.Priority,
		WorkItemTypeID: req.WorkItemTypeID,
		ParentID:       req.ParentID.optional(),
		AssigneeID:     req.AssigneeID.optional(),
		StoryPoints:    req.StoryPoints.optional(),
		Hours:          req.Hours.optional(),
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toWorkItemResponse(item))
}

type transitionWorkItemRequest struct {
	StatusID string `json:"status_id"`
}

func (h *WorkItemHandler) transition(w http.ResponseWriter, r *http.Request) error {
	var req transitionWorkItemRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	item, err := h.svc.TransitionWorkItem(r.Context(), h.auth.Actor(r.Context()), r.PathValue("work_item_id"), req.StatusID)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toWorkItemResponse(item))
}

func (h *WorkItemHandler) delete(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.DeleteWorkItem(r.Context(), h.auth.Actor(r.Context()), r.PathValue("work_item_id")); err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

type workItemResponse struct {
	ID               domain.WorkItemID     `json:"id"`
	OrganizationID   domain.OrganizationID `json:"organization_id"`
	ProjectID        domain.ProjectID      `json:"project_id"`
	WorkItemTypeID   domain.WorkItemTypeID `json:"work_item_type_id"`
	StatusID         domain.StatusID       `json:"status_id"`
	ParentID         *domain.WorkItemID    `json:"parent_id"`
	AssigneeID       *domain.UserID        `json:"assignee_id"`
	AssigneeUsername string                `json:"assignee_username,omitempty"`
	AssigneeName     string                `json:"assignee_name,omitempty"`
	Title            string                `json:"title"`
	Description      string                `json:"description"`
	Priority         domain.Priority       `json:"priority"`
	StoryPoints      *float64              `json:"story_points"`
	Hours            *float64              `json:"hours"`
	CreatedBy        domain.UserID         `json:"created_by"`
	CreatedAt        time.Time             `json:"created_at"`
	UpdatedAt        time.Time             `json:"updated_at"`
	CurrentUserRole  domain.Role           `json:"current_user_role"`
}

func toWorkItemResponse(w domain.WorkItem) workItemResponse {
	return workItemResponse{
		ID:               w.ID,
		OrganizationID:   w.OrganizationID,
		ProjectID:        w.ProjectID,
		WorkItemTypeID:   w.WorkItemTypeID,
		StatusID:         w.StatusID,
		ParentID:         w.ParentID,
		AssigneeID:       w.AssigneeID,
		AssigneeUsername: w.AssigneeUsername,
		AssigneeName:     w.AssigneeName,
		Title:            w.Title,
		Description:      w.Description,
		Priority:         w.Priority,
		StoryPoints:      w.StoryPoints,
		Hours:            w.Hours,
		CreatedBy:        w.CreatedBy,
		CreatedAt:        w.CreatedAt,
		UpdatedAt:        w.UpdatedAt,
		CurrentUserRole:  w.ViewerRole,
	}
}
