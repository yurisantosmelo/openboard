package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const (
	uxViewSharedName   = "ux_project_views_shared_name"
	uxViewPersonalName = "ux_project_views_personal_name"
	viewSelectColumns  = `id::text, project_id::text, name, layout, visibility, filters, created_by::text, created_at, updated_at`
)

// Views stores saved Project Views in PostgreSQL.
type Views struct {
	pool *pgxpool.Pool
}

// NewViews returns a Views repository backed by pool.
func NewViews(pool *pgxpool.Pool) *Views {
	return &Views{pool: pool}
}

// ListVisible returns all Shared Views in projectID plus viewerID's Personal Views.
func (r *Views) ListVisible(ctx context.Context, projectID domain.ProjectID, viewerID domain.UserID) ([]domain.View, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+viewSelectColumns+`
		FROM project_views
		WHERE project_id = $1 AND (visibility = 'shared' OR created_by = $2)
		ORDER BY visibility DESC, created_at ASC, id ASC`,
		string(projectID), string(viewerID))
	if err != nil {
		return nil, fmt.Errorf("list project views: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.View, error) {
		return scanView(row)
	})
}

// Find returns one View in projectID, or domain.ErrViewNotFound.
func (r *Views) Find(ctx context.Context, projectID domain.ProjectID, id domain.ViewID) (domain.View, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+viewSelectColumns+`
		FROM project_views
		WHERE project_id = $1 AND id = $2`,
		string(projectID), string(id))
	v, err := scanView(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.View{}, domain.ErrViewNotFound
	}
	if err != nil {
		return domain.View{}, fmt.Errorf("find project view: %w", err)
	}
	return v, nil
}

// Create inserts a new Personal View.
func (r *Views) Create(ctx context.Context, in application.NewView) (domain.View, error) {
	rawFilters, err := json.Marshal(in.Filters)
	if err != nil {
		return domain.View{}, fmt.Errorf("marshal view filters: %w", err)
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO project_views (project_id, name, layout, visibility, filters, created_by)
		VALUES ($1, $2, $3, 'personal', $4::jsonb, $5)
		RETURNING `+viewSelectColumns,
		string(in.ProjectID), in.Name, string(in.Layout), rawFilters, string(in.CreatedBy))
	v, err := scanView(row)
	if err != nil {
		return domain.View{}, mapViewError("create project view", err)
	}
	return v, nil
}

// Update saves changes to an existing View.
func (r *Views) Update(ctx context.Context, in application.ViewUpdate) (domain.View, error) {
	rawFilters, err := json.Marshal(in.Filters)
	if err != nil {
		return domain.View{}, fmt.Errorf("marshal view filters: %w", err)
	}
	row := r.pool.QueryRow(ctx, `
		UPDATE project_views
		SET name = $3, layout = $4, visibility = $5, filters = $6::jsonb, updated_at = NOW()
		WHERE project_id = $1 AND id = $2
		RETURNING `+viewSelectColumns,
		string(in.ProjectID), string(in.ID), in.Name, string(in.Layout), string(in.Visibility), rawFilters)
	v, err := scanView(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.View{}, domain.ErrViewNotFound
	}
	if err != nil {
		return domain.View{}, mapViewError("update project view", err)
	}
	return v, nil
}

// Delete removes one View inside projectID.
func (r *Views) Delete(ctx context.Context, projectID domain.ProjectID, id domain.ViewID) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM project_views
		WHERE project_id = $1 AND id = $2`,
		string(projectID), string(id))
	if err != nil {
		return fmt.Errorf("delete project view: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrViewNotFound
	}
	return nil
}

func scanView(row pgx.Row) (domain.View, error) {
	var (
		v          domain.View
		rawFilters []byte
	)
	if err := row.Scan(
		&v.ID, &v.ProjectID, &v.Name, &v.Layout, &v.Visibility,
		&rawFilters, &v.CreatedBy, &v.CreatedAt, &v.UpdatedAt,
	); err != nil {
		return domain.View{}, err
	}
	if len(rawFilters) > 0 {
		if err := json.Unmarshal(rawFilters, &v.Filters); err != nil {
			return domain.View{}, fmt.Errorf("unmarshal view filters: %w", err)
		}
	}
	return v, nil
}

func mapViewError(op string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		if pgErr.ConstraintName == uxViewSharedName || pgErr.ConstraintName == uxViewPersonalName {
			return domain.ErrViewNameInUse
		}
	}
	return fmt.Errorf("%s: %w", op, err)
}
