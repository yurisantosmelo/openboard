// Package postgres implements the Work Management repositories on PostgreSQL with pgx.
package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const (
	uxProjectWorkspaceName = "ux_projects_workspace_name"
	projectColumns         = `id::text, organization_id::text, workspace_id::text, name, created_at, updated_at`
)

// Projects stores Projects and their workflow configuration in PostgreSQL.
type Projects struct {
	pool *pgxpool.Pool
}

// NewProjects returns a Projects repository backed by pool.
func NewProjects(pool *pgxpool.Pool) *Projects {
	return &Projects{pool: pool}
}

// Create inserts a Project and seeds its initial Statuses, Work Item Types and
// hierarchy atomically in a single transaction.
func (r *Projects) Create(ctx context.Context, n application.NewProject) (domain.Project, error) {
	var created domain.Project
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			INSERT INTO projects (organization_id, workspace_id, name)
			VALUES ($1, $2, $3)
			RETURNING `+projectColumns,
			string(n.OrganizationID), string(n.WorkspaceID), n.Name)
		project, err := scanProject(row)
		if err != nil {
			return mapProjectError("insert project", err)
		}
		if err := seedStatuses(ctx, tx, project.ID, n.Statuses); err != nil {
			return err
		}
		if err := seedWorkItemTypesAndHierarchy(ctx, tx, project.ID, n.WorkItemTypes, n.Hierarchy); err != nil {
			return err
		}
		created = project
		return nil
	})
	return created, err
}

// Find returns the Project with id, or domain.ErrNotFound.
func (r *Projects) Find(ctx context.Context, id domain.ProjectID) (domain.Project, error) {
	project, err := scanProject(r.pool.QueryRow(ctx, `SELECT `+projectColumns+` FROM projects WHERE id = $1`, string(id)))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, fmt.Errorf("find project: %w", err)
	}
	return project, nil
}

// ListByWorkspace returns one page of Projects inside workspaceID ordered by
// name ignoring case and then by ID, along with the total count.
func (r *Projects) ListByWorkspace(ctx context.Context, workspaceID domain.WorkspaceID, page application.PageRequest) ([]domain.Project, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM projects WHERE workspace_id = $1`, string(workspaceID)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count projects: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+projectColumns+`
		FROM projects
		WHERE workspace_id = $1
		ORDER BY lower(name), id
		LIMIT $2 OFFSET $3`,
		string(workspaceID), page.Limit, page.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list projects: %w", err)
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Project, error) {
		return scanProject(row)
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan projects: %w", err)
	}
	return items, total, nil
}

// Rename changes a Project's name and returns the updated Project.
func (r *Projects) Rename(ctx context.Context, id domain.ProjectID, name string) (domain.Project, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE projects
		SET name = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING `+projectColumns,
		string(id), name)
	project, err := scanProject(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, mapProjectError("rename project", err)
	}
	return project, nil
}

// Move relocates a Project to targetWorkspaceID inside the same Organization,
// clearing its Project Teams atomically while preserving all Project content.
func (r *Projects) Move(ctx context.Context, id domain.ProjectID, targetWorkspaceID domain.WorkspaceID) (domain.Project, error) {
	var moved domain.Project
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM project_teams WHERE project_id = $1`, string(id)); err != nil {
			return fmt.Errorf("clear project teams on move: %w", err)
		}
		row := tx.QueryRow(ctx, `
			UPDATE projects
			SET workspace_id = $2, updated_at = NOW()
			WHERE id = $1
			RETURNING `+projectColumns,
			string(id), string(targetWorkspaceID))
		p, err := scanProject(row)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrNotFound
		}
		if err != nil {
			return mapProjectError("move project", err)
		}
		moved = p
		return nil
	})
	return moved, err
}

func scanProject(row pgx.Row) (domain.Project, error) {
	var (
		p                        domain.Project
		id, organizationID, wsID string
	)
	if err := row.Scan(&id, &organizationID, &wsID, &p.Name, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return domain.Project{}, err
	}
	p.ID = domain.ProjectID(id)
	p.OrganizationID = domain.OrganizationID(organizationID)
	p.WorkspaceID = domain.WorkspaceID(wsID)
	return p, nil
}

func mapProjectError(op string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == uxProjectWorkspaceName {
		return domain.ErrProjectNameInUse
	}
	return fmt.Errorf("%s: %w", op, err)
}
