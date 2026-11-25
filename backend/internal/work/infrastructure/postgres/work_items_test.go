package postgres

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

type seededWorkProject struct {
	orgID    domain.OrganizationID
	wsID     domain.WorkspaceID
	project  domain.Project
	statuses []domain.Status
	types    []domain.WorkItemType
	userID   domain.UserID
}

func seedWorkProject(t *testing.T) seededWorkProject {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `TRUNCATE organizations, users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	orgID, wsID := seedWorkspace(t)
	var userID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO users (username, name, password_hash, is_administrator)
		VALUES ('alice', 'Alice Dev', 'hash', FALSE)
		RETURNING id::text`).Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	projects := NewProjects(pool)
	project, err := projects.Create(ctx, newDefaultProject(orgID, wsID, "Core"))
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	statuses, err := projects.ListStatuses(ctx, project.ID)
	if err != nil {
		t.Fatalf("list statuses: %v", err)
	}
	types, err := projects.ListWorkItemTypes(ctx, project.ID)
	if err != nil {
		t.Fatalf("list types: %v", err)
	}
	return seededWorkProject{
		orgID:    orgID,
		wsID:     wsID,
		project:  project,
		statuses: statuses,
		types:    types,
		userID:   domain.UserID(userID),
	}
}

func mustCreateWorkItem(t *testing.T, repo *WorkItems, in application.NewWorkItem) domain.WorkItem {
	t.Helper()
	item, err := repo.Create(context.Background(), in)
	if err != nil {
		t.Fatalf("Create(%q): %v", in.Title, err)
	}
	return item
}

func mustFindWorkItem(t *testing.T, repo *WorkItems, id domain.WorkItemID) domain.WorkItem {
	t.Helper()
	item, err := repo.Find(context.Background(), id)
	if err != nil {
		t.Fatalf("Find(%q): %v", id, err)
	}
	return item
}

func TestWorkItemCreateFindAndFilter(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	repo := NewWorkItems(pool)

	sp := 5.0
	created := mustCreateWorkItem(t, repo, application.NewWorkItem{
		OrganizationID: s.orgID,
		ProjectID:      s.project.ID,
		WorkItemTypeID: s.types[2].ID, // User Story
		StatusID:       s.statuses[0].ID,
		AssigneeID:     &s.userID,
		Title:          "Build board view",
		Description:    "Kanban columns",
		Priority:       domain.PriorityHigh,
		StoryPoints:    &sp,
		CreatedBy:      s.userID,
	})
	if created.AssigneeUsername != "alice" || created.AssigneeName != "Alice Dev" || *created.StoryPoints != 5 {
		t.Fatalf("created = %+v", created)
	}

	found := mustFindWorkItem(t, repo, created.ID)
	if found.ID != created.ID || found.Title != "Build board view" {
		t.Fatalf("Find = %+v", found)
	}

	prio := domain.PriorityHigh
	items, total, err := repo.List(ctx, s.project.ID, application.WorkItemFilter{
		StatusID:       &s.statuses[0].ID,
		WorkItemTypeID: &s.types[2].ID,
		Priority:       &prio,
		AssigneeID:     &s.userID,
	}, application.PageRequest{Limit: 10, Offset: 0})
	if err != nil || total != 1 || len(items) != 1 || items[0].ID != created.ID {
		t.Fatalf("List = %+v, %d, %v", items, total, err)
	}
}

func TestWorkItemUpdateAndTransition(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	repo := NewWorkItems(pool)

	created := mustCreateWorkItem(t, repo, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: s.statuses[0].ID, AssigneeID: &s.userID, Title: "Board", Priority: domain.PriorityHigh, CreatedBy: s.userID,
	})

	newSP := 8.0
	updated, err := repo.Update(ctx, application.WorkItemUpdate{
		ID:             created.ID,
		WorkItemTypeID: created.WorkItemTypeID,
		Title:          "Build board & list",
		Description:    "Both views",
		Priority:       domain.PriorityUrgent,
		StoryPoints:    &newSP,
	})
	if err != nil || updated.Title != "Build board & list" || updated.AssigneeID != nil || *updated.StoryPoints != 8 {
		t.Fatalf("Update = %+v, %v", updated, err)
	}

	moved, err := repo.UpdateStatus(ctx, created.ID, s.statuses[2].ID)
	if err != nil || moved.StatusID != s.statuses[2].ID {
		t.Fatalf("UpdateStatus = %+v, %v", moved, err)
	}
}

func TestWorkItemHierarchyAncestorsAndParentDelete(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	repo := NewWorkItems(pool)

	epic := mustCreateWorkItem(t, repo, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[0].ID,
		StatusID: s.statuses[0].ID, Title: "Epic", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})
	feature := mustCreateWorkItem(t, repo, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[1].ID,
		StatusID: s.statuses[0].ID, ParentID: &epic.ID, Title: "Feature", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})
	story := mustCreateWorkItem(t, repo, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: s.statuses[0].ID, ParentID: &feature.ID, Title: "Story", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})

	ancestors, err := repo.AncestorIDs(ctx, story.ID)
	if err != nil || len(ancestors) != 2 || !slices.Contains(ancestors, epic.ID) || !slices.Contains(ancestors, feature.ID) {
		t.Fatalf("AncestorIDs = %+v, %v", ancestors, err)
	}
	childTypes, err := repo.ListChildTypes(ctx, epic.ID)
	if err != nil || len(childTypes) != 1 || childTypes[0] != s.types[1].ID {
		t.Fatalf("ListChildTypes = %+v, %v", childTypes, err)
	}

	if err := repo.Delete(ctx, feature.ID); err != nil {
		t.Fatalf("Delete feature: %v", err)
	}
	if remaining := mustFindWorkItem(t, repo, story.ID); remaining.ParentID != nil {
		t.Fatalf("remaining story = %+v, want nil parent", remaining)
	}
}

func TestWorkItemClearAssignees(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	repo := NewWorkItems(pool)

	item := mustCreateWorkItem(t, repo, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[3].ID,
		StatusID: s.statuses[0].ID, AssigneeID: &s.userID, Title: "Task", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})

	if err := repo.ClearInaccessibleAssigneesInWorkspace(ctx, s.wsID); err != nil {
		t.Fatalf("ClearInaccessibleAssigneesInWorkspace: %v", err)
	}
	if after := mustFindWorkItem(t, repo, item.ID); after.AssigneeID != nil {
		t.Fatalf("expected assignee cleared, got %+v", after)
	}

	if _, err := pool.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'contributor')`, string(s.orgID), string(s.userID)); err != nil {
		t.Fatalf("insert org membership: %v", err)
	}
	if _, err := repo.Update(ctx, application.WorkItemUpdate{
		ID: item.ID, WorkItemTypeID: item.WorkItemTypeID, AssigneeID: &s.userID, Title: item.Title, Priority: item.Priority,
	}); err != nil {
		t.Fatalf("reassign: %v", err)
	}
	if err := repo.ClearInaccessibleAssigneesInOrganization(ctx, s.orgID, s.userID); err != nil {
		t.Fatalf("ClearInaccessibleAssigneesInOrganization: %v", err)
	}
	if kept := mustFindWorkItem(t, repo, item.ID); kept.AssigneeID == nil {
		t.Fatalf("expected assignee preserved for open ws member, got %+v", kept)
	}
	if err := repo.ClearAssigneeForUser(ctx, s.userID); err != nil {
		t.Fatalf("ClearAssigneeForUser: %v", err)
	}
	if cleared := mustFindWorkItem(t, repo, item.ID); cleared.AssigneeID != nil {
		t.Fatalf("expected assignee cleared on user deactivation, got %+v", cleared)
	}
}

func TestWorkItemRepositoryErrors(t *testing.T) {
	ctx := context.Background()
	seedWorkProject(t)
	repo := NewWorkItems(pool)
	const missing = domain.WorkItemID("00000000-0000-0000-0000-000000000000")

	if _, err := repo.Find(ctx, missing); !errors.Is(err, domain.ErrWorkItemNotFound) {
		t.Errorf("Find missing = %v", err)
	}
	if _, err := repo.Update(ctx, application.WorkItemUpdate{ID: missing, WorkItemTypeID: "00000000-0000-0000-0000-000000000001", Title: "x", Priority: domain.PriorityNone}); !errors.Is(err, domain.ErrWorkItemNotFound) {
		t.Errorf("Update missing = %v", err)
	}
	if _, err := repo.UpdateStatus(ctx, missing, "00000000-0000-0000-0000-000000000001"); !errors.Is(err, domain.ErrWorkItemNotFound) {
		t.Errorf("UpdateStatus missing = %v", err)
	}
	if err := repo.Delete(ctx, missing); !errors.Is(err, domain.ErrWorkItemNotFound) {
		t.Errorf("Delete missing = %v", err)
	}
}
