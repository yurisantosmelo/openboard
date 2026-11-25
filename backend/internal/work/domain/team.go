package domain

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

const maxTeamNameLength = 100

var (
	// ErrTeamNotFound reports a Team that does not exist in the Workspace.
	ErrTeamNotFound = errors.New("team not found")
	// ErrTeamNameInUse reports another Team in the same Workspace with the same name.
	ErrTeamNameInUse = errors.New("a team with this name already exists in this workspace")
	// ErrInvalidTeamName reports a blank or oversized Team name.
	ErrInvalidTeamName = errors.New("team name must be 1-100 characters and not blank")
	// ErrInvalidTeamRef reports a malformed or foreign Team UUID when associating a Project Team.
	ErrInvalidTeamRef = errors.New("team must belong to the project's workspace")
	// ErrInvalidTeamAssignee reports a User who cannot enter the Team's Workspace or is Deactivated.
	ErrInvalidTeamAssignee = errors.New("user must be active and able to enter the team's workspace")
	// ErrTeamAssignmentExists reports a User already assigned to the Team.
	ErrTeamAssignmentExists = errors.New("user is already assigned to this team")
	// ErrTeamAssignmentNotFound reports a Team Assignment that does not exist.
	ErrTeamAssignmentNotFound = errors.New("team assignment not found")
	// ErrProjectTeamExists reports a Team already associated with the Project.
	ErrProjectTeamExists = errors.New("team is already associated with this project")
	// ErrProjectTeamNotFound reports a Project Team association that does not exist.
	ErrProjectTeamNotFound = errors.New("project team not found")
	// ErrCrossOrganizationMove reports an attempt to move a Project into another Organization (CONTEXT.md).
	ErrCrossOrganizationMove = errors.New("a project cannot move to another organization")
)

// TeamID identifies a Team inside a Workspace.
type TeamID string

// Team is a group of Users who work together inside one Workspace (ADR 0005).
type Team struct {
	ID          TeamID
	WorkspaceID WorkspaceID
	Name        string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// TeamAssignment places a User in a Team without granting any access (ADR 0005).
type TeamAssignment struct {
	TeamID    TeamID
	UserID    UserID
	Username  string
	Name      string
	CreatedAt time.Time
}

// ParseTeamID normalizes a Team path ID; non-UUID values name no Team.
func ParseTeamID(raw string) (TeamID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrTeamNotFound
	}
	return TeamID(id), nil
}

// ParseTeamRef parses a Team UUID in request payloads (e.g. associating a Project Team).
func ParseTeamRef(raw string) (TeamID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidTeamRef
	}
	return TeamID(id), nil
}

// ParseTeamName trims a Team name and verifies it is 1-100 non-blank characters.
func ParseTeamName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" || utf8.RuneCountInString(name) > maxTeamNameLength {
		return "", ErrInvalidTeamName
	}
	return name, nil
}

// ParseTeamAssigneeID parses a User UUID for a Team Assignment.
func ParseTeamAssigneeID(raw string) (UserID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidTeamAssignee
	}
	return UserID(id), nil
}
