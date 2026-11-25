package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func TestProjectArchiveAndUnarchivePostgres(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	repo := NewProjects(pool)

	archived, err := repo.Archive(ctx, s.project.ID)
	if err != nil || archived.ArchivedAt == nil {
		t.Fatalf("Archive: got (%+v, %v)", archived, err)
	}
	if _, total, err := repo.ListByWorkspace(ctx, s.project.WorkspaceID, application.PageRequest{Limit: 10}); err != nil || total != 0 {
		t.Fatalf("default list should exclude archived project: got (%d, %v)", total, err)
	}
	if _, total, err := repo.ListByWorkspaceFiltered(ctx, s.project.WorkspaceID, true, application.PageRequest{Limit: 10}); err != nil || total != 1 {
		t.Fatalf("includeArchived list: got (%d, %v)", total, err)
	}
	unarchived, err := repo.Unarchive(ctx, s.project.ID)
	if err != nil || unarchived.ArchivedAt != nil {
		t.Fatalf("Unarchive: got (%+v, %v)", unarchived, err)
	}
}

func TestProjectPendingDeletionAndPurgePostgres(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	repo := NewProjects(pool)

	if err := repo.MarkPendingDeletion(ctx, s.project.ID, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatalf("MarkPendingDeletion: %v", err)
	}
	if _, err := repo.Find(ctx, s.project.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Find pending project: got %v, want ErrNotFound", err)
	}
	pending, total, err := repo.ListPendingDeletionByWorkspace(ctx, s.project.WorkspaceID, application.PageRequest{Limit: 10})
	if err != nil || total != 1 || pending[0].ID != s.project.ID {
		t.Fatalf("ListPendingDeletionByWorkspace: got (%+v, %d, %v)", pending, total, err)
	}
	if _, err := repo.Restore(ctx, s.project.ID); err != nil {
		t.Fatalf("Restore: %v", err)
	}
	assertProjectPurged(t, repo, s.project.ID)
}

func assertProjectPurged(t *testing.T, repo *Projects, id domain.ProjectID) {
	t.Helper()
	ctx := context.Background()
	if err := repo.MarkPendingDeletion(ctx, id, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatalf("MarkPendingDeletion for purge: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE projects SET deleted_at = NOW() - INTERVAL '2 hours', purge_after = NOW() - INTERVAL '1 hour' WHERE id = $1`, string(id)); err != nil {
		t.Fatalf("backdate purge window: %v", err)
	}
	if err := repo.PurgeExpired(ctx); err != nil {
		t.Fatalf("PurgeExpired: %v", err)
	}
	if _, err := repo.FindPendingDeletion(ctx, id); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("FindPendingDeletion after purge: got %v, want ErrNotFound", err)
	}
}
