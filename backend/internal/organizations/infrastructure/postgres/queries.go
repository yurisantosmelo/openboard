package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

// visible keeps active Organizations a Scope sees: all of them ($1), or those
// the User ($2) holds an Organization Membership in. Pending Deletion
// Organizations are invisible here (CONTEXT.md).
const visible = `o.deleted_at IS NULL AND ($1 OR EXISTS (
	SELECT 1 FROM organization_memberships m WHERE m.organization_id = o.id AND m.user_id = $2::uuid))`

// viewerRole is the role a Scope acts with in Organization o: Organization
// Owner for those who see all ($1, ADR 0009), otherwise their Membership's role.
const viewerRole = `CASE WHEN $1 THEN 'owner' ELSE (
	SELECT m.role FROM organization_memberships m WHERE m.organization_id = o.id AND m.user_id = $2::uuid) END`

const organizationColumns = `o.id::text, o.name, o.created_at, ` + viewerRole

// Find returns the Organization with id if scope sees it, or domain.ErrNotFound.
func (r *Organizations) Find(ctx context.Context, id domain.OrganizationID, scope application.Scope) (domain.Organization, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+organizationColumns+` FROM organizations o
		WHERE o.id = $3 AND `+visible, scope.All, nullableUser(scope), string(id))
	org, err := scanOrganization(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Organization{}, domain.ErrNotFound
	}
	return org, err
}

// List returns one page of the Organizations scope sees, ordered by name
// ignoring case and then by ID so pages stay stable, and how many it sees
// in total.
func (r *Organizations) List(ctx context.Context, scope application.Scope, page application.PageRequest) ([]domain.Organization, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM organizations o WHERE `+visible,
		scope.All, nullableUser(scope)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count organizations: %w", err)
	}
	rows, err := r.pool.Query(ctx, `SELECT `+organizationColumns+` FROM organizations o
		WHERE `+visible+` ORDER BY lower(o.name), o.id LIMIT $3 OFFSET $4`,
		scope.All, nullableUser(scope), page.Limit, page.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list organizations: %w", err)
	}
	orgs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Organization, error) {
		return scanOrganization(row)
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan organizations: %w", err)
	}
	return orgs, total, nil
}

// nullableUser keeps an empty UserID from failing the uuid cast.
func nullableUser(scope application.Scope) *string {
	if scope.UserID == "" {
		return nil
	}
	id := string(scope.UserID)
	return &id
}

func scanOrganization(row pgx.Row) (domain.Organization, error) {
	var (
		org      domain.Organization
		id, role string
	)
	if err := row.Scan(&id, &org.Name, &org.CreatedAt, &role); err != nil {
		return domain.Organization{}, err
	}
	org.ID = domain.OrganizationID(id)
	org.ViewerRole = domain.Role(role)
	return org, nil
}
