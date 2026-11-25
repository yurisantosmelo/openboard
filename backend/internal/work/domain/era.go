package domain

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

const maxEraNameLength = 100

var (
	// ErrEraNotFound reports an Era that does not exist in the Project.
	ErrEraNotFound = errors.New("era not found")
	// ErrEraNameInUse reports another Era in the same Project with the same name.
	ErrEraNameInUse = errors.New("an era with this name already exists in this project")
	// ErrInvalidEraName reports a blank or oversized Era name.
	ErrInvalidEraName = errors.New("era name must be 1-100 characters and not blank")
	// ErrInvalidEraDates reports malformed dates or an end_date earlier than start_date.
	ErrInvalidEraDates = errors.New("era dates must use YYYY-MM-DD with end_date on or after start_date")
	// ErrEraOverlap reports an Era whose date range overlaps another Era in the Project (CONTEXT.md).
	ErrEraOverlap = errors.New("era dates cannot overlap another era in this project")
	// ErrActiveEraExists reports an attempt to start a second Active Era in the same Project.
	ErrActiveEraExists = errors.New("this project already has an active era")
	// ErrEraNotPlanned reports an operation allowed only on a Planned Era (start or delete).
	ErrEraNotPlanned = errors.New("only a planned era can be started or deleted")
	// ErrEraNotActive reports an attempt to close an Era that is not Active.
	ErrEraNotActive = errors.New("only an active era can be closed")
	// ErrEraCompleted reports an attempt to edit a Completed Era or assign Work Items into it.
	ErrEraCompleted = errors.New("completed eras cannot be modified")
	// ErrInvalidNextEra reports a close destination that is not a Planned Era of the same Project.
	ErrInvalidNextEra = errors.New("next era must be a planned era in this project")
	// ErrInvalidEra reports an Era reference on a Work Item that is malformed, foreign, or Completed.
	ErrInvalidEra = errors.New("era must be a planned or active era in this project")
)

// EraID identifies an Era inside a Project.
type EraID string

// EraState is the lifecycle state of an Era: Planned, Active or Completed (CONTEXT.md).
type EraState string

// Era lifecycle states.
const (
	EraStatePlanned   EraState = "planned"
	EraStateActive    EraState = "active"
	EraStateCompleted EraState = "completed"
)

// Era is a time-boxed cycle of one Project with a start date, end date and goals.
type Era struct {
	ID        EraID
	ProjectID ProjectID
	Name      string
	Goal      string
	StartDate time.Time
	EndDate   time.Time
	State     EraState
	ClosedAt  *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ParseEraID normalizes an Era path ID; non-UUID values name no Era.
func ParseEraID(raw string) (EraID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrEraNotFound
	}
	return EraID(id), nil
}

// ParseEraRef parses an Era UUID reference from Work Item input or filters.
func ParseEraRef(raw string) (EraID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidEra
	}
	return EraID(id), nil
}

// ParseNextEraRef parses a destination Era UUID when closing an Active Era.
func ParseNextEraRef(raw string) (EraID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidNextEra
	}
	return EraID(id), nil
}

// ParseEraName trims an Era name and checks it is 1-100 non-blank characters.
func ParseEraName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxEraNameLength {
		return "", ErrInvalidEraName
	}
	return name, nil
}

// ParseEraDates parses YYYY-MM-DD start and end dates and checks start <= end.
func ParseEraDates(rawStart, rawEnd string) (time.Time, time.Time, error) {
	start, err1 := time.Parse(time.DateOnly, strings.TrimSpace(rawStart))
	end, err2 := time.Parse(time.DateOnly, strings.TrimSpace(rawEnd))
	if err1 != nil || err2 != nil || end.Before(start) {
		return time.Time{}, time.Time{}, ErrInvalidEraDates
	}
	return start.UTC(), end.UTC(), nil
}

// ErasOverlap reports whether two closed date ranges [aStart, aEnd] and [bStart, bEnd] overlap.
func ErasOverlap(aStart, aEnd, bStart, bEnd time.Time) bool {
	return !aEnd.Before(bStart) && !bEnd.Before(aStart)
}

// HasOverlappingEra reports whether any Era in existing (other than excludeID)
// overlaps [start, end].
func HasOverlappingEra(existing []Era, excludeID EraID, start, end time.Time) bool {
	for _, e := range existing {
		if e.ID == excludeID {
			continue
		}
		if ErasOverlap(e.StartDate, e.EndDate, start, end) {
			return true
		}
	}
	return false
}

// HasActiveEra reports whether existing already contains an Active Era.
func HasActiveEra(existing []Era) bool {
	for _, e := range existing {
		if e.State == EraStateActive {
			return true
		}
	}
	return false
}
