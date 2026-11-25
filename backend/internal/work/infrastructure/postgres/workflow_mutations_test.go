package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func TestWorkflowStatusCRUDAndReplacement(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	wf := NewWorkflow(pool)
	items := NewWorkItems(pool)

	review, err := wf.CreateStatus(ctx, application.NewStatus{
		ProjectID: s.project.ID, Name: "In Review", Group: domain.StatusGroupStarted, Position: 4,
	})
	if err != nil || review.Name != "In Review" {
		t.Fatalf("CreateStatus = %+v, %v", review, err)
	}
	if _, err := wf.CreateStatus(ctx, application.NewStatus{
		ProjectID: s.project.ID, Name: "IN REVIEW", Group: domain.StatusGroupStarted, Position: 5,
	}); !errors.Is(err, domain.ErrStatusNameInUse) {
		t.Fatalf("duplicate status err = %v", err)
	}

	updated, err := wf.UpdateStatus(ctx, application.StatusUpdate{
		ProjectID: s.project.ID, ID: review.ID, Name: "QA", Group: domain.StatusGroupPlanned, Position: 2,
	})
	if err != nil || updated.Name != "QA" || updated.Group != domain.StatusGroupPlanned {
		t.Fatalf("UpdateStatus = %+v, %v", updated, err)
	}

	item := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[2].ID,
		StatusID: review.ID, Title: "Move me", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})
	if err := wf.DeleteStatus(ctx, s.project.ID, review.ID, s.statuses[0].ID); err != nil {
		t.Fatalf("DeleteStatus = %v", err)
	}
	if moved := mustFindWorkItem(t, items, item.ID); moved.StatusID != s.statuses[0].ID {
		t.Fatalf("expected item moved to Backlog, got %+v", moved)
	}
}

func TestWorkflowWorkItemTypeMutationsCleanEstimatesAndParents(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	wf := NewWorkflow(pool)
	items := NewWorkItems(pool)

	spike, err := wf.CreateWorkItemType(ctx, application.NewWorkItemType{
		ProjectID: s.project.ID, Name: "Spike", EstimateUnit: domain.EstimateUnitHours,
		Position: 6, AllowedChildTypeIDs: []domain.WorkItemTypeID{s.types[5].ID},
	})
	if err != nil || len(spike.AllowedChildTypeIDs) != 1 {
		t.Fatalf("CreateWorkItemType = %+v, %v", spike, err)
	}

	hrs := 4.0
	parent := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: spike.ID,
		StatusID: s.statuses[0].ID, Title: "Research", Hours: &hrs, Priority: domain.PriorityNone, CreatedBy: s.userID,
	})
	child := mustCreateWorkItem(t, items, application.NewWorkItem{
		OrganizationID: s.orgID, ProjectID: s.project.ID, WorkItemTypeID: s.types[5].ID,
		StatusID: s.statuses[0].ID, ParentID: &parent.ID, Title: "Sub", Priority: domain.PriorityNone, CreatedBy: s.userID,
	})

	// Changing Spike to story_points & removing Subtask from allowed children clears Hours and child's parent_id.
	if _, err := wf.UpdateWorkItemType(ctx, application.WorkItemTypeUpdate{
		ProjectID: s.project.ID, ID: spike.ID, Name: "Spike",
		EstimateUnit: domain.EstimateUnitStoryPoints, EstimateUnitChanged: true, Position: 6,
		UpdateHierarchy: true, AllowedChildTypeIDs: []domain.WorkItemTypeID{},
	}); err != nil {
		t.Fatalf("UpdateWorkItemType = %v", err)
	}
	if updatedParent := mustFindWorkItem(t, items, parent.ID); updatedParent.Hours != nil {
		t.Fatalf("expected Hours cleared on unit switch, got %+v", updatedParent)
	}
	if updatedChild := mustFindWorkItem(t, items, child.ID); updatedChild.ParentID != nil {
		t.Fatalf("expected child parent_id cleared when hierarchy removed, got %+v", updatedChild)
	}

	// Deleting Spike into Epic (estimate_unit=none) reassigns Work Item and discards estimate.
	sp := 3.0
	if _, err := items.Update(ctx, application.WorkItemUpdate{
		ID: parent.ID, WorkItemTypeID: spike.ID, Title: parent.Title, Priority: parent.Priority, StoryPoints: &sp,
	}); err != nil {
		t.Fatalf("set story points: %v", err)
	}
	if err := wf.DeleteWorkItemType(ctx, s.project.ID, spike.ID, s.types[0].ID, domain.EstimateUnitNone); err != nil {
		t.Fatalf("DeleteWorkItemType = %v", err)
	}
	reassigned := mustFindWorkItem(t, items, parent.ID)
	if reassigned.WorkItemTypeID != s.types[0].ID || reassigned.StoryPoints != nil {
		t.Fatalf("expected reassigned to Epic with cleared estimate, got %+v", reassigned)
	}
}

func TestWorkflowTransitionRulesCRUD(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	wf := NewWorkflow(pool)

	rule, err := wf.AddTransitionRule(ctx, s.project.ID, s.statuses[0].ID, s.statuses[1].ID)
	if err != nil || rule.FromStatusID != s.statuses[0].ID || rule.ToStatusID != s.statuses[1].ID {
		t.Fatalf("AddTransitionRule = %+v, %v", rule, err)
	}
	if _, err := wf.AddTransitionRule(ctx, s.project.ID, s.statuses[0].ID, s.statuses[1].ID); !errors.Is(err, domain.ErrTransitionRuleExists) {
		t.Fatalf("duplicate rule err = %v", err)
	}
	rules, err := wf.ListTransitionRules(ctx, s.project.ID)
	if err != nil || len(rules) != 1 {
		t.Fatalf("ListTransitionRules = %+v, %v", rules, err)
	}
	if err := wf.RemoveTransitionRule(ctx, s.project.ID, s.statuses[0].ID, s.statuses[1].ID); err != nil {
		t.Fatalf("RemoveTransitionRule = %v", err)
	}
	if err := wf.RemoveTransitionRule(ctx, s.project.ID, s.statuses[0].ID, s.statuses[1].ID); !errors.Is(err, domain.ErrTransitionRuleNotFound) {
		t.Fatalf("missing rule err = %v", err)
	}
}
