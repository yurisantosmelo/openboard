// Package postgres implements the Organization repositories on PostgreSQL with pgx.
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

// fkMembershipUser is violated when an Organization Membership names no User.
const fkMembershipUser = "fk_organization_memberships_user"

// Organizations stores Organizations in the organizations table.
type Organizations struct {
	pool *pgxpool.Pool
}

// NewOrganizations returns an Organizations repository backed by pool.
func NewOrganizations(pool *pgxpool.Pool) *Organizations {
	return &Organizations{pool: pool}
}

// Create inserts the Organization, its Open Default Workspace and the Owner's
// Organization Membership in one transaction.
func (r *Organizations) Create(ctx context.Context, n application.NewOrganization) (domain.Organization, error) {
	var org domain.Organization
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var err error
		org, err = insertOrganization(ctx, tx, n)
		return err
	})
	return org, mapError(err)
}

func insertOrganization(ctx context.Context, tx pgx.Tx, n application.NewOrganization) (domain.Organization, error) {
	var deactivated bool
	err := tx.QueryRow(ctx, `SELECT deactivated_at IS NOT NULL FROM users WHERE id = $1`, string(n.OwnerID)).Scan(&deactivated)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Organization{}, domain.ErrOwnerNotFound
	}
	if err != nil {
		return domain.Organization{}, fmt.Errorf("check owner user: %w", err)
	}
	if deactivated {
		return domain.Organization{}, domain.ErrUserDeactivated
	}

	var (
		org domain.Organization
		id  string
	)
	err = tx.QueryRow(ctx, `INSERT INTO organizations (name) VALUES ($1) RETURNING id::text, name, created_at`, n.Name).
		Scan(&id, &org.Name, &org.CreatedAt)
	if err != nil {
		return domain.Organization{}, fmt.Errorf("insert organization: %w", err)
	}
	org.ID = domain.OrganizationID(id)
	// Only Administrators create Organizations, and they act as Organization Owner.
	org.ViewerRole = domain.RoleOwner
	if _, err := tx.Exec(ctx, `INSERT INTO workspaces (organization_id, name, visibility) VALUES ($1, $2, $3)`,
		id, n.DefaultWorkspaceName, string(domain.VisibilityOpen)); err != nil {
		return domain.Organization{}, fmt.Errorf("insert default workspace: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, $3)`,
		id, string(n.OwnerID), string(domain.RoleOwner)); err != nil {
		return domain.Organization{}, fmt.Errorf("insert owner membership: %w", err)
	}
	return org, nil
}

func mapError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.ConstraintName == fkMembershipUser {
		return domain.ErrOwnerNotFound
	}
	return err
}
