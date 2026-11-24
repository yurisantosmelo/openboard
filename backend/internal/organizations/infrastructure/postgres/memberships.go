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

// pkOrganizationMembership is violated when a User already holds an Organization Membership in the Organization.
const pkOrganizationMembership = "organization_memberships_pkey"

// Memberships stores Organization Memberships in the organization_memberships table.
type Memberships struct {
	pool *pgxpool.Pool
}

// NewMemberships returns a Memberships repository backed by pool.
func NewMemberships(pool *pgxpool.Pool) *Memberships {
	return &Memberships{pool: pool}
}

// RoleIn returns the role scope acts with in the Organization, or
// domain.ErrNotFound when scope does not see it.
func (r *Memberships) RoleIn(ctx context.Context, id domain.OrganizationID, scope application.Scope) (domain.Role, error) {
	return organizationRole(ctx, r.pool, id, scope, domain.ErrNotFound)
}

// Create inserts an Organization Membership and returns it with the linked
// User's Username and Name. It returns domain.ErrMembershipExists when the
// User already belongs to the Organization.
func (r *Memberships) Create(ctx context.Context, n application.NewOrganizationMembership) (domain.OrganizationMembership, error) {
	row := r.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO organization_memberships (organization_id, user_id, role)
			VALUES ($1, $2, $3)
			RETURNING organization_id, user_id, role, created_at
		)
		SELECT i.organization_id::text, i.user_id::text, u.username, u.name, i.role, i.created_at
		FROM inserted i
		JOIN users u ON u.id = i.user_id`,
		string(n.OrganizationID), string(n.UserID), string(n.Role))
	m, err := scanMembership(row)
	if err != nil {
		return domain.OrganizationMembership{}, mapMembershipError(err)
	}
	return m, nil
}

// List returns one page of the Organization's Memberships, ordered by name
// ignoring case, then username and user ID so pages stay stable.
func (r *Memberships) List(ctx context.Context, id domain.OrganizationID, page application.PageRequest) ([]domain.OrganizationMembership, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM organization_memberships WHERE organization_id = $1`,
		string(id)).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count organization memberships: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT m.organization_id::text, m.user_id::text, u.username, u.name, m.role, m.created_at
		FROM organization_memberships m
		JOIN users u ON u.id = m.user_id
		WHERE m.organization_id = $1
		ORDER BY lower(u.name), u.username, m.user_id
		LIMIT $2 OFFSET $3`,
		string(id), page.Limit, page.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list organization memberships: %w", err)
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.OrganizationMembership, error) {
		return scanMembership(row)
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan organization memberships: %w", err)
	}
	return items, total, nil
}

func scanMembership(row pgx.Row) (domain.OrganizationMembership, error) {
	var (
		m                         domain.OrganizationMembership
		organizationID, userID, r string
	)
	if err := row.Scan(&organizationID, &userID, &m.Username, &m.Name, &r, &m.CreatedAt); err != nil {
		return domain.OrganizationMembership{}, err
	}
	m.OrganizationID = domain.OrganizationID(organizationID)
	m.UserID = domain.UserID(userID)
	m.Role = domain.Role(r)
	return m, nil
}

func mapMembershipError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == pkOrganizationMembership {
		return domain.ErrMembershipExists
	}
	return fmt.Errorf("insert organization membership: %w", err)
}

func organizationRole(ctx context.Context, pool *pgxpool.Pool, id domain.OrganizationID, scope application.Scope, notFound error) (domain.Role, error) {
	var role *string
	err := pool.QueryRow(ctx, `SELECT `+viewerRole+` FROM organizations o WHERE o.id = $3`,
		scope.All, nullableUser(scope), string(id)).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && role == nil) {
		return "", notFound
	}
	if err != nil {
		return "", fmt.Errorf("read organization role: %w", err)
	}
	return domain.Role(*role), nil
}
