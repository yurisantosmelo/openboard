package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const (
	uxTeamWorkspaceName = "ux_teams_workspace_name"
	pkTeamAssignments   = "team_assignments_pkey"
	pkProjectTeams      = "project_teams_pkey"
	teamColumns         = `id::text, workspace_id::text, name, created_at, updated_at`
)

// Teams stores Workspace Teams, Team Assignments and Project Teams in PostgreSQL.
type Teams struct {
	pool *pgxpool.Pool
}

// NewTeams returns a Teams repository backed by pool.
func NewTeams(pool *pgxpool.Pool) *Teams {
	return &Teams{pool: pool}
}

// ListByWorkspace returns all Teams inside workspaceID ordered by name ignoring case.
func (r *Teams) ListByWorkspace(ctx context.Context, workspaceID domain.WorkspaceID) ([]domain.Team, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+teamColumns+`
		FROM teams
		WHERE workspace_id = $1
		ORDER BY lower(name), id`, string(workspaceID))
	if err != nil {
		return nil, fmt.Errorf("list workspace teams: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Team, error) {
		return scanTeam(row)
	})
}

// Find returns one Team in workspaceID, or domain.ErrTeamNotFound.
func (r *Teams) Find(ctx context.Context, workspaceID domain.WorkspaceID, id domain.TeamID) (domain.Team, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+teamColumns+`
		FROM teams
		WHERE workspace_id = $1 AND id = $2`, string(workspaceID), string(id))
	team, err := scanTeam(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Team{}, domain.ErrTeamNotFound
	}
	if err != nil {
		return domain.Team{}, fmt.Errorf("find team: %w", err)
	}
	return team, nil
}

// Create inserts a new Team inside workspaceID.
func (r *Teams) Create(ctx context.Context, workspaceID domain.WorkspaceID, name string) (domain.Team, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO teams (workspace_id, name)
		VALUES ($1, $2)
		RETURNING `+teamColumns, string(workspaceID), name)
	team, err := scanTeam(row)
	if err != nil {
		return domain.Team{}, mapTeamError("create team", err)
	}
	return team, nil
}

// Rename changes a Team's name inside workspaceID.
func (r *Teams) Rename(ctx context.Context, workspaceID domain.WorkspaceID, id domain.TeamID, name string) (domain.Team, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE teams
		SET name = $3, updated_at = NOW()
		WHERE workspace_id = $1 AND id = $2
		RETURNING `+teamColumns, string(workspaceID), string(id), name)
	team, err := scanTeam(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Team{}, domain.ErrTeamNotFound
	}
	if err != nil {
		return domain.Team{}, mapTeamError("rename team", err)
	}
	return team, nil
}

// Delete removes a Team, cascading its Team Assignments and Project Teams.
func (r *Teams) Delete(ctx context.Context, workspaceID domain.WorkspaceID, id domain.TeamID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM teams WHERE workspace_id = $1 AND id = $2`, string(workspaceID), string(id))
	if err != nil {
		return fmt.Errorf("delete team: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrTeamNotFound
	}
	return nil
}

// ListAssignments returns all Users assigned to teamID ordered by display name.
func (r *Teams) ListAssignments(ctx context.Context, teamID domain.TeamID) ([]domain.TeamAssignment, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT ta.team_id::text, ta.user_id::text, u.username, u.name, ta.created_at
		FROM team_assignments ta
		JOIN users u ON u.id = ta.user_id
		WHERE ta.team_id = $1
		ORDER BY lower(u.name), u.username, ta.user_id`, string(teamID))
	if err != nil {
		return nil, fmt.Errorf("list team assignments: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.TeamAssignment, error) {
		return scanTeamAssignment(row)
	})
}

// AddAssignment adds userID to teamID.
func (r *Teams) AddAssignment(ctx context.Context, teamID domain.TeamID, userID domain.UserID) (domain.TeamAssignment, error) {
	row := r.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO team_assignments (team_id, user_id)
			VALUES ($1, $2)
			RETURNING team_id, user_id, created_at
		)
		SELECT i.team_id::text, i.user_id::text, u.username, u.name, i.created_at
		FROM inserted i
		JOIN users u ON u.id = i.user_id`, string(teamID), string(userID))
	a, err := scanTeamAssignment(row)
	if err != nil {
		return domain.TeamAssignment{}, mapTeamError("add team assignment", err)
	}
	return a, nil
}

// RemoveAssignment removes userID from teamID.
func (r *Teams) RemoveAssignment(ctx context.Context, teamID domain.TeamID, userID domain.UserID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM team_assignments WHERE team_id = $1 AND user_id = $2`, string(teamID), string(userID))
	if err != nil {
		return fmt.Errorf("remove team assignment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrTeamAssignmentNotFound
	}
	return nil
}

// ListProjectTeams returns all Teams associated with projectID ordered by name.
func (r *Teams) ListProjectTeams(ctx context.Context, projectID domain.ProjectID) ([]domain.Team, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT t.id::text, t.workspace_id::text, t.name, t.created_at, t.updated_at
		FROM project_teams pt
		JOIN teams t ON t.id = pt.team_id
		WHERE pt.project_id = $1
		ORDER BY lower(t.name), t.id`, string(projectID))
	if err != nil {
		return nil, fmt.Errorf("list project teams: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Team, error) {
		return scanTeam(row)
	})
}

// AddProjectTeam associates teamID with projectID inside workspaceID.
func (r *Teams) AddProjectTeam(ctx context.Context, projectID domain.ProjectID, teamID domain.TeamID, workspaceID domain.WorkspaceID) (domain.Team, error) {
	row := r.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO project_teams (project_id, team_id, workspace_id)
			VALUES ($1, $2, $3)
			RETURNING team_id
		)
		SELECT t.id::text, t.workspace_id::text, t.name, t.created_at, t.updated_at
		FROM inserted i
		JOIN teams t ON t.id = i.team_id`, string(projectID), string(teamID), string(workspaceID))
	team, err := scanTeam(row)
	if err != nil {
		return domain.Team{}, mapTeamError("add project team", err)
	}
	return team, nil
}

// RemoveProjectTeam disassociates teamID from projectID.
func (r *Teams) RemoveProjectTeam(ctx context.Context, projectID domain.ProjectID, teamID domain.TeamID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM project_teams WHERE project_id = $1 AND team_id = $2`, string(projectID), string(teamID))
	if err != nil {
		return fmt.Errorf("remove project team: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrProjectTeamNotFound
	}
	return nil
}

func scanTeam(row pgx.Row) (domain.Team, error) {
	var t domain.Team
	err := row.Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func scanTeamAssignment(row pgx.Row) (domain.TeamAssignment, error) {
	var a domain.TeamAssignment
	err := row.Scan(&a.TeamID, &a.UserID, &a.Username, &a.Name, &a.CreatedAt)
	return a, err
}

func mapTeamError(op string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		switch pgErr.ConstraintName {
		case uxTeamWorkspaceName:
			return domain.ErrTeamNameInUse
		case pkTeamAssignments:
			return domain.ErrTeamAssignmentExists
		case pkProjectTeams:
			return domain.ErrProjectTeamExists
		}
	}
	return fmt.Errorf("%s: %w", op, err)
}
