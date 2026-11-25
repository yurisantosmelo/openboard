package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

const (
	pkWorkspaceMembership = "workspace_memberships_pkey"
	fkWorkspaceOrgMember  = "fk_workspace_memberships_organization_membership"
)

// WorkspaceMemberships stores Workspace Memberships in the workspace_memberships table.
type WorkspaceMemberships struct {
	pool *pgxpool.Pool
}

// NewWorkspaceMemberships returns a WorkspaceMemberships repository backed by pool.
func NewWorkspaceMemberships(pool *pgxpool.Pool) *WorkspaceMemberships {
	return &WorkspaceMemberships{pool: pool}
}

// FindWorkspace returns the Workspace with id if scope can enter it, or
// domain.ErrWorkspaceNotFound.
func (r *WorkspaceMemberships) FindWorkspace(ctx context.Context, id domain.WorkspaceID, scope application.Scope) (domain.Workspace, error) {
	return NewWorkspaces(r.pool).Find(ctx, id, scope)
}

// Create links a User holding an Organization Membership in the Workspace's
// Organization to the Workspace.
func (r *WorkspaceMemberships) Create(ctx context.Context, n application.NewWorkspaceMembership) (domain.WorkspaceMembership, error) {
	var created domain.WorkspaceMembership
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var userID string
		err := tx.QueryRow(ctx, `
			SELECT m.user_id::text
			FROM organization_memberships m
			JOIN users u ON u.id = m.user_id
			WHERE m.organization_id = $1 AND u.username = $2`,
			string(n.OrganizationID), n.Username).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrOrganizationMemberNotFound
		}
		if err != nil {
			return fmt.Errorf("find organization member: %w", err)
		}
		created, err = insertWorkspaceMembership(ctx, tx, n, userID)
		return err
	})
	return created, err
}

func insertWorkspaceMembership(ctx context.Context, tx pgx.Tx, n application.NewWorkspaceMembership, userID string) (domain.WorkspaceMembership, error) {
	row := tx.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO workspace_memberships (workspace_id, organization_id, user_id, role)
			VALUES ($1, $2, $3, $4)
			RETURNING workspace_id, organization_id, user_id, role, created_at
		)
		SELECT i.workspace_id::text, i.organization_id::text, i.user_id::text, u.username, u.name, i.role, i.created_at
		FROM inserted i
		JOIN users u ON u.id = i.user_id`,
		string(n.WorkspaceID), string(n.OrganizationID), userID, string(n.Role))
	m, err := scanWorkspaceMembership(row)
	if err != nil {
		return domain.WorkspaceMembership{}, mapWorkspaceMembershipError(err)
	}
	return m, nil
}

// List returns one page of the Workspace's Memberships, ordered by name
// ignoring case, then username and user ID so pages stay stable.
func (r *WorkspaceMemberships) List(ctx context.Context, id domain.WorkspaceID, page application.PageRequest) ([]domain.WorkspaceMembership, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM workspace_memberships WHERE workspace_id = $1`,
		string(id)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count workspace memberships: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT m.workspace_id::text, m.organization_id::text, m.user_id::text, u.username, u.name, m.role, m.created_at
		FROM workspace_memberships m
		JOIN users u ON u.id = m.user_id
		WHERE m.workspace_id = $1
		ORDER BY lower(u.name), u.username, m.user_id
		LIMIT $2 OFFSET $3`,
		string(id), page.Limit, page.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list workspace memberships: %w", err)
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.WorkspaceMembership, error) {
		return scanWorkspaceMembership(row)
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan workspace memberships: %w", err)
	}
	return items, total, nil
}

// UpdateRole changes a User's role in the Workspace.
func (r *WorkspaceMemberships) UpdateRole(ctx context.Context, id domain.WorkspaceID, userID domain.UserID, role domain.Role) (domain.WorkspaceMembership, error) {
	row := r.pool.QueryRow(ctx, `
		WITH updated AS (
			UPDATE workspace_memberships
			SET role = $3
			WHERE workspace_id = $1 AND user_id = $2
			RETURNING workspace_id, organization_id, user_id, role, created_at
		)
		SELECT m.workspace_id::text, m.organization_id::text, m.user_id::text, u.username, u.name, m.role, m.created_at
		FROM updated m
		JOIN users u ON u.id = m.user_id`,
		string(id), string(userID), string(role))
	m, err := scanWorkspaceMembership(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkspaceMembership{}, domain.ErrWorkspaceMembershipNotFound
	}
	if err != nil {
		return domain.WorkspaceMembership{}, fmt.Errorf("update workspace membership: %w", err)
	}
	return m, nil
}

// Delete removes a User's Workspace Membership.
func (r *WorkspaceMemberships) Delete(ctx context.Context, id domain.WorkspaceID, userID domain.UserID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
		string(id), string(userID))
	if err != nil {
		return fmt.Errorf("delete workspace membership: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrWorkspaceMembershipNotFound
	}
	return nil
}

func scanWorkspaceMembership(row pgx.Row) (domain.WorkspaceMembership, error) {
	var (
		m                                      domain.WorkspaceMembership
		workspaceID, organizationID, userID, r string
	)
	if err := row.Scan(&workspaceID, &organizationID, &userID, &m.Username, &m.Name, &r, &m.CreatedAt); err != nil {
		return domain.WorkspaceMembership{}, err
	}
	m.WorkspaceID = domain.WorkspaceID(workspaceID)
	m.OrganizationID = domain.OrganizationID(organizationID)
	m.UserID = domain.UserID(userID)
	m.Role = domain.Role(r)
	return m, nil
}

func mapWorkspaceMembershipError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.ConstraintName {
		case pkWorkspaceMembership:
			return domain.ErrWorkspaceMembershipExists
		case fkWorkspaceOrgMember:
			return domain.ErrOrganizationMemberNotFound
		}
	}
	return fmt.Errorf("insert workspace membership: %w", err)
}
