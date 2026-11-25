package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

func mustCreateWS(t *testing.T, repo *Workspaces, orgID domain.OrganizationID, owner domain.UserID, name string) domain.Workspace {
	t.Helper()
	ws, err := repo.Create(context.Background(), application.NewWorkspace{
		OrganizationID: orgID, Name: name, Visibility: domain.VisibilityOpen, CreatorID: owner,
	})
	if err != nil {
		t.Fatalf("create workspace %s: %v", name, err)
	}
	return ws
}

func TestWorkspaceArchiveAndLastWorkspacePostgres(t *testing.T) {
	ctx := context.Background()
	owner := createUser(t, "lc_owner")
	org := seed(t, owner, "AcmeLC")["AcmeLC"]
	workspaces := NewWorkspaces(pool)
	scope := application.Scope{UserID: owner}

	list, total, err := workspaces.List(ctx, org.ID, scope, application.PageRequest{Limit: 10})
	if err != nil || total != 1 {
		t.Fatalf("list default workspaces: got (%d, %v)", total, err)
	}
	defaultWS := list[0]

	if _, err := workspaces.Archive(ctx, defaultWS.ID); !errors.Is(err, domain.ErrLastActiveWorkspace) {
		t.Fatalf("Archive last active workspace: got %v, want ErrLastActiveWorkspace", err)
	}
	if err := workspaces.MarkPendingDeletion(ctx, defaultWS.ID, time.Now().UTC().Add(time.Hour)); !errors.Is(err, domain.ErrLastActiveWorkspace) {
		t.Fatalf("Delete last active workspace: got %v, want ErrLastActiveWorkspace", err)
	}

	ws2 := mustCreateWS(t, workspaces, org.ID, owner, "Design")
	if archived, err := workspaces.Archive(ctx, ws2.ID); err != nil || !archived.IsArchived() {
		t.Fatalf("Archive ws2: got (%+v, %v)", archived, err)
	}
	assertWorkspaceCounts(t, workspaces, org.ID, scope, 1, 2)
	if unarchived, err := workspaces.Unarchive(ctx, ws2.ID); err != nil || unarchived.IsArchived() {
		t.Fatalf("Unarchive ws2: got (%+v, %v)", unarchived, err)
	}
}

func assertWorkspaceCounts(t *testing.T, repo *Workspaces, orgID domain.OrganizationID, scope application.Scope, wantDefault, wantAll int) {
	t.Helper()
	_, defaultTotal, err := repo.List(context.Background(), orgID, scope, application.PageRequest{Limit: 10})
	if err != nil {
		t.Fatalf("list default: %v", err)
	}
	_, allTotal, err := repo.ListFiltered(context.Background(), orgID, scope, true, application.PageRequest{Limit: 10})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if defaultTotal != wantDefault || allTotal != wantAll {
		t.Fatalf("expected default=%d all=%d, got (%d, %d)", wantDefault, wantAll, defaultTotal, allTotal)
	}
}

func TestWorkspacePendingDeletionAndPurgePostgres(t *testing.T) {
	ctx := context.Background()
	owner := createUser(t, "lc_wsdel")
	org := seed(t, owner, "WsDelLC")["WsDelLC"]
	workspaces := NewWorkspaces(pool)
	scope := application.Scope{UserID: owner}

	ws2 := mustCreateWS(t, workspaces, org.ID, owner, "Ops")
	if err := workspaces.MarkPendingDeletion(ctx, ws2.ID, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatalf("MarkPendingDeletion ws2: %v", err)
	}
	if _, err := workspaces.Find(ctx, ws2.ID, scope); !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Fatalf("Find pending ws2: got %v, want ErrWorkspaceNotFound", err)
	}
	pendingWS, total, err := workspaces.ListPendingDeletion(ctx, org.ID, application.PageRequest{Limit: 10})
	if err != nil || total != 1 || pendingWS[0].ID != ws2.ID {
		t.Fatalf("ListPendingDeletion ws: got (%+v, %d, %v)", pendingWS, total, err)
	}
	if _, err := workspaces.Restore(ctx, ws2.ID); err != nil {
		t.Fatalf("Restore ws2: %v", err)
	}
	assertWorkspacePurged(t, workspaces, ws2.ID)
}

func assertWorkspacePurged(t *testing.T, workspaces *Workspaces, wsID domain.WorkspaceID) {
	t.Helper()
	ctx := context.Background()
	if err := workspaces.MarkPendingDeletion(ctx, wsID, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatalf("MarkPendingDeletion ws for purge: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE workspaces SET deleted_at = NOW() - INTERVAL '2 hours', purge_after = NOW() - INTERVAL '1 hour' WHERE id = $1`, string(wsID)); err != nil {
		t.Fatalf("backdate purge window: %v", err)
	}
	if err := workspaces.PurgeExpired(ctx); err != nil {
		t.Fatalf("PurgeExpired ws: %v", err)
	}
	if _, err := workspaces.FindPendingDeletion(ctx, wsID); !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Fatalf("FindPendingDeletion after purge: got %v, want ErrWorkspaceNotFound", err)
	}
}

func TestOrgPendingDeletionAndRestorePostgres(t *testing.T) {
	ctx := context.Background()
	owner := createUser(t, "lc_orgdel")
	org := seed(t, owner, "GlobexLC")["GlobexLC"]
	orgs := NewOrganizations(pool)
	workspaces := NewWorkspaces(pool)
	scope := application.Scope{UserID: owner}

	ws2 := mustCreateWS(t, workspaces, org.ID, owner, "Core")
	if err := orgs.MarkPendingDeletion(ctx, org.ID, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatalf("MarkPendingDeletion org: %v", err)
	}
	if _, err := orgs.Find(ctx, org.ID, scope); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Find pending org: got %v, want ErrNotFound", err)
	}
	if _, err := workspaces.Find(ctx, ws2.ID, scope); !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Fatalf("Find ws of pending org: got %v, want ErrWorkspaceNotFound", err)
	}
	if _, total, err := orgs.ListPendingDeletion(ctx, application.PageRequest{Limit: 10}); err != nil || total < 1 {
		t.Fatalf("ListPendingDeletion orgs: got (%d, %v)", total, err)
	}
	if _, err := orgs.Restore(ctx, org.ID); err != nil {
		t.Fatalf("Restore org: %v", err)
	}
}
