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

// uxWorkspaceName is violated when an Organization already uses a Workspace name.
const uxWorkspaceName = "ux_workspaces_organization_name"

const workspaceColumns = `w.id::text, w.organization_id::text, w.name, w.visibility, w.created_at, w.updated_at`

// workspaceRole is the Workspace role a Scope acts with in Workspace w:
// Workspace Owner for those who see all ($1, ADR 0009) and for Organization
// Owners, otherwise their Workspace Membership's role, otherwise Workspace
// Contributor in an Open Workspace of an Organization the User ($2) belongs to.
const workspaceRole = `CASE WHEN $1 OR EXISTS (
	SELECT 1 FROM organization_memberships m
	WHERE m.organization_id = w.organization_id AND m.user_id = $2::uuid AND m.role = 'owner'
) THEN 'owner' ELSE coalesce(
	(SELECT wm.role FROM workspace_memberships wm WHERE wm.workspace_id = w.id AND wm.user_id = $2::uuid),
	(SELECT 'contributor' FROM organization_memberships m
		WHERE m.organization_id = w.organization_id AND m.user_id = $2::uuid AND w.visibility = 'open')) END`

const viewedWorkspaceColumns = workspaceColumns + `, ` + workspaceRole

// enterable keeps the Workspaces a Scope can enter: all of them ($1), every one
// of an Organization the User ($2) owns, Open ones of an Organization they
// belong to, and those they hold a Workspace Membership in.
const enterable = `($1 OR EXISTS (
	SELECT 1 FROM organization_memberships m
	WHERE m.organization_id = w.organization_id AND m.user_id = $2::uuid
		AND (m.role = 'owner' OR w.visibility = 'open')
) OR EXISTS (
	SELECT 1 FROM workspace_memberships wm WHERE wm.workspace_id = w.id AND wm.user_id = $2::uuid))`

// Workspaces stores Workspaces in the workspaces table.
type Workspaces struct {
	pool *pgxpool.Pool
}

// NewWorkspaces returns a Workspaces repository backed by pool.
func NewWorkspaces(pool *pgxpool.Pool) *Workspaces {
	return &Workspaces{pool: pool}
}

// RoleIn returns the role scope acts with in the Organization, or
// domain.ErrUnknownOrganization when scope does not see it.
func (r *Workspaces) RoleIn(ctx context.Context, id domain.OrganizationID, scope application.Scope) (domain.Role, error) {
	return organizationRole(ctx, r.pool, id, scope, domain.ErrUnknownOrganization)
}

// Create inserts the Workspace and the creator's Workspace Membership in one
// transaction. An Administrator without an Organization Membership gets none:
// they already act as Organization Owner (ADR 0009).
func (r *Workspaces) Create(ctx context.Context, n application.NewWorkspace) (domain.Workspace, error) {
	var ws domain.Workspace
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var err error
		ws, err = insertWorkspace(ctx, tx, n)
		return err
	})
	return ws, mapWorkspaceError(err)
}

func insertWorkspace(ctx context.Context, tx pgx.Tx, n application.NewWorkspace) (domain.Workspace, error) {
	ws, err := scanWorkspace(tx.QueryRow(ctx, `INSERT INTO workspaces AS w (organization_id, name, visibility)
		VALUES ($1, $2, $3) RETURNING `+workspaceColumns,
		string(n.OrganizationID), n.Name, string(n.Visibility)))
	if err != nil {
		return domain.Workspace{}, fmt.Errorf("insert workspace: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO workspace_memberships (workspace_id, organization_id, user_id, role)
		SELECT $1::uuid, m.organization_id, m.user_id, $4 FROM organization_memberships m
		WHERE m.organization_id = $2::uuid AND m.user_id = $3::uuid`,
		string(ws.ID), string(n.OrganizationID), string(n.CreatorID), string(domain.WorkspaceRoleOwner)); err != nil {
		return domain.Workspace{}, fmt.Errorf("insert workspace owner: %w", err)
	}
	return ws, nil
}

// Find returns the Workspace with id if scope can enter it, or
// domain.ErrWorkspaceNotFound.
func (r *Workspaces) Find(ctx context.Context, id domain.WorkspaceID, scope application.Scope) (domain.Workspace, error) {
	ws, err := scanViewedWorkspace(r.pool.QueryRow(ctx, `SELECT `+viewedWorkspaceColumns+` FROM workspaces w
		WHERE w.id = $3 AND `+enterable, scope.All, nullableUser(scope), string(id)))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workspace{}, domain.ErrWorkspaceNotFound
	}
	return ws, err
}

// Update applies the change, keeping the fields it leaves nil, and returns the
// Workspace without ViewerRole.
func (r *Workspaces) Update(ctx context.Context, c application.WorkspaceChange) (domain.Workspace, error) {
	var visibility *string
	if c.Visibility != nil {
		v := string(*c.Visibility)
		visibility = &v
	}
	ws, err := scanWorkspace(r.pool.QueryRow(ctx, `UPDATE workspaces AS w
		SET name = coalesce($2, w.name), visibility = coalesce($3, w.visibility), updated_at = now()
		WHERE w.id = $1 RETURNING `+workspaceColumns, string(c.ID), c.Name, visibility))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workspace{}, domain.ErrWorkspaceNotFound
	}
	return ws, mapWorkspaceError(err)
}

// List returns one page of the Organization's Workspaces scope can enter,
// ordered by name ignoring case and then by ID so pages stay stable.
func (r *Workspaces) List(ctx context.Context, id domain.OrganizationID, scope application.Scope, page application.PageRequest) ([]domain.Workspace, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM workspaces w WHERE w.organization_id = $3 AND `+enterable,
		scope.All, nullableUser(scope), string(id)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count workspaces: %w", err)
	}
	rows, err := r.pool.Query(ctx, `SELECT `+viewedWorkspaceColumns+` FROM workspaces w
		WHERE w.organization_id = $3 AND `+enterable+` ORDER BY lower(w.name), w.id LIMIT $4 OFFSET $5`,
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

func scanWorkspace(row pgx.Row, extra ...any) (domain.Workspace, error) {
	var (
		ws                     domain.Workspace
		id, organizationID, vi string
	)
	dest := append([]any{&id, &organizationID, &ws.Name, &vi, &ws.CreatedAt, &ws.UpdatedAt}, extra...)
	if err := row.Scan(dest...); err != nil {
		return domain.Workspace{}, err
	}
	ws.ID = domain.WorkspaceID(id)
	ws.OrganizationID = domain.OrganizationID(organizationID)
	ws.Visibility = domain.Visibility(vi)
	return ws, nil
}

// scanViewedWorkspace reads viewedWorkspaceColumns.
func scanViewedWorkspace(row pgx.Row) (domain.Workspace, error) {
	var role string
	ws, err := scanWorkspace(row, &role)
	ws.ViewerRole = domain.Role(role)
	return ws, err
}

func mapWorkspaceError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == uxWorkspaceName {
		return domain.ErrWorkspaceNameTaken
	}
	return err
}
