package domain

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

const maxViewNameLength = 100

var (
	// ErrViewNotFound reports a View that does not exist or is another User's Personal View.
	ErrViewNotFound = errors.New("view not found")
	// ErrViewNameInUse reports another visible View in the same scope with the same name.
	ErrViewNameInUse = errors.New("a view with this name already exists")
	// ErrInvalidViewName reports a blank or oversized View name.
	ErrInvalidViewName = errors.New("view name must be 1-100 characters and not blank")
	// ErrInvalidViewLayout reports an unknown View Layout (CONTEXT.md: Layout).
	ErrInvalidViewLayout = errors.New("view layout must be board, list, table, timeline or calendar")
	// ErrInvalidViewVisibility reports an unknown View Visibility (Personal or Shared).
	ErrInvalidViewVisibility = errors.New("view visibility must be personal or shared")
	// ErrInvalidViewFilters reports malformed filter values stored on a View.
	ErrInvalidViewFilters = errors.New("view filters contain an invalid value")
)

// ViewID identifies a saved View inside a Project.
type ViewID string

// ViewLayout is the visual form a View takes (CONTEXT.md: Layout).
type ViewLayout string

// Supported View Layouts.
const (
	ViewLayoutBoard    ViewLayout = "board"
	ViewLayoutList     ViewLayout = "list"
	ViewLayoutTable    ViewLayout = "table"
	ViewLayoutTimeline ViewLayout = "timeline"
	ViewLayoutCalendar ViewLayout = "calendar"
)

// ViewVisibility distinguishes a Personal View from a Shared View (CONTEXT.md).
type ViewVisibility string

// View visibilities.
const (
	ViewVisibilityPersonal ViewVisibility = "personal"
	ViewVisibilityShared   ViewVisibility = "shared"
)

// ViewFilters holds saved Filter conditions for a View (CONTEXT.md: Filter).
type ViewFilters struct {
	StatusID       string `json:"status_id,omitempty"`
	WorkItemTypeID string `json:"work_item_type_id,omitempty"`
	Priority       string `json:"priority,omitempty"`
	AssigneeID     string `json:"assignee_id,omitempty"`
	EraID          string `json:"era_id,omitempty"`
}

// View is a saved way of showing one Project's Work Items with one Layout and Filters.
type View struct {
	ID         ViewID
	ProjectID  ProjectID
	Name       string
	Layout     ViewLayout
	Visibility ViewVisibility
	Filters    ViewFilters
	CreatedBy  UserID
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// ParseViewID normalizes a View path ID; non-UUID values name no View.
func ParseViewID(raw string) (ViewID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrViewNotFound
	}
	return ViewID(id), nil
}

// ParseViewName trims a View name and verifies it is 1-100 non-blank characters.
func ParseViewName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxViewNameLength {
		return "", ErrInvalidViewName
	}
	return name, nil
}

// ParseViewLayout parses one of the five Layouts defined in CONTEXT.md.
func ParseViewLayout(raw string) (ViewLayout, error) {
	switch ViewLayout(strings.TrimSpace(strings.ToLower(raw))) {
	case ViewLayoutBoard:
		return ViewLayoutBoard, nil
	case ViewLayoutList:
		return ViewLayoutList, nil
	case ViewLayoutTable:
		return ViewLayoutTable, nil
	case ViewLayoutTimeline:
		return ViewLayoutTimeline, nil
	case ViewLayoutCalendar:
		return ViewLayoutCalendar, nil
	default:
		return "", ErrInvalidViewLayout
	}
}

// ParseViewVisibility parses personal or shared visibility.
func ParseViewVisibility(raw string) (ViewVisibility, error) {
	switch ViewVisibility(strings.TrimSpace(strings.ToLower(raw))) {
	case ViewVisibilityPersonal:
		return ViewVisibilityPersonal, nil
	case ViewVisibilityShared:
		return ViewVisibilityShared, nil
	default:
		return "", ErrInvalidViewVisibility
	}
}

func parseOptionalFilterUUID(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	id, ok := parseUUID(trimmed)
	if !ok {
		return "", ErrInvalidViewFilters
	}
	return id, nil
}

// ParseViewFilters normalizes and validates every non-empty filter field on a View.
func ParseViewFilters(in ViewFilters) (ViewFilters, error) {
	statusID, err1 := parseOptionalFilterUUID(in.StatusID)
	typeID, err2 := parseOptionalFilterUUID(in.WorkItemTypeID)
	assigneeID, err3 := parseOptionalFilterUUID(in.AssigneeID)
	eraID, err4 := parseOptionalFilterUUID(in.EraID)
	priority := ""
	var err5 error
	if trimmed := strings.TrimSpace(in.Priority); trimmed != "" {
		p, err := ParsePriority(trimmed)
		if err != nil {
			err5 = ErrInvalidViewFilters
		} else {
			priority = string(p)
		}
	}
	if err := errors.Join(err1, err2, err3, err4, err5); err != nil {
		return ViewFilters{}, ErrInvalidViewFilters
	}
	return ViewFilters{
		StatusID:       statusID,
		WorkItemTypeID: typeID,
		Priority:       priority,
		AssigneeID:     assigneeID,
		EraID:          eraID,
	}, nil
}

// CanSeeView reports whether actor may view a Project View: everyone in the
// Project sees Shared Views, while only the creator sees a Personal View.
func CanSeeView(v View, actor Actor) bool {
	return v.Visibility == ViewVisibilityShared || v.CreatedBy == actor.UserID
}

// CanEditView reports whether actor with Workspace role may modify or delete v:
// Viewers are read-only, Personal Views belong strictly to their creator, and
// Shared Views may be changed by their creator or a Workspace Owner (CONTEXT.md).
func CanEditView(v View, actor Actor, role Role) bool {
	if !role.CanWriteWorkItems() {
		return false
	}
	if v.Visibility == ViewVisibilityPersonal {
		return v.CreatedBy == actor.UserID
	}
	return v.CreatedBy == actor.UserID || role.CanManageProject()
}

// CanSetViewVisibility reports whether actor may transition v's visibility to next.
// Only the View's creator may turn a View into a Personal View.
func CanSetViewVisibility(v View, actor Actor, next ViewVisibility) bool {
	if next == v.Visibility {
		return true
	}
	return v.CreatedBy == actor.UserID
}
