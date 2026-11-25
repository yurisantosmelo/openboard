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

const linkSelectColumns = `
	l.id::text, l.project_id::text,
	l.source_work_item_id::text, s.title,
	l.target_work_item_id::text, t.title,
	l.kind, l.created_at`

// Links stores non-hierarchical Work Item Links in PostgreSQL.
type Links struct {
	pool *pgxpool.Pool
}

// NewLinks returns a Links repository backed by pool.
func NewLinks(pool *pgxpool.Pool) *Links {
	return &Links{pool: pool}
}

// ListForWorkItem returns all Links where workItemID is either source or target.
func (r *Links) ListForWorkItem(ctx context.Context, workItemID domain.WorkItemID) ([]domain.Link, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+linkSelectColumns+`
		FROM work_item_links l
		JOIN work_items s ON s.id = l.source_work_item_id
		JOIN work_items t ON t.id = l.target_work_item_id
		WHERE l.source_work_item_id = $1 OR l.target_work_item_id = $1
		ORDER BY l.created_at, l.id`, string(workItemID))
	if err != nil {
		return nil, fmt.Errorf("list work item links: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Link, error) {
		return scanLink(row)
	})
}

// Create inserts a Link and returns it with source and target Work Item titles.
func (r *Links) Create(
	ctx context.Context,
	projectID domain.ProjectID,
	source, target domain.WorkItemID,
	kind domain.LinkKind,
) (domain.Link, error) {
	row := r.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO work_item_links (project_id, source_work_item_id, target_work_item_id, kind)
			VALUES ($1, $2, $3, $4)
			RETURNING *
		)
		SELECT `+linkSelectColumns+`
		FROM inserted l
		JOIN work_items s ON s.id = l.source_work_item_id
		JOIN work_items t ON t.id = l.target_work_item_id`,
		string(projectID), string(source), string(target), string(kind))
	link, err := scanLink(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
			return domain.Link{}, domain.ErrLinkExists
		}
		return domain.Link{}, fmt.Errorf("create work item link: %w", err)
	}
	return link, nil
}

// Delete removes linkID when it belongs to projectID and connects workItemID.
func (r *Links) Delete(ctx context.Context, projectID domain.ProjectID, workItemID domain.WorkItemID, linkID domain.LinkID) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM work_item_links
		WHERE id = $1 AND project_id = $2
		  AND (source_work_item_id = $3 OR target_work_item_id = $3)`,
		string(linkID), string(projectID), string(workItemID))
	if err != nil {
		return fmt.Errorf("delete work item link: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrLinkNotFound
	}
	return nil
}

func scanLink(row pgx.Row) (domain.Link, error) {
	var (
		l                           domain.Link
		id, projID, srcID, tgtID, k string
	)
	if err := row.Scan(&id, &projID, &srcID, &l.SourceTitle, &tgtID, &l.TargetTitle, &k, &l.CreatedAt); err != nil {
		return domain.Link{}, err
	}
	l.ID = domain.LinkID(id)
	l.ProjectID = domain.ProjectID(projID)
	l.SourceWorkItemID = domain.WorkItemID(srcID)
	l.TargetWorkItemID = domain.WorkItemID(tgtID)
	l.Kind = domain.LinkKind(k)
	return l, nil
}
