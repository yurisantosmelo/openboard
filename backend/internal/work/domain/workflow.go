package domain

import "time"

// StatusID identifies a Status inside a Project.
type StatusID string

// StatusGroup is the fixed meaning every Status carries for planning and metrics (ADR 0010).
type StatusGroup string

// The four fixed Status Groups shared across every Project.
const (
	StatusGroupNotCommitted StatusGroup = "not_committed"
	StatusGroupPlanned      StatusGroup = "planned"
	StatusGroupStarted      StatusGroup = "started"
	StatusGroupCompleted    StatusGroup = "completed"
)

// Status is a customizable step of work defined by one Project.
type Status struct {
	ID        StatusID
	ProjectID ProjectID
	Name      string
	Group     StatusGroup
	Position  int
	CreatedAt time.Time
}

// WorkItemTypeID identifies a Work Item Type inside a Project.
type WorkItemTypeID string

// EstimateUnit is the effort unit used by a Work Item Type (CONTEXT.md: Story Points, Hours).
type EstimateUnit string

// Estimate units supported by Work Item Types.
const (
	EstimateUnitStoryPoints EstimateUnit = "story_points"
	EstimateUnitHours       EstimateUnit = "hours"
	EstimateUnitNone        EstimateUnit = "none"
)

// WorkItemType is a customizable kind of Work Item defined by one Project,
// carrying its estimate unit and the Child Work Item Types allowed under it.
type WorkItemType struct {
	ID                  WorkItemTypeID
	ProjectID           ProjectID
	Name                string
	EstimateUnit        EstimateUnit
	Position            int
	AllowedChildTypeIDs []WorkItemTypeID
	CreatedAt           time.Time
}
