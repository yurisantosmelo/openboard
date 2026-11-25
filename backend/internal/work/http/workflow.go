package workhttp

import (
	"net/http"
	"time"

	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

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

type listResponse[T any] struct {
	Items []T `json:"items"`
}

func (h *Handler) listStatuses(w http.ResponseWriter, r *http.Request) error {
	statuses, err := h.svc.ListStatuses(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]statusResponse, 0, len(statuses))
	for _, s := range statuses {
		items = append(items, statusResponse{
			ID:        s.ID,
			ProjectID: s.ProjectID,
			Name:      s.Name,
			Group:     s.Group,
			Position:  s.Position,
			CreatedAt: s.CreatedAt,
		})
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[statusResponse]{Items: items})
}

func (h *Handler) listWorkItemTypes(w http.ResponseWriter, r *http.Request) error {
	types, err := h.svc.ListWorkItemTypes(r.Context(), h.auth.Actor(r.Context()), r.PathValue("project_id"))
	if err != nil {
		return mapError(err)
	}
	items := make([]workItemTypeResponse, 0, len(types))
	for _, wt := range types {
		children := wt.AllowedChildTypeIDs
		if children == nil {
			children = []domain.WorkItemTypeID{}
		}
		items = append(items, workItemTypeResponse{
			ID:                  wt.ID,
			ProjectID:           wt.ProjectID,
			Name:                wt.Name,
			EstimateUnit:        wt.EstimateUnit,
			Position:            wt.Position,
			AllowedChildTypeIDs: children,
			CreatedAt:           wt.CreatedAt,
		})
	}
	return httpx.WriteJSON(w, http.StatusOK, listResponse[workItemTypeResponse]{Items: items})
}
