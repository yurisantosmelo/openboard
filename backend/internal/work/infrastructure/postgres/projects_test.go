package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/platform/database"
	"github.com/elyosemite/openboard/backend/internal/testsupport/postgrestest"
	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
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

func seedWorkspace(t *testing.T) (domain.OrganizationID, domain.WorkspaceID) {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `TRUNCATE organizations CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	var orgID, wsID string
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name) VALUES ('Acme') RETURNING id::text`).Scan(&orgID); err != nil {
		t.Fatalf("insert org: %v", err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO workspaces (organization_id, name, visibility) VALUES ($1, 'Engineering', 'open') RETURNING id::text`, orgID).Scan(&wsID); err != nil {
		t.Fatalf("insert workspace: %v", err)
	}
	return domain.OrganizationID(orgID), domain.WorkspaceID(wsID)
}

func newDefaultProject(orgID domain.OrganizationID, wsID domain.WorkspaceID, name string) application.NewProject {
	return application.NewProject{
		OrganizationID: orgID,
		WorkspaceID:    wsID,
		Name:           name,
		Statuses:       domain.DefaultStatuses(),
		WorkItemTypes:  domain.DefaultWorkItemTypes(),
		Hierarchy:      domain.DefaultHierarchy(),
	}
}

func TestCreateAndFindProject(t *testing.T) {
	ctx := context.Background()
	orgID, wsID := seedWorkspace(t)
	repo := NewProjects(pool)

	created, err := repo.Create(ctx, newDefaultProject(orgID, wsID, "Platform"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID == "" || created.Name != "Platform" {
		t.Fatalf("Create = %+v", created)
	}
	found, err := repo.Find(ctx, created.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if found.ID != created.ID || found.OrganizationID != orgID || found.WorkspaceID != wsID {
		t.Fatalf("Find = %+v", found)
	}
}

func TestCreateSeedsDefaultStatuses(t *testing.T) {
	ctx := context.Background()
	orgID, wsID := seedWorkspace(t)
	repo := NewProjects(pool)

	created, err := repo.Create(ctx, newDefaultProject(orgID, wsID, "Platform"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	statuses, err := repo.ListStatuses(ctx, created.ID)
	if err != nil {
		t.Fatalf("ListStatuses: %v", err)
	}
	if len(statuses) != 4 || statuses[0].Name != "Backlog" || statuses[3].Group != domain.StatusGroupCompleted {
		t.Fatalf("unexpected statuses = %+v", statuses)
	}
}

func TestCreateSeedsDefaultWorkItemTypes(t *testing.T) {
	ctx := context.Background()
	orgID, wsID := seedWorkspace(t)
	repo := NewProjects(pool)

	created, err := repo.Create(ctx, newDefaultProject(orgID, wsID, "Platform"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	types, err := repo.ListWorkItemTypes(ctx, created.ID)
	if err != nil {
		t.Fatalf("ListWorkItemTypes: %v", err)
	}
	if len(types) != 6 || types[0].Name != "Epic" || len(types[0].AllowedChildTypeIDs) != 1 {
		t.Fatalf("unexpected types = %+v", types)
	}
	if types[2].Name != "User Story" || len(types[2].AllowedChildTypeIDs) != 2 || len(types[5].AllowedChildTypeIDs) != 0 {
		t.Errorf("unexpected hierarchy: userStory=%+v subtask=%+v", types[2], types[5])
	}
}

func TestListByWorkspaceAndRename(t *testing.T) {
	ctx := context.Background()
	orgID, wsID := seedWorkspace(t)
	repo := NewProjects(pool)

	beta, err := repo.Create(ctx, newDefaultProject(orgID, wsID, "Beta"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Create(ctx, newDefaultProject(orgID, wsID, "alpha")); err != nil {
		t.Fatal(err)
	}

	page, total, err := repo.ListByWorkspace(ctx, wsID, application.PageRequest{Limit: 1, Offset: 0})
	if err != nil || total != 2 || len(page) != 1 || page[0].Name != "alpha" {
		t.Fatalf("ListByWorkspace = %+v, %d, %v", page, total, err)
	}

	renamed, err := repo.Rename(ctx, beta.ID, "Gamma")
	if err != nil || renamed.Name != "Gamma" {
		t.Fatalf("Rename = %+v, %v", renamed, err)
	}
	if _, err := repo.Rename(ctx, beta.ID, "ALPHA"); !errors.Is(err, domain.ErrProjectNameInUse) {
		t.Errorf("duplicate Rename err = %v, want ErrProjectNameInUse", err)
	}
}

func TestProjectRepositoryErrors(t *testing.T) {
	ctx := context.Background()
	orgID, wsID := seedWorkspace(t)
	repo := NewProjects(pool)

	if _, err := repo.Create(ctx, newDefaultProject(orgID, wsID, "Platform")); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Create(ctx, newDefaultProject(orgID, wsID, "PLATFORM")); !errors.Is(err, domain.ErrProjectNameInUse) {
		t.Errorf("duplicate Create err = %v, want ErrProjectNameInUse", err)
	}
	if _, err := repo.Find(ctx, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unknown Find err = %v, want ErrNotFound", err)
	}
	if _, err := repo.Rename(ctx, "00000000-0000-0000-0000-000000000000", "Other"); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unknown Rename err = %v, want ErrNotFound", err)
	}
	if _, _, err := repo.ListByWorkspace(ctx, "not-a-uuid", application.PageRequest{Limit: 10}); err == nil {
		t.Error("invalid workspace id must fail")
	}
	if _, err := repo.ListStatuses(ctx, "not-a-uuid"); err == nil {
		t.Error("invalid project id in ListStatuses must fail")
	}
	if _, err := repo.ListWorkItemTypes(ctx, "not-a-uuid"); err == nil {
		t.Error("invalid project id in ListWorkItemTypes must fail")
	}
}
