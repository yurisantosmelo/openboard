package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func seedSecondUser(t *testing.T, username string) domain.UserID {
	t.Helper()
	var id string
	err := pool.QueryRow(context.Background(), `
		INSERT INTO users (username, name, password_hash)
		VALUES ($1, $2, 'hash')
		RETURNING id::text`, username, username).Scan(&id)
	if err != nil {
		t.Fatalf("seed second user: %v", err)
	}
	return domain.UserID(id)
}

func mustCreateView(t *testing.T, repo *Views, in application.NewView) domain.View {
	t.Helper()
	v, err := repo.Create(context.Background(), in)
	if err != nil {
		t.Fatalf("CreateView(%q): %v", in.Name, err)
	}
	return v
}

func TestViewsPersonalIsolation(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	userB := seedSecondUser(t, "viewpeer1")
	repo := NewViews(pool)

	vA := mustCreateView(t, repo, application.NewView{
		ProjectID: s.project.ID, Name: "My Focus", Layout: domain.ViewLayoutBoard,
		Filters: domain.ViewFilters{Priority: "high"}, CreatedBy: s.userID,
	})
	if vA.Visibility != domain.ViewVisibilityPersonal {
		t.Fatalf("expected personal visibility, got %q", vA.Visibility)
	}
	if _, err := repo.Create(ctx, application.NewView{
		ProjectID: s.project.ID, Name: "my focus", Layout: domain.ViewLayoutList, CreatedBy: s.userID,
	}); !errors.Is(err, domain.ErrViewNameInUse) {
		t.Fatalf("expected ErrViewNameInUse for same user, got %v", err)
	}
	_ = mustCreateView(t, repo, application.NewView{
		ProjectID: s.project.ID, Name: "My Focus", Layout: domain.ViewLayoutTable, CreatedBy: userB,
	})

	listA, err := repo.ListVisible(ctx, s.project.ID, s.userID)
	if err != nil || len(listA) != 1 || listA[0].ID != vA.ID {
		t.Fatalf("ListVisible userA: got (%+v, %v)", listA, err)
	}
}

func TestViewsShareConflictAndDelete(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	userB := seedSecondUser(t, "viewpeer2")
	repo := NewViews(pool)

	vA := mustCreateView(t, repo, application.NewView{
		ProjectID: s.project.ID, Name: "Shared Focus", Layout: domain.ViewLayoutBoard, CreatedBy: s.userID,
	})
	vB := mustCreateView(t, repo, application.NewView{
		ProjectID: s.project.ID, Name: "Shared Focus", Layout: domain.ViewLayoutTable, CreatedBy: userB,
	})

	shared, err := repo.Update(ctx, application.ViewUpdate{
		ProjectID: s.project.ID, ID: vA.ID, Name: "Shared Focus", Layout: domain.ViewLayoutTimeline,
		Visibility: domain.ViewVisibilityShared, Filters: domain.ViewFilters{Priority: "urgent"},
	})
	if err != nil || shared.Visibility != domain.ViewVisibilityShared || shared.Layout != domain.ViewLayoutTimeline {
		t.Fatalf("Update vA to shared: got (%+v, %v)", shared, err)
	}
	if _, err := repo.Update(ctx, application.ViewUpdate{
		ProjectID: s.project.ID, ID: vB.ID, Name: "shared focus", Layout: domain.ViewLayoutCalendar, Visibility: domain.ViewVisibilityShared,
	}); !errors.Is(err, domain.ErrViewNameInUse) {
		t.Fatalf("expected ErrViewNameInUse on duplicate shared name, got %v", err)
	}

	listB, err := repo.ListVisible(ctx, s.project.ID, userB)
	if err != nil || len(listB) != 2 {
		t.Fatalf("ListVisible userB after share: got (%d, %v)", len(listB), err)
	}
	if err := repo.Delete(ctx, s.project.ID, vA.ID); err != nil {
		t.Fatalf("Delete vA: %v", err)
	}
	if _, err := repo.Find(ctx, s.project.ID, vA.ID); !errors.Is(err, domain.ErrViewNotFound) {
		t.Fatalf("expected ErrViewNotFound after delete, got %v", err)
	}
}
