package domain

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

const maxWorkflowLabelLength = 100

var (
	// ErrStatusNotFound reports a Status that does not exist in the Project.
	ErrStatusNotFound = errors.New("status not found")
	// ErrStatusNameInUse reports another Status in the same Project with the same name.
	ErrStatusNameInUse = errors.New("a status with this name already exists in this project")
	// ErrInvalidStatusName reports a blank or oversized Status name.
	ErrInvalidStatusName = errors.New("status name must be 1-100 characters and not blank")
	// ErrInvalidStatusGroup reports a Status Group outside the four fixed groups.
	ErrInvalidStatusGroup = errors.New("status group must be not_committed, planned, started or completed")
	// ErrInvalidPosition reports a negative ordering position.
	ErrInvalidPosition = errors.New("position must be zero or positive")
	// ErrMinimumStatusGroupRequired reports an attempt to leave a Project without at least
	// one Not Committed Status or without at least one Completed Status (CONTEXT.md, ADR 0010).
	ErrMinimumStatusGroupRequired = errors.New("project must keep at least one not_committed status and one completed status")
	// ErrInvalidReplacementStatus reports a missing, malformed, same, or foreign replacement Status.
	ErrInvalidReplacementStatus = errors.New("replacement status must be another status in this project")
	// ErrWorkItemTypeNotFound reports a Work Item Type that does not exist in the Project.
	ErrWorkItemTypeNotFound = errors.New("work item type not found")
	// ErrWorkItemTypeNameInUse reports another Work Item Type in the same Project with the same name.
	ErrWorkItemTypeNameInUse = errors.New("a work item type with this name already exists in this project")
	// ErrInvalidWorkItemTypeName reports a blank or oversized Work Item Type name.
	ErrInvalidWorkItemTypeName = errors.New("work item type name must be 1-100 characters and not blank")
	// ErrInvalidEstimateUnit reports an estimate unit outside story_points, hours or none.
	ErrInvalidEstimateUnit = errors.New("estimate unit must be story_points, hours or none")
	// ErrInvalidReplacementType reports a missing, malformed, same, or foreign replacement Work Item Type.
	ErrInvalidReplacementType = errors.New("replacement work item type must be another work item type in this project")
	// ErrInvalidHierarchy reports allowed Child Work Item Types that are malformed, foreign, or self-referencing.
	ErrInvalidHierarchy = errors.New("allowed child work item types must belong to this project and exclude self")
	// ErrInvalidTransitionRule reports a Transition Rule whose Statuses are invalid, foreign, or identical.
	ErrInvalidTransitionRule = errors.New("transition rule must reference two distinct statuses in this project")
	// ErrTransitionRuleExists reports a duplicate Transition Rule in the Project.
	ErrTransitionRuleExists = errors.New("this transition rule already exists")
	// ErrTransitionRuleNotFound reports a Transition Rule that does not exist in the Project.
	ErrTransitionRuleNotFound = errors.New("transition rule not found")
	// ErrTransitionNotAllowed reports a Status move blocked by the Project's Transition Rules.
	ErrTransitionNotAllowed = errors.New("transition is not allowed by project transition rules")
)

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

// TransitionRule is an optional rule of one Project that limits which Statuses
// a Work Item can move to from FromStatusID (CONTEXT.md: Transition Rule).
type TransitionRule struct {
	ProjectID    ProjectID
	FromStatusID StatusID
	ToStatusID   StatusID
	CreatedAt    time.Time
}

// ParseStatusID normalizes a Status path ID; non-UUID values name no Status.
func ParseStatusID(raw string) (StatusID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrStatusNotFound
	}
	return StatusID(id), nil
}

// ParseWorkItemTypeID normalizes a Work Item Type path ID; non-UUID values name no type.
func ParseWorkItemTypeID(raw string) (WorkItemTypeID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrWorkItemTypeNotFound
	}
	return WorkItemTypeID(id), nil
}

// ParseStatusName trims a Status name and checks it is 1-100 non-blank characters.
func ParseStatusName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxWorkflowLabelLength {
		return "", ErrInvalidStatusName
	}
	return name, nil
}

// ParseStatusGroup validates a Status Group against the four fixed groups.
func ParseStatusGroup(raw string) (StatusGroup, error) {
	switch StatusGroup(strings.ToLower(strings.TrimSpace(raw))) {
	case StatusGroupNotCommitted:
		return StatusGroupNotCommitted, nil
	case StatusGroupPlanned:
		return StatusGroupPlanned, nil
	case StatusGroupStarted:
		return StatusGroupStarted, nil
	case StatusGroupCompleted:
		return StatusGroupCompleted, nil
	default:
		return "", ErrInvalidStatusGroup
	}
}

// ParseWorkItemTypeName trims a Work Item Type name and checks it is 1-100 non-blank characters.
func ParseWorkItemTypeName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxWorkflowLabelLength {
		return "", ErrInvalidWorkItemTypeName
	}
	return name, nil
}

// ParseEstimateUnit validates a Work Item Type estimate unit.
func ParseEstimateUnit(raw string) (EstimateUnit, error) {
	switch EstimateUnit(strings.ToLower(strings.TrimSpace(raw))) {
	case EstimateUnitStoryPoints:
		return EstimateUnitStoryPoints, nil
	case EstimateUnitHours:
		return EstimateUnitHours, nil
	case EstimateUnitNone:
		return EstimateUnitNone, nil
	default:
		return "", ErrInvalidEstimateUnit
	}
}

// ParsePosition checks that an ordering position is zero or positive.
func ParsePosition(pos int) (int, error) {
	if pos < 0 {
		return 0, ErrInvalidPosition
	}
	return pos, nil
}

// CanChangeStatusGroup reports whether changing targetID to newGroup preserves
// at least one Not Committed Status and at least one Completed Status.
func CanChangeStatusGroup(statuses []Status, targetID StatusID, newGroup StatusGroup) bool {
	var notCommitted, completed int
	for _, s := range statuses {
		group := s.Group
		if s.ID == targetID {
			group = newGroup
		}
		if group == StatusGroupNotCommitted {
			notCommitted++
		}
		if group == StatusGroupCompleted {
			completed++
		}
	}
	return notCommitted > 0 && completed > 0
}

// CanRemoveStatus reports whether deleting targetID preserves at least one
// Not Committed Status and at least one Completed Status.
func CanRemoveStatus(statuses []Status, targetID StatusID) bool {
	var notCommitted, completed int
	for _, s := range statuses {
		if s.ID == targetID {
			continue
		}
		if s.Group == StatusGroupNotCommitted {
			notCommitted++
		}
		if s.Group == StatusGroupCompleted {
			completed++
		}
	}
	return notCommitted > 0 && completed > 0
}

// IsTransitionAllowed reports whether moving a Work Item from `from` to `to`
// satisfies the Project's optional Transition Rules. Staying in the same Status
// is always allowed, and any `from` Status with no rules moves freely (ADR 0010).
func IsTransitionAllowed(rules []TransitionRule, from, to StatusID) bool {
	if from == to {
		return true
	}
	hasRuleForSource := false
	for _, rule := range rules {
		if rule.FromStatusID != from {
			continue
		}
		hasRuleForSource = true
		if rule.ToStatusID == to {
			return true
		}
	}
	return !hasRuleForSource
}
