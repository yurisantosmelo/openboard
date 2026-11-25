package domain

import (
	"errors"
	"math"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxWorkItemTitleLength = 255
	maxEstimateValue       = 999999.99
)

var (
	// ErrWorkItemNotFound reports a Work Item that does not exist or that the Actor cannot see (ADR 0003).
	ErrWorkItemNotFound = errors.New("work item not found")
	// ErrInvalidTitle reports a blank or oversized Work Item title.
	ErrInvalidTitle = errors.New("title must be 1-255 characters and not blank")
	// ErrInvalidPriority reports a Priority outside the fixed five-level scale.
	ErrInvalidPriority = errors.New("priority must be urgent, high, medium, low or none")
	// ErrInvalidEstimate reports an estimate that violates the Work Item Type's estimate unit or range.
	ErrInvalidEstimate = errors.New("estimate does not match the work item type or is out of range")
	// ErrInvalidWorkItemType reports a Work Item Type reference that is malformed or not in the Project.
	ErrInvalidWorkItemType = errors.New("work item type does not belong to this project")
	// ErrInvalidStatus reports a Status reference that is malformed or not in the Project.
	ErrInvalidStatus = errors.New("status does not belong to this project")
	// ErrInvalidParent reports a Parent reference that is malformed, outside the Project, or disallowed by the hierarchy.
	ErrInvalidParent = errors.New("parent work item is invalid or disallowed by project hierarchy")
	// ErrParentCycle reports a Parent assignment that would create a cycle in the Work Item hierarchy.
	ErrParentCycle = errors.New("parent assignment would create a cycle")
	// ErrInvalidAssignee reports an Assignee who is malformed, Deactivated, or cannot enter the Workspace.
	ErrInvalidAssignee = errors.New("assignee must be an active user with access to this workspace")
)

// WorkItemID identifies a Work Item.
type WorkItemID string

// Priority is the fixed five-level importance scale shared by all Work Items (CONTEXT.md).
type Priority string

// Fixed Priority levels.
const (
	PriorityUrgent Priority = "urgent"
	PriorityHigh   Priority = "high"
	PriorityMedium Priority = "medium"
	PriorityLow    Priority = "low"
	PriorityNone   Priority = "none"
)

// WorkItem is the fundamental unit of planned and executed work inside one Project.
type WorkItem struct {
	ID               WorkItemID
	OrganizationID   OrganizationID
	ProjectID        ProjectID
	WorkItemTypeID   WorkItemTypeID
	StatusID         StatusID
	ParentID         *WorkItemID
	AssigneeID       *UserID
	AssigneeUsername string
	AssigneeName     string
	Title            string
	Description      string
	Priority         Priority
	StoryPoints      *float64
	Hours            *float64
	CreatedBy        UserID
	CreatedAt        time.Time
	UpdatedAt        time.Time
	// ViewerRole is the effective role the Actor holds in the Project's Workspace.
	ViewerRole Role
}

// ParseWorkItemID normalizes a Work Item path ID; non-UUID values name no Work Item.
func ParseWorkItemID(raw string) (WorkItemID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrWorkItemNotFound
	}
	return WorkItemID(id), nil
}

// ParseWorkItemTypeRef parses a Work Item Type UUID reference from input.
func ParseWorkItemTypeRef(raw string) (WorkItemTypeID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidWorkItemType
	}
	return WorkItemTypeID(id), nil
}

// ParseStatusRef parses a Status UUID reference from input.
func ParseStatusRef(raw string) (StatusID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidStatus
	}
	return StatusID(id), nil
}

// ParseParentRef parses a Parent Work Item UUID reference from input.
func ParseParentRef(raw string) (WorkItemID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidParent
	}
	return WorkItemID(id), nil
}

// ParseAssigneeRef parses an Assignee User UUID reference from input.
func ParseAssigneeRef(raw string) (UserID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidAssignee
	}
	return UserID(id), nil
}

// ParseWorkItemTitle trims a Work Item title and verifies it is neither blank nor oversized.
func ParseWorkItemTitle(raw string) (string, error) {
	title := strings.TrimSpace(raw)
	if title == "" || utf8.RuneCountInString(title) > maxWorkItemTitleLength {
		return "", ErrInvalidTitle
	}
	return title, nil
}

// ParsePriority validates a non-empty Priority value.
func ParsePriority(raw string) (Priority, error) {
	switch Priority(strings.ToLower(strings.TrimSpace(raw))) {
	case PriorityUrgent:
		return PriorityUrgent, nil
	case PriorityHigh:
		return PriorityHigh, nil
	case PriorityMedium:
		return PriorityMedium, nil
	case PriorityLow:
		return PriorityLow, nil
	case PriorityNone:
		return PriorityNone, nil
	default:
		return "", ErrInvalidPriority
	}
}

// ParseOptionalPriority defaults blank input to PriorityNone and validates non-empty values.
func ParseOptionalPriority(raw string) (Priority, error) {
	if strings.TrimSpace(raw) == "" {
		return PriorityNone, nil
	}
	return ParsePriority(raw)
}

// ValidateEstimate enforces the Work Item Type's estimate unit and numeric bounds.
func ValidateEstimate(unit EstimateUnit, storyPoints, hours *float64) error {
	switch unit {
	case EstimateUnitStoryPoints:
		return validateSingleEstimate(storyPoints, hours)
	case EstimateUnitHours:
		return validateSingleEstimate(hours, storyPoints)
	case EstimateUnitNone:
		return validateNoEstimate(storyPoints, hours)
	default:
		return ErrInvalidEstimate
	}
}

// AllowsChildType reports whether this Work Item Type may parent childTypeID.
func (t WorkItemType) AllowsChildType(childTypeID WorkItemTypeID) bool {
	return slices.Contains(t.AllowedChildTypeIDs, childTypeID)
}

// DefaultInitialStatus returns the Project's first Status in the not_committed
// Status Group, falling back to the first ordered Status if none exists.
func DefaultInitialStatus(statuses []Status) (Status, bool) {
	if len(statuses) == 0 {
		return Status{}, false
	}
	for _, s := range statuses {
		if s.Group == StatusGroupNotCommitted {
			return s, true
		}
	}
	return statuses[0], true
}

func validateSingleEstimate(allowed, forbidden *float64) error {
	if forbidden != nil {
		return ErrInvalidEstimate
	}
	if allowed != nil && !validEstimateNumber(*allowed) {
		return ErrInvalidEstimate
	}
	return nil
}

func validateNoEstimate(storyPoints, hours *float64) error {
	if storyPoints != nil || hours != nil {
		return ErrInvalidEstimate
	}
	return nil
}

func validEstimateNumber(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= maxEstimateValue
}

func parseUUID(raw string) (string, bool) {
	id := strings.ToLower(strings.TrimSpace(raw))
	if !uuidPattern.MatchString(id) {
		return "", false
	}
	return id, true
}
