package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const (
	uxEraProjectName = "ux_project_eras_project_name"
	uxEraActive      = "ux_project_eras_active"
	eraSelectColumns = `id::text, project_id::text, name, goal, start_date, end_date, state, closed_at, created_at, updated_at`
)

// Eras stores Project Eras in PostgreSQL.
type Eras struct {
	pool *pgxpool.Pool
}

// NewEras returns an Eras repository backed by pool.
func NewEras(pool *pgxpool.Pool) *Eras {
	return &Eras{pool: pool}
}

// List returns all Eras of projectID ordered by start date.
func (r *Eras) List(ctx context.Context, projectID domain.ProjectID) ([]domain.Era, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+eraSelectColumns+`
		FROM project_eras
		WHERE project_id = $1
		ORDER BY start_date, id`, string(projectID))
	if err != nil {
		return nil, fmt.Errorf("list project eras: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Era, error) {
		return scanEra(row)
	})
}

// Find returns one Era in projectID, or domain.ErrEraNotFound.
func (r *Eras) Find(ctx context.Context, projectID domain.ProjectID, id domain.EraID) (domain.Era, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+eraSelectColumns+`
		FROM project_eras
		WHERE project_id = $1 AND id = $2`, string(projectID), string(id))
	era, err := scanEra(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Era{}, domain.ErrEraNotFound
	}
	if err != nil {
		return domain.Era{}, fmt.Errorf("find project era: %w", err)
	}
	return era, nil
}

// Create inserts a Planned Era.
func (r *Eras) Create(ctx context.Context, in application.NewEra) (domain.Era, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO project_eras (project_id, name, goal, start_date, end_date, state)
		VALUES ($1, $2, $3, $4, $5, 'planned')
		RETURNING `+eraSelectColumns,
		string(in.ProjectID), in.Name, in.Goal, in.StartDate, in.EndDate)
	era, err := scanEra(row)
	if err != nil {
		return domain.Era{}, mapEraError("create project era", err)
	}
	return era, nil
}

// Update saves changes to a Planned or Active Era.
func (r *Eras) Update(ctx context.Context, in application.EraUpdate) (domain.Era, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE project_eras
		SET name = $3, goal = $4, start_date = $5, end_date = $6, updated_at = NOW()
		WHERE project_id = $1 AND id = $2
		RETURNING `+eraSelectColumns,
		string(in.ProjectID), string(in.ID), in.Name, in.Goal, in.StartDate, in.EndDate)
	era, err := scanEra(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Era{}, domain.ErrEraNotFound
	}
	if err != nil {
		return domain.Era{}, mapEraError("update project era", err)
	}
	return era, nil
}

// Start marks a Planned Era as Active.
func (r *Eras) Start(ctx context.Context, projectID domain.ProjectID, id domain.EraID) (domain.Era, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE project_eras
		SET state = 'active', updated_at = NOW()
		WHERE project_id = $1 AND id = $2
		RETURNING `+eraSelectColumns, string(projectID), string(id))
	era, err := scanEra(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Era{}, domain.ErrEraNotFound
	}
	if err != nil {
		return domain.Era{}, mapEraError("start project era", err)
	}
	return era, nil
}

// Close marks an Active Era as Completed and moves unfinished Work Items
// (Status Group <> completed) to nextEraID (or NULL) without altering Statuses.
func (r *Eras) Close(
	ctx context.Context,
	projectID domain.ProjectID,
	id domain.EraID,
	nextEraID *domain.EraID,
	at time.Time,
) (domain.Era, error) {
	var closed domain.Era
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			UPDATE work_items wi
			SET era_id = $3, updated_at = NOW()
			FROM project_statuses ps
			WHERE wi.status_id = ps.id
			  AND wi.project_id = $1
			  AND wi.era_id = $2
			  AND ps.status_group <> 'completed'`,
			string(projectID), string(id), nullableEraID(nextEraID)); err != nil {
			return fmt.Errorf("move unfinished work items on era close: %w", err)
		}
		row := tx.QueryRow(ctx, `
			UPDATE project_eras
			SET state = 'completed', closed_at = $3, updated_at = NOW()
			WHERE project_id = $1 AND id = $2
			RETURNING `+eraSelectColumns, string(projectID), string(id), at)
		era, err := scanEra(row)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrEraNotFound
		}
		if err != nil {
			return fmt.Errorf("close project era: %w", err)
		}
		closed = era
		return nil
	})
	return closed, err
}

// Delete removes a Planned Era; assigned Work Items lose era_id via FK ON DELETE SET NULL.
func (r *Eras) Delete(ctx context.Context, projectID domain.ProjectID, id domain.EraID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM project_eras WHERE project_id = $1 AND id = $2`,
		string(projectID), string(id))
	if err != nil {
		return fmt.Errorf("delete project era: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrEraNotFound
	}
	return nil
}

func scanEra(row pgx.Row) (domain.Era, error) {
	var (
		e                 domain.Era
		id, projID, state string
	)
	if err := row.Scan(
		&id, &projID, &e.Name, &e.Goal, &e.StartDate, &e.EndDate,
		&state, &e.ClosedAt, &e.CreatedAt, &e.UpdatedAt,
	); err != nil {
		return domain.Era{}, err
	}
	e.ID = domain.EraID(id)
	e.ProjectID = domain.ProjectID(projID)
	e.State = domain.EraState(state)
	return e, nil
}

func nullableEraID(id *domain.EraID) *string {
	if id == nil {
		return nil
	}
	s := string(*id)
	return &s
}

func mapEraError(op string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		if pgErr.ConstraintName == uxEraProjectName {
			return domain.ErrEraNameInUse
		}
		if pgErr.ConstraintName == uxEraActive {
			return domain.ErrActiveEraExists
		}
	}
	return fmt.Errorf("%s: %w", op, err)
}
