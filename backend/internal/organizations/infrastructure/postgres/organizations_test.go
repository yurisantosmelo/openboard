package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/database"
	"github.com/elyosemite/openboard/backend/internal/testsupport/postgrestest"
)

var pool *pgxpool.Pool

func TestMain(m *testing.M) { os.Exit(runWithDatabase(m)) }

func runWithDatabase(m *testing.M) int {
	ctx := context.Background()
	db, err := postgrestest.Start(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer db.Stop()
	pool, err = database.Open(ctx, db.URL)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer pool.Close()
	return m.Run()
}

// createUser inserts a User directly: the identity module owns Users.
func createUser(t *testing.T, username string) domain.UserID {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `TRUNCATE users, organizations CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	var id string
	err := pool.QueryRow(ctx, `INSERT INTO users (username, name, password_hash) VALUES ($1, $1, 'hash') RETURNING id::text`, username).Scan(&id)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return domain.UserID(id)
}

func TestCreateStoresOrganizationDefaultWorkspaceAndOwner(t *testing.T) {
	ctx := context.Background()
	owner := createUser(t, "marina")

	org, err := NewOrganizations(pool).Create(ctx, application.NewOrganization{
		Name: "Acme", OwnerID: owner, DefaultWorkspaceName: "Default",
	})
	if err != nil {
		t.Fatal(err)
	}
	if org.ID == "" || org.Name != "Acme" || org.CreatedAt.IsZero() {
		t.Fatalf("returned %+v", org)
	}

	var wsName, visibility string
	err = pool.QueryRow(ctx, `SELECT name, visibility FROM workspaces WHERE organization_id = $1`, string(org.ID)).Scan(&wsName, &visibility)
	if err != nil || wsName != "Default" || visibility != "open" {
		t.Errorf("default workspace = %q %q, %v; want Default open", wsName, visibility, err)
	}
	var role string
	err = pool.QueryRow(ctx, `SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		string(org.ID), string(owner)).Scan(&role)
	if err != nil || role != "owner" {
		t.Errorf("membership role = %q, %v; want owner", role, err)
	}
}

func TestCreateWithUnknownOwnerStoresNothing(t *testing.T) {
	ctx := context.Background()
	createUser(t, "marina")

	_, err := NewOrganizations(pool).Create(ctx, application.NewOrganization{
		Name: "Acme", OwnerID: "00000000-0000-0000-0000-000000000000", DefaultWorkspaceName: "Default",
	})
	if !errors.Is(err, domain.ErrOwnerNotFound) {
		t.Fatalf("err = %v, want ErrOwnerNotFound", err)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM organizations`).Scan(&n); err != nil || n != 0 {
		t.Errorf("organizations = %d, %v; the transaction must roll back", n, err)
	}
}

func TestCreateWithDeactivatedOwnerIsRejected(t *testing.T) {
	ctx := context.Background()
	owner := createUser(t, "marina")
	if _, err := pool.Exec(ctx, `UPDATE users SET deactivated_at = NOW() WHERE id = $1`, string(owner)); err != nil {
		t.Fatal(err)
	}

	_, err := NewOrganizations(pool).Create(ctx, application.NewOrganization{
		Name: "Acme", OwnerID: owner, DefaultWorkspaceName: "Default",
	})
	if !errors.Is(err, domain.ErrUserDeactivated) {
		t.Fatalf("err = %v, want ErrUserDeactivated", err)
	}
}

func TestCreateReportsOtherFailures(t *testing.T) {
	createUser(t, "marina")
	_, err := NewOrganizations(pool).Create(context.Background(), application.NewOrganization{Name: " ", OwnerID: "x"})
	if err == nil || errors.Is(err, domain.ErrOwnerNotFound) {
		t.Fatalf("err = %v, want a storage error", err)
	}
}
