package application

import (
	"context"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// TransitionRuleReader loads a Project's optional Transition Rules for enforcing
// Status moves on Work Items.
type TransitionRuleReader interface {
	ListTransitionRules(ctx context.Context, projectID domain.ProjectID) ([]domain.TransitionRule, error)
}

// NewStatus holds validated fields to create a Status in a Project.
type NewStatus struct {
	ProjectID domain.ProjectID
	Name      string
	Group     domain.StatusGroup
	Position  int
}

// StatusUpdate holds the resolved next state of an existing Status.
type StatusUpdate struct {
	ProjectID domain.ProjectID
	ID        domain.StatusID
	Name      string
	Group     domain.StatusGroup
	Position  int
}

// NewWorkItemType holds validated fields to create a Work Item Type and its
// optional allowed Child Work Item Types atomically.
type NewWorkItemType struct {
	ProjectID           domain.ProjectID
	Name                string
	EstimateUnit        domain.EstimateUnit
	Position            int
	AllowedChildTypeIDs []domain.WorkItemTypeID
}

// WorkItemTypeUpdate holds the resolved next state of an existing Work Item Type.
type WorkItemTypeUpdate struct {
	ProjectID           domain.ProjectID
	ID                  domain.WorkItemTypeID
	Name                string
	EstimateUnit        domain.EstimateUnit
	EstimateUnitChanged bool
	Position            int
	UpdateHierarchy     bool
	AllowedChildTypeIDs []domain.WorkItemTypeID
}

// WorkflowRepository persists customizable Statuses, Work Item Types, hierarchy
// pairs and Transition Rules for Projects.
type WorkflowRepository interface {
	TransitionRuleReader
	CreateStatus(ctx context.Context, in NewStatus) (domain.Status, error)
	UpdateStatus(ctx context.Context, in StatusUpdate) (domain.Status, error)
	DeleteStatus(ctx context.Context, projectID domain.ProjectID, id, replacementID domain.StatusID) error
	CreateWorkItemType(ctx context.Context, in NewWorkItemType) (domain.WorkItemType, error)
	UpdateWorkItemType(ctx context.Context, in WorkItemTypeUpdate) (domain.WorkItemType, error)
	DeleteWorkItemType(ctx context.Context, projectID domain.ProjectID, id, replacementID domain.WorkItemTypeID, replacementUnit domain.EstimateUnit) error
	AddTransitionRule(ctx context.Context, projectID domain.ProjectID, from, to domain.StatusID) (domain.TransitionRule, error)
	RemoveTransitionRule(ctx context.Context, projectID domain.ProjectID, from, to domain.StatusID) error
}
