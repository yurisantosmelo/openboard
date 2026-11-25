package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func mustCreateEra(t *testing.T, repo *Eras, in application.NewEra) domain.Era {
	t.Helper()
	era, err := repo.Create(context.Background(), in)
	if err != nil {
		t.Fatalf("CreateEra(%q): %v", in.Name, err)
	}
	return era
}

func TestLinksCreateDeleteAndCascade(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	items := NewWorkItems(pool)
	links := NewLinks(pool)

	a := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: s.statuses[0].ID, Title: "Story A", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})
	b := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: s.statuses[0].ID, Title: "Story B", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})

	created, err := links.Create(ctx, s.project.ID, a.ID, b.ID, domain.LinkKindBlocks)
	if err != nil || created.SourceTitle != "Story A" || created.TargetTitle != "Story B" {
		t.Fatalf("Create link = %+v, %v", created, err)
	}
	if _, err := links.Create(ctx, s.project.ID, a.ID, b.ID, domain.LinkKindBlocks); !errors.Is(err, domain.ErrLinkExists) {
		t.Fatalf("duplicate link err = %v", err)
	}
	if err := links.Delete(ctx, s.project.ID, b.ID, created.ID); err != nil {
		t.Fatalf("Delete link: %v", err)
	}
	if err := links.Delete(ctx, s.project.ID, b.ID, created.ID); !errors.Is(err, domain.ErrLinkNotFound) {
		t.Fatalf("missing link err = %v", err)
	}
}

func TestLinksCascadeOnWorkItemDelete(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	items := NewWorkItems(pool)
	links := NewLinks(pool)

	a := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: s.statuses[0].ID, Title: "Story A", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})
	b := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: s.statuses[0].ID, Title: "Story B", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})
	if _, err := links.Create(ctx, s.project.ID, a.ID, b.ID, domain.LinkKindRelatesTo); err != nil {
		t.Fatalf("Create link: %v", err)
	}
	if err := items.Delete(ctx, a.ID); err != nil {
		t.Fatalf("Delete work item: %v", err)
	}
	after, err := links.ListForWorkItem(ctx, b.ID)
	if err != nil || len(after) != 0 {
		t.Fatalf("expected links removed on work item delete, got %+v, %v", after, err)
	}
}

func TestErasCRUDAndStart(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	eras := NewEras(pool)

	e1 := mustCreateEra(t, eras, application.NewEra{
		ProjectID: s.project.ID, Name: "Era 1", Goal: "MVP",
		StartDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC),
	})
	if _, err := eras.Create(ctx, application.NewEra{
		ProjectID: s.project.ID, Name: "ERA 1", StartDate: e1.StartDate, EndDate: e1.EndDate,
	}); !errors.Is(err, domain.ErrEraNameInUse) {
		t.Fatalf("duplicate era name err = %v", err)
	}
	updated, err := eras.Update(ctx, application.EraUpdate{
		ProjectID: s.project.ID, ID: e1.ID, Name: "Era 1 Updated", Goal: "Ship MVP",
		StartDate: e1.StartDate, EndDate: e1.EndDate,
	})
	if err != nil || updated.Name != "Era 1 Updated" {
		t.Fatalf("Update era = %+v, %v", updated, err)
	}
	list, err := eras.List(ctx, s.project.ID)
	if err != nil || len(list) != 1 {
		t.Fatalf("List eras = %+v, %v", list, err)
	}
	if found, err := eras.Find(ctx, s.project.ID, e1.ID); err != nil || found.ID != e1.ID {
		t.Fatalf("Find era = %+v, %v", found, err)
	}
	if _, err := eras.Find(ctx, s.project.ID, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, domain.ErrEraNotFound) {
		t.Fatalf("Find missing era err = %v", err)
	}
}

func assertWorkItemEra(t *testing.T, items *WorkItems, id domain.WorkItemID, want *domain.EraID) {
	t.Helper()
	got := mustFindWorkItem(t, items, id)
	if (got.EraID == nil) != (want == nil) || (want != nil && *got.EraID != *want) {
		t.Fatalf("item %q era_id = %v, want %v", id, got.EraID, want)
	}
}

func TestErasCloseMovesUnfinishedOnly(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	items := NewWorkItems(pool)
	eras := NewEras(pool)

	era1 := mustCreateEra(t, eras, application.NewEra{
		ProjectID: s.project.ID, Name: "Era 1",
		StartDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC),
	})
	era2 := mustCreateEra(t, eras, application.NewEra{
		ProjectID: s.project.ID, Name: "Era 2",
		StartDate: time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 11, 28, 0, 0, 0, 0, time.UTC),
	})
	if _, err := eras.Start(ctx, s.project.ID, era1.ID); err != nil {
		t.Fatalf("Start era1: %v", err)
	}

	doneItem := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: s.statuses[3].ID, EraID: &era1.ID, Title: "Finished", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})
	wipItem := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: s.statuses[2].ID, EraID: &era1.ID, Title: "In Progress", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})

	closed, err := eras.Close(ctx, s.project.ID, era1.ID, &era2.ID, time.Now().UTC())
	if err != nil || closed.State != domain.EraStateCompleted || closed.ClosedAt == nil {
		t.Fatalf("Close era1 = %+v, %v", closed, err)
	}
	assertWorkItemEra(t, items, doneItem.ID, &era1.ID)
	assertWorkItemEra(t, items, wipItem.ID, &era2.ID)
	if afterWIP := mustFindWorkItem(t, items, wipItem.ID); afterWIP.StatusID != s.statuses[2].ID {
		t.Fatalf("status must not change on close, got %+v", afterWIP)
	}
	if err := eras.Delete(ctx, s.project.ID, era2.ID); err != nil {
		t.Fatalf("Delete era2: %v", err)
	}
	assertWorkItemEra(t, items, wipItem.ID, nil)
}
