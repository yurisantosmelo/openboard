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

// WorkflowService is the Project workflow customization portion of the Work
// Management application.
type WorkflowService interface {
	ListStatuses(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.Status, error)
	CreateStatus(ctx context.Context, actor domain.Actor, in application.CreateStatusInput) (domain.Status, error)
	UpdateStatus(ctx context.Context, actor domain.Actor, in application.UpdateStatusInput) (domain.Status, error)
	DeleteStatus(ctx context.Context, actor domain.Actor, rawProjectID, rawStatusID, rawReplacementID string) error
	ListWorkItemTypes(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.WorkItemType, error)
	CreateWorkItemType(ctx context.Context, actor domain.Actor, in application.CreateWorkItemTypeInput) (domain.WorkItemType, error)
	UpdateWorkItemType(ctx context.Context, actor domain.Actor, in application.UpdateWorkItemTypeInput) (domain.WorkItemType, error)
	DeleteWorkItemType(ctx context.Context, actor domain.Actor, rawProjectID, rawTypeID, rawReplacementID string) error
	ListTransitionRules(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.TransitionRule, error)
	AddTransitionRule(ctx context.Context, actor domain.Actor, rawProjectID, rawFromID, rawToID string) (domain.TransitionRule, error)
	RemoveTransitionRule(ctx context.Context, actor domain.Actor, rawProjectID, rawFromID, rawToID string) error
}

// WorkflowHandler serves Project workflow endpoints (Statuses, Work Item Types,
// hierarchy and Transition Rules).
type WorkflowHandler struct {
	svc    WorkflowService
	auth   Auth
	logger *slog.Logger
}

// NewWorkflowHandler builds a WorkflowHandler.
func NewWorkflowHandler(svc WorkflowService, auth Auth, logger *slog.Logger) *WorkflowHandler {
	return &WorkflowHandler{svc: svc, auth: auth, logger: logger}
}

// Register adds all Project workflow routes to mux.
func (h *WorkflowHandler) Register(mux *http.ServeMux) {
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/statuses", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.listStatuses),
		http.MethodPost: h.auth.Authenticated(h.createStatus),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/statuses/{status_id}", map[string]httpx.HandlerFunc{
		http.MethodPatch:  h.auth.Authenticated(h.updateStatus),
		http.MethodDelete: h.auth.Authenticated(h.deleteStatus),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/work-item-types", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.listWorkItemTypes),
		http.MethodPost: h.auth.Authenticated(h.createWorkItemType),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/work-item-types/{type_id}", map[string]httpx.HandlerFunc{
		http.MethodPatch:  h.auth.Authenticated(h.updateWorkItemType),
		http.MethodDelete: h.auth.Authenticated(h.deleteWorkItemType),
	})
	httpx.RouteMethods(mux, h.logger, "/api/v1/projects/{project_id}/transition-rules", map[string]httpx.HandlerFunc{
		http.MethodGet:  h.auth.Authenticated(h.listTransitionRules),
		http.MethodPost: h.auth.Authenticated(h.addTransitionRule),
	})
	httpx.Route(mux, h.logger, http.MethodDelete, "/api/v1/projects/{project_id}/transition-rules/{from_status_id}/{to_status_id}",
		h.auth.Authenticated(h.removeTransitionRule))
}

type statusResponse struct {
	ID        domain.StatusID    `json:"id"`
	ProjectID domain.ProjectID   `json:"project_id"`
	Name      string             `json:"name"`
	Group     domain.StatusGroup `json:"status_group"`
	Position  int                `json:"position"`
	CreatedAt time.Time          `json:"created_at"`
}

type workItemTypeResponse struct {
	ID                  domain.WorkItemTypeID   `json:"id"`
	ProjectID           domain.ProjectID        `json:"project_id"`
	Name                string                  `json:"name"`
	EstimateUnit        domain.EstimateUnit     `json:"estimate_unit"`
	Position            int                     `json:"position"`
	AllowedChildTypeIDs []domain.WorkItemTypeID `json:"allowed_child_type_ids"`
	CreatedAt           time.Time               `json:"created_at"`
}

type transitionRuleResponse struct {
	ProjectID    domain.ProjectID `json:"project_id"`
	FromStatusID domain.StatusID  `json:"from_status_id"`
	ToStatusID   domain.StatusID  `json:"to_status_id"`
	CreatedAt    time.Time        `json:"created_at"`
}

type listResponse[T any] struct {
	Items []T `json:"items"`
}

func (h *WorkflowHandler) listStatuses(w http.ResponseWriter, r *http.Request) error {
	statuses, err := h.svc.ListStatuses(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]statusResponse, 0, len(statuses))
	for _, s := range statuses {
		items = append(items, toStatusResponse(s))
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[statusResponse]{Items: items})
}

type createStatusRequest struct {
	Name     string `json:"name"`
	Group    string `json:"status_group"`
	Position *int   `json:"position"`
}

func (h *WorkflowHandler) createStatus(w http.ResponseWriter, r *http.Request) error {
	var req createStatusRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	status, err := h.svc.CreateStatus(r.Context(), h.auth.Actor(r.Context()), application.CreateStatusInput{
		ProjectID: r.PathValue("project_id"), Name: req.Name, Group: req.Group, Position: req.Position,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, toStatusResponse(status))
}

type updateStatusRequest struct {
	Name     *string `json:"name"`
	Group    *string `json:"status_group"`
	Position *int    `json:"position"`
}

func (h *WorkflowHandler) updateStatus(w http.ResponseWriter, r *http.Request) error {
	var req updateStatusRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	status, err := h.svc.UpdateStatus(r.Context(), h.auth.Actor(r.Context()), application.UpdateStatusInput{
		ProjectID: r.PathValue("project_id"),
		StatusID:  r.PathValue("status_id"),
		Name:      req.Name,
		Group:     req.Group,
		Position:  req.Position,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toStatusResponse(status))
}

func (h *WorkflowHandler) deleteStatus(w http.ResponseWriter, r *http.Request) error {
	err := h.svc.DeleteStatus(
		r.Context(),
		h.auth.Actor(r.Context()),
		r.PathValue("project_id"),
		r.PathValue("status_id"),
		r.URL.Query().Get("replacement_status_id"),
	)
	if err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *WorkflowHandler) listWorkItemTypes(w http.ResponseWriter, r *http.Request) error {
	types, err := h.svc.ListWorkItemTypes(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]workItemTypeResponse, 0, len(types))
	for _, wt := range types {
		items = append(items, toWorkItemTypeResponse(wt))
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[workItemTypeResponse]{Items: items})
}

type createWorkItemTypeRequest struct {
	Name                string   `json:"name"`
	EstimateUnit        string   `json:"estimate_unit"`
	Position            *int     `json:"position"`
	AllowedChildTypeIDs []string `json:"allowed_child_type_ids"`
}

func (h *WorkflowHandler) createWorkItemType(w http.ResponseWriter, r *http.Request) error {
	var req createWorkItemTypeRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	wt, err := h.svc.CreateWorkItemType(r.Context(), h.auth.Actor(r.Context()), application.CreateWorkItemTypeInput{
		ProjectID:           r.PathValue("project_id"),
		Name:                req.Name,
		EstimateUnit:        req.EstimateUnit,
		Position:            req.Position,
		AllowedChildTypeIDs: req.AllowedChildTypeIDs,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, toWorkItemTypeResponse(wt))
}

type updateWorkItemTypeRequest struct {
	Name                *string   `json:"name"`
	EstimateUnit        *string   `json:"estimate_unit"`
	Position            *int      `json:"position"`
	AllowedChildTypeIDs *[]string `json:"allowed_child_type_ids"`
}

func (h *WorkflowHandler) updateWorkItemType(w http.ResponseWriter, r *http.Request) error {
	var req updateWorkItemTypeRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	wt, err := h.svc.UpdateWorkItemType(r.Context(), h.auth.Actor(r.Context()), application.UpdateWorkItemTypeInput{
		ProjectID:           r.PathValue("project_id"),
		WorkItemTypeID:      r.PathValue("type_id"),
		Name:                req.Name,
		EstimateUnit:        req.EstimateUnit,
		Position:            req.Position,
		AllowedChildTypeIDs: req.AllowedChildTypeIDs,
	})
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusOK, toWorkItemTypeResponse(wt))
}

func (h *WorkflowHandler) deleteWorkItemType(w http.ResponseWriter, r *http.Request) error {
	err := h.svc.DeleteWorkItemType(
		r.Context(),
		h.auth.Actor(r.Context()),
		r.PathValue("project_id"),
		r.PathValue("type_id"),
		r.URL.Query().Get("replacement_type_id"),
	)
	if err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *WorkflowHandler) listTransitionRules(w http.ResponseWriter, r *http.Request) error {
	rules, err := h.svc.ListTransitionRules(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]transitionRuleResponse, 0, len(rules))
	for _, rule := range rules {
		items = append(items, toTransitionRuleResponse(rule))
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[transitionRuleResponse]{Items: items})
}

type addTransitionRuleRequest struct {
	FromStatusID string `json:"from_status_id"`
	ToStatusID   string `json:"to_status_id"`
}

func (h *WorkflowHandler) addTransitionRule(w http.ResponseWriter, r *http.Request) error {
	var req addTransitionRuleRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		return err
	}
	rule, err := h.svc.AddTransitionRule(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"), req.FromStatusID, req.ToStatusID)
	if err != nil {
		return mapError(err)
	}
	return httpx.WriteJSON(w, http.StatusCreated, toTransitionRuleResponse(rule))
}

func (h *WorkflowHandler) removeTransitionRule(w http.ResponseWriter, r *http.Request) error {
	err := h.svc.RemoveTransitionRule(
		r.Context(),
		h.auth.Actor(r.Context()),
		r.PathValue("project_id"),
		r.PathValue("from_status_id"),
		r.PathValue("to_status_id"),
	)
	if err != nil {
		return mapError(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func toStatusResponse(s domain.Status) statusResponse {
	return statusResponse{
		ID:        s.ID,
		ProjectID: s.ProjectID,
		Name:      s.Name,
		Group:     s.Group,
		Position:  s.Position,
		CreatedAt: s.CreatedAt,
	}
}

func toWorkItemTypeResponse(wt domain.WorkItemType) workItemTypeResponse {
	children := wt.AllowedChildTypeIDs
	if children == nil {
		children = []domain.WorkItemTypeID{}
	}
	return workItemTypeResponse{
		ID:                  wt.ID,
		ProjectID:           wt.ProjectID,
		Name:                wt.Name,
		EstimateUnit:        wt.EstimateUnit,
		Position:            wt.Position,
		AllowedChildTypeIDs: children,
		CreatedAt:           wt.CreatedAt,
	}
}

func toTransitionRuleResponse(rule domain.TransitionRule) transitionRuleResponse {
	return transitionRuleResponse{
		ProjectID:    rule.ProjectID,
		FromStatusID: rule.FromStatusID,
		ToStatusID:   rule.ToStatusID,
		CreatedAt:    rule.CreatedAt,
	}
}
