package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// ListByWorkspaceFiltered returns one page of Projects inside workspaceID,
// optionally including Archived Projects while always excluding Pending Deletion.
func (r *Projects) ListByWorkspaceFiltered(
	ctx context.Context,
	workspaceID domain.WorkspaceID,
	includeArchived bool,
	page application.PageRequest,
) ([]domain.Project, int, error) {
	archivedClause := ` AND archived_at IS NULL`
	if includeArchived {
		archivedClause = ``
	}
	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM projects WHERE workspace_id = $1 AND deleted_at IS NULL`+archivedClause,
		string(workspaceID)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count projects: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+projectColumns+`
		FROM projects
		WHERE workspace_id = $1 AND deleted_at IS NULL`+archivedClause+`
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

// ListPendingDeletionByWorkspace returns Pending Deletion Projects in workspaceID whose grace period has not expired.
func (r *Projects) ListPendingDeletionByWorkspace(
	ctx context.Context,
	workspaceID domain.WorkspaceID,
	page application.PageRequest,
) ([]domain.Project, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `
		SELECT count(*)
		FROM projects
		WHERE workspace_id = $1 AND deleted_at IS NOT NULL AND purge_after > NOW()`,
		string(workspaceID)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count pending deletion projects: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, organization_id::text, workspace_id::text, name, created_at, updated_at, archived_at, deleted_at, purge_after
		FROM projects
		WHERE workspace_id = $1 AND deleted_at IS NOT NULL AND purge_after > NOW()
		ORDER BY purge_after ASC, id
		LIMIT $2 OFFSET $3`,
		string(workspaceID), page.Limit, page.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list pending deletion projects: %w", err)
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Project, error) {
		return scanPendingProject(row)
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan pending deletion projects: %w", err)
	}
	return items, total, nil
}

// Archive marks a Project Archived (hidden from default lists and read-only).
func (r *Projects) Archive(ctx context.Context, id domain.ProjectID) (domain.Project, error) {
	project, err := scanProject(r.pool.QueryRow(ctx, `
		UPDATE projects
		SET archived_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING `+projectColumns, string(id)))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, fmt.Errorf("archive project: %w", err)
	}
	return project, nil
}

// Unarchive restores an Archived Project intact.
func (r *Projects) Unarchive(ctx context.Context, id domain.ProjectID) (domain.Project, error) {
	project, err := scanProject(r.pool.QueryRow(ctx, `
		UPDATE projects
		SET archived_at = NULL, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING `+projectColumns, string(id)))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, fmt.Errorf("unarchive project: %w", err)
	}
	return project, nil
}

// MarkPendingDeletion places a Project into Pending Deletion until purgeAfter.
func (r *Projects) MarkPendingDeletion(ctx context.Context, id domain.ProjectID, purgeAfter time.Time) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE projects
		SET deleted_at = NOW(), purge_after = $2, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL`,
		string(id), purgeAfter.UTC())
	if err != nil {
		return fmt.Errorf("mark project pending deletion: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// FindPendingDeletion returns a Pending Deletion Project whose grace period has not expired.
func (r *Projects) FindPendingDeletion(ctx context.Context, id domain.ProjectID) (domain.Project, error) {
	project, err := scanPendingProject(r.pool.QueryRow(ctx, `
		SELECT id::text, organization_id::text, workspace_id::text, name, created_at, updated_at, archived_at, deleted_at, purge_after
		FROM projects
		WHERE id = $1 AND deleted_at IS NOT NULL AND purge_after > NOW()`, string(id)))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, fmt.Errorf("find pending deletion project: %w", err)
	}
	return project, nil
}

// Restore restores a Pending Deletion Project within its grace period.
func (r *Projects) Restore(ctx context.Context, id domain.ProjectID) (domain.Project, error) {
	project, err := scanProject(r.pool.QueryRow(ctx, `
		UPDATE projects
		SET deleted_at = NULL, purge_after = NULL, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NOT NULL AND purge_after > NOW()
		RETURNING `+projectColumns, string(id)))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, fmt.Errorf("restore project: %w", err)
	}
	return project, nil
}

// PurgeExpired permanently deletes Projects whose Pending Deletion grace period has expired.
func (r *Projects) PurgeExpired(ctx context.Context) error {
	if _, err := r.pool.Exec(ctx, `DELETE FROM projects WHERE deleted_at IS NOT NULL AND purge_after <= NOW()`); err != nil {
		return fmt.Errorf("purge expired projects: %w", err)
	}
	return nil
}

func scanPendingProject(row pgx.Row) (domain.Project, error) {
	var (
		p                        domain.Project
		id, organizationID, wsID string
	)
	if err := row.Scan(&id, &organizationID, &wsID, &p.Name, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt, &p.DeletedAt, &p.PurgeAfter); err != nil {
		return domain.Project{}, err
	}
	p.ID = domain.ProjectID(id)
	p.OrganizationID = domain.OrganizationID(organizationID)
	p.WorkspaceID = domain.WorkspaceID(wsID)
	return p, nil
}
