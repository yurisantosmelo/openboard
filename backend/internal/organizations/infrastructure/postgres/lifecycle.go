package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

// MarkPendingDeletion places an Organization into Pending Deletion until purgeAfter.
func (r *Organizations) MarkPendingDeletion(ctx context.Context, id domain.OrganizationID, purgeAfter time.Time) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE organizations
		SET deleted_at = NOW(), purge_after = $2
		WHERE id = $1 AND deleted_at IS NULL`,
		string(id), purgeAfter.UTC())
	if err != nil {
		return fmt.Errorf("mark organization pending deletion: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Restore restores a Pending Deletion Organization whose grace period has not ended.
func (r *Organizations) Restore(ctx context.Context, id domain.OrganizationID) (domain.Organization, error) {
	var (
		org domain.Organization
		raw string
	)
	err := r.pool.QueryRow(ctx, `
		UPDATE organizations
		SET deleted_at = NULL, purge_after = NULL
		WHERE id = $1 AND deleted_at IS NOT NULL AND purge_after > NOW()
		RETURNING id::text, name, created_at`,
		string(id)).Scan(&raw, &org.Name, &org.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Organization{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Organization{}, fmt.Errorf("restore organization: %w", err)
	}
	org.ID = domain.OrganizationID(raw)
	return org, nil
}

// ListPendingDeletion returns Organizations currently in Pending Deletion whose grace period has not expired.
func (r *Organizations) ListPendingDeletion(ctx context.Context, page application.PageRequest) ([]domain.Organization, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM organizations WHERE deleted_at IS NOT NULL AND purge_after > NOW()`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count pending deletion organizations: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, name, created_at, deleted_at, purge_after
		FROM organizations
		WHERE deleted_at IS NOT NULL AND purge_after > NOW()
		ORDER BY purge_after ASC, id
		LIMIT $1 OFFSET $2`, page.Limit, page.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list pending deletion organizations: %w", err)
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Organization, error) {
		var (
			o   domain.Organization
			raw string
		)
		if err := row.Scan(&raw, &o.Name, &o.CreatedAt, &o.DeletedAt, &o.PurgeAfter); err != nil {
			return domain.Organization{}, err
		}
		o.ID = domain.OrganizationID(raw)
		return o, nil
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan pending deletion organizations: %w", err)
	}
	return items, total, nil
}

// PurgeExpired permanently deletes Organizations whose Pending Deletion grace period has expired.
func (r *Organizations) PurgeExpired(ctx context.Context) error {
	if _, err := r.pool.Exec(ctx, `DELETE FROM organizations WHERE deleted_at IS NOT NULL AND purge_after <= NOW()`); err != nil {
		return fmt.Errorf("purge expired organizations: %w", err)
	}
	return nil
}

// ListFiltered returns Workspaces the Scope can enter, optionally including Archived ones.
func (r *Workspaces) ListFiltered(
	ctx context.Context,
	id domain.OrganizationID,
	scope application.Scope,
	includeArchived bool,
	page application.PageRequest,
) ([]domain.Workspace, int, error) {
	archivedClause := ` AND w.archived_at IS NULL`
	if includeArchived {
		archivedClause = ``
	}
	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM workspaces w WHERE w.organization_id = $3 AND `+enterable+archivedClause,
		scope.All, nullableUser(scope), string(id)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count workspaces: %w", err)
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+viewedWorkspaceColumns+` FROM workspaces w WHERE w.organization_id = $3 AND `+enterable+archivedClause+
			` ORDER BY lower(w.name), w.id LIMIT $4 OFFSET $5`,
		scope.All, nullableUser(scope), string(id), page.Limit, page.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list workspaces: %w", err)
	}
	workspaces, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Workspace, error) {
		return scanViewedWorkspace(row)
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan workspaces: %w", err)
	}
	return workspaces, total, nil
}

// Archive marks a Workspace Archived inside a transaction that ensures the
// Organization keeps at least one non-Archived Workspace (CONTEXT.md).
func (r *Workspaces) Archive(ctx context.Context, id domain.WorkspaceID) (domain.Workspace, error) {
	var updated domain.Workspace
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if err := ensureNotLastActiveWorkspace(ctx, tx, id); err != nil {
			return err
		}
		ws, err := scanWorkspace(tx.QueryRow(ctx, `
			UPDATE workspaces AS w
			SET archived_at = NOW(), updated_at = NOW()
			WHERE w.id = $1 AND w.deleted_at IS NULL
			RETURNING `+workspaceColumns, string(id)))
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrWorkspaceNotFound
		}
		if err != nil {
			return fmt.Errorf("archive workspace: %w", err)
		}
		updated = ws
		return nil
	})
	return updated, err
}

// Unarchive restores an Archived Workspace back to active state.
func (r *Workspaces) Unarchive(ctx context.Context, id domain.WorkspaceID) (domain.Workspace, error) {
	ws, err := scanWorkspace(r.pool.QueryRow(ctx, `
		UPDATE workspaces AS w
		SET archived_at = NULL, updated_at = NOW()
		WHERE w.id = $1 AND w.deleted_at IS NULL
		RETURNING `+workspaceColumns, string(id)))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workspace{}, domain.ErrWorkspaceNotFound
	}
	if err != nil {
		return domain.Workspace{}, fmt.Errorf("unarchive workspace: %w", err)
	}
	return ws, nil
}

// MarkPendingDeletion places a Workspace into Pending Deletion until purgeAfter,
// rejecting deleting the Organization's last active Workspace.
func (r *Workspaces) MarkPendingDeletion(ctx context.Context, id domain.WorkspaceID, purgeAfter time.Time) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if err := ensureNotLastActiveWorkspace(ctx, tx, id); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `
			UPDATE workspaces
			SET deleted_at = NOW(), purge_after = $2, updated_at = NOW()
			WHERE id = $1 AND deleted_at IS NULL`,
			string(id), purgeAfter.UTC())
		if err != nil {
			return fmt.Errorf("mark workspace pending deletion: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return domain.ErrWorkspaceNotFound
		}
		return nil
	})
}

// FindPendingDeletion returns a Pending Deletion Workspace whose grace period has not expired.
func (r *Workspaces) FindPendingDeletion(ctx context.Context, id domain.WorkspaceID) (domain.Workspace, error) {
	var (
		ws               domain.Workspace
		wsID, orgID, vis string
	)
	err := r.pool.QueryRow(ctx, `
		SELECT w.id::text, w.organization_id::text, w.name, w.visibility, w.created_at, w.updated_at, w.archived_at, w.deleted_at, w.purge_after
		FROM workspaces w
		JOIN organizations o ON o.id = w.organization_id
		WHERE w.id = $1 AND o.deleted_at IS NULL AND w.deleted_at IS NOT NULL AND w.purge_after > NOW()`,
		string(id)).Scan(&wsID, &orgID, &ws.Name, &vis, &ws.CreatedAt, &ws.UpdatedAt, &ws.ArchivedAt, &ws.DeletedAt, &ws.PurgeAfter)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workspace{}, domain.ErrWorkspaceNotFound
	}
	if err != nil {
		return domain.Workspace{}, fmt.Errorf("find pending deletion workspace: %w", err)
	}
	ws.ID = domain.WorkspaceID(wsID)
	ws.OrganizationID = domain.OrganizationID(orgID)
	ws.Visibility = domain.Visibility(vis)
	return ws, nil
}

// Restore restores a Pending Deletion Workspace within its grace period.
func (r *Workspaces) Restore(ctx context.Context, id domain.WorkspaceID) (domain.Workspace, error) {
	ws, err := scanWorkspace(r.pool.QueryRow(ctx, `
		UPDATE workspaces AS w
		SET deleted_at = NULL, purge_after = NULL, updated_at = NOW()
		WHERE w.id = $1 AND w.deleted_at IS NOT NULL AND w.purge_after > NOW()
		  AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = w.organization_id AND o.deleted_at IS NULL)
		RETURNING `+workspaceColumns, string(id)))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workspace{}, domain.ErrWorkspaceNotFound
	}
	if err != nil {
		return domain.Workspace{}, fmt.Errorf("restore workspace: %w", err)
	}
	return ws, nil
}

// ListPendingDeletion returns Pending Deletion Workspaces in organizationID whose grace period has not expired.
func (r *Workspaces) ListPendingDeletion(ctx context.Context, organizationID domain.OrganizationID, page application.PageRequest) ([]domain.Workspace, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `
		SELECT count(*)
		FROM workspaces w
		JOIN organizations o ON o.id = w.organization_id
		WHERE w.organization_id = $1 AND o.deleted_at IS NULL AND w.deleted_at IS NOT NULL AND w.purge_after > NOW()`,
		string(organizationID)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count pending deletion workspaces: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT w.id::text, w.organization_id::text, w.name, w.visibility, w.created_at, w.updated_at, w.archived_at, w.deleted_at, w.purge_after
		FROM workspaces w
		JOIN organizations o ON o.id = w.organization_id
		WHERE w.organization_id = $1 AND o.deleted_at IS NULL AND w.deleted_at IS NOT NULL AND w.purge_after > NOW()
		ORDER BY w.purge_after ASC, w.id
		LIMIT $2 OFFSET $3`, string(organizationID), page.Limit, page.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list pending deletion workspaces: %w", err)
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Workspace, error) {
		var (
			ws               domain.Workspace
			wsID, orgID, vis string
		)
		if err := row.Scan(&wsID, &orgID, &ws.Name, &vis, &ws.CreatedAt, &ws.UpdatedAt, &ws.ArchivedAt, &ws.DeletedAt, &ws.PurgeAfter); err != nil {
			return domain.Workspace{}, err
		}
		ws.ID = domain.WorkspaceID(wsID)
		ws.OrganizationID = domain.OrganizationID(orgID)
		ws.Visibility = domain.Visibility(vis)
		return ws, nil
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan pending deletion workspaces: %w", err)
	}
	return items, total, nil
}

// PurgeExpired permanently deletes Workspaces whose Pending Deletion grace period has expired.
func (r *Workspaces) PurgeExpired(ctx context.Context) error {
	if _, err := r.pool.Exec(ctx, `DELETE FROM workspaces WHERE deleted_at IS NOT NULL AND purge_after <= NOW()`); err != nil {
		return fmt.Errorf("purge expired workspaces: %w", err)
	}
	return nil
}

func ensureNotLastActiveWorkspace(ctx context.Context, tx pgx.Tx, id domain.WorkspaceID) error {
	var (
		orgID    string
		archived bool
	)
	err := tx.QueryRow(ctx, `
		SELECT organization_id::text, archived_at IS NOT NULL
		FROM workspaces
		WHERE id = $1 AND deleted_at IS NULL
		FOR UPDATE`, string(id)).Scan(&orgID, &archived)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrWorkspaceNotFound
	}
	if err != nil {
		return fmt.Errorf("lock target workspace: %w", err)
	}
	if archived {
		return nil
	}
	rows, err := tx.Query(ctx, `
		SELECT id::text
		FROM workspaces
		WHERE organization_id = $1 AND archived_at IS NULL AND deleted_at IS NULL
		ORDER BY id
		FOR UPDATE`, orgID)
	if err != nil {
		return fmt.Errorf("lock active workspaces: %w", err)
	}
	activeIDs, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return fmt.Errorf("scan active workspaces: %w", err)
	}
	if len(activeIDs) <= 1 && (len(activeIDs) == 0 || activeIDs[0] == string(id)) {
		return domain.ErrLastActiveWorkspace
	}
	return nil
}
