package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const statusDoneUUID = domain.StatusID("44444444-4444-4444-4444-444444444443")

type fakeWorkflowRepo struct {
	createdStatus   NewStatus
	updatedStatus   StatusUpdate
	deletedStatus   [2]domain.StatusID
	createdType     NewWorkItemType
	updatedType     WorkItemTypeUpdate
	deletedType     [2]domain.WorkItemTypeID
	deletedTypeUnit domain.EstimateUnit
	rules           []domain.TransitionRule
	addedRule       [2]domain.StatusID
	removedRule     [2]domain.StatusID
	err             error
}

func (f *fakeWorkflowRepo) CreateStatus(_ context.Context, in NewStatus) (domain.Status, error) {
	f.createdStatus = in
	if f.err != nil {
		return domain.Status{}, f.err
	}
	return domain.Status{ID: "s-new", ProjectID: in.ProjectID, Name: in.Name, Group: in.Group, Position: in.Position}, nil
}

func (f *fakeWorkflowRepo) UpdateStatus(_ context.Context, in StatusUpdate) (domain.Status, error) {
	f.updatedStatus = in
	if f.err != nil {
		return domain.Status{}, f.err
	}
	return domain.Status{ID: in.ID, ProjectID: in.ProjectID, Name: in.Name, Group: in.Group, Position: in.Position}, nil
}

func (f *fakeWorkflowRepo) DeleteStatus(_ context.Context, _ domain.ProjectID, id, replacementID domain.StatusID) error {
	f.deletedStatus = [2]domain.StatusID{id, replacementID}
	return f.err
}

func (f *fakeWorkflowRepo) CreateWorkItemType(_ context.Context, in NewWorkItemType) (domain.WorkItemType, error) {
	f.createdType = in
	if f.err != nil {
		return domain.WorkItemType{}, f.err
	}
	return domain.WorkItemType{
		ID: "t-new", ProjectID: in.ProjectID, Name: in.Name,
		EstimateUnit: in.EstimateUnit, Position: in.Position, AllowedChildTypeIDs: in.AllowedChildTypeIDs,
	}, nil
}

func (f *fakeWorkflowRepo) UpdateWorkItemType(_ context.Context, in WorkItemTypeUpdate) (domain.WorkItemType, error) {
	f.updatedType = in
	if f.err != nil {
		return domain.WorkItemType{}, f.err
	}
	return domain.WorkItemType{
		ID: in.ID, ProjectID: in.ProjectID, Name: in.Name,
		EstimateUnit: in.EstimateUnit, Position: in.Position, AllowedChildTypeIDs: in.AllowedChildTypeIDs,
	}, nil
}

func (f *fakeWorkflowRepo) DeleteWorkItemType(_ context.Context, _ domain.ProjectID, id, replacementID domain.WorkItemTypeID, unit domain.EstimateUnit) error {
	f.deletedType = [2]domain.WorkItemTypeID{id, replacementID}
	f.deletedTypeUnit = unit
	return f.err
}

func (f *fakeWorkflowRepo) ListTransitionRules(_ context.Context, _ domain.ProjectID) ([]domain.TransitionRule, error) {
	return f.rules, f.err
}

func (f *fakeWorkflowRepo) AddTransitionRule(_ context.Context, projectID domain.ProjectID, from, to domain.StatusID) (domain.TransitionRule, error) {
	f.addedRule = [2]domain.StatusID{from, to}
	if f.err != nil {
		return domain.TransitionRule{}, f.err
	}
	return domain.TransitionRule{ProjectID: projectID, FromStatusID: from, ToStatusID: to}, nil
}

func (f *fakeWorkflowRepo) RemoveTransitionRule(_ context.Context, _ domain.ProjectID, from, to domain.StatusID) error {
	f.removedRule = [2]domain.StatusID{from, to}
	return f.err
}

func newTestWorkflowHarness(role domain.Role) (*WorkflowService, *fakeProjects, *fakeWorkflowRepo, *fakeWorkspaces) {
	projects := &fakeProjects{
		project: domain.Project{ID: projectUUID, OrganizationID: orgUUID, WorkspaceID: wsUUID, Name: "Core"},
		statuses: []domain.Status{
			{ID: statusBacklogUUID, ProjectID: projectUUID, Name: "Backlog", Group: domain.StatusGroupNotCommitted, Position: 0},
			{ID: statusDoingUUID, ProjectID: projectUUID, Name: "In Progress", Group: domain.StatusGroupStarted, Position: 1},
			{ID: statusDoneUUID, ProjectID: projectUUID, Name: "Done", Group: domain.StatusGroupCompleted, Position: 2},
		},
		types: []domain.WorkItemType{
			{ID: typeStoryUUID, ProjectID: projectUUID, Name: "User Story", EstimateUnit: domain.EstimateUnitStoryPoints, Position: 0, AllowedChildTypeIDs: []domain.WorkItemTypeID{typeTaskUUID}},
			{ID: typeTaskUUID, ProjectID: projectUUID, Name: "Task", EstimateUnit: domain.EstimateUnitHours, Position: 1},
		},
	}
	wf := &fakeWorkflowRepo{}
	ws := &fakeWorkspaces{access: domain.WorkspaceAccess{WorkspaceID: wsUUID, OrganizationID: orgUUID, Role: role}}
	return NewWorkflowService(projects, wf, ws), projects, wf, ws
}

func TestWorkflowStatusCRUD(t *testing.T) {
	svc, _, wf, _ := newTestWorkflowHarness(domain.RoleOwner)

	created, err := svc.CreateStatus(context.Background(), ownerActor, CreateStatusInput{
		ProjectID: string(projectUUID), Name: "  In Review ", Group: "started",
	})
	if err != nil || created.Name != "In Review" || created.Position != 3 {
		t.Fatalf("CreateStatus = %+v, %v", created, err)
	}

	newName, newGroup := "QA", "planned"
	pos := 4
	updated, err := svc.UpdateStatus(context.Background(), ownerActor, UpdateStatusInput{
		ProjectID: string(projectUUID), StatusID: string(statusDoingUUID), Name: &newName, Group: &newGroup, Position: &pos,
	})
	if err != nil || updated.Name != "QA" || updated.Group != domain.StatusGroupPlanned || updated.Position != 4 {
		t.Fatalf("UpdateStatus = %+v, %v", updated, err)
	}

	if err := svc.DeleteStatus(context.Background(), ownerActor, string(projectUUID), string(statusDoingUUID), string(statusBacklogUUID)); err != nil {
		t.Fatalf("DeleteStatus = %v", err)
	}
	if wf.deletedStatus != [2]domain.StatusID{statusDoingUUID, statusBacklogUUID} {
		t.Fatalf("deletedStatus = %+v", wf.deletedStatus)
	}
}

func TestWorkflowStatusInvariantsAndAuthorization(t *testing.T) {
	svc, _, _, ws := newTestWorkflowHarness(domain.RoleOwner)
	planned := "planned"

	if _, err := svc.UpdateStatus(context.Background(), ownerActor, UpdateStatusInput{
		ProjectID: string(projectUUID), StatusID: string(statusBacklogUUID), Group: &planned,
	}); !errors.Is(err, domain.ErrMinimumStatusGroupRequired) {
		t.Fatalf("reclassify sole not_committed err = %v", err)
	}
	if err := svc.DeleteStatus(context.Background(), ownerActor, string(projectUUID), string(statusDoneUUID), string(statusBacklogUUID)); !errors.Is(err, domain.ErrMinimumStatusGroupRequired) {
		t.Fatalf("delete sole completed err = %v", err)
	}
	if err := svc.DeleteStatus(context.Background(), ownerActor, string(projectUUID), string(statusDoingUUID), string(statusDoingUUID)); !errors.Is(err, domain.ErrInvalidReplacementStatus) {
		t.Fatalf("self replacement err = %v", err)
	}
	if err := svc.DeleteStatus(context.Background(), ownerActor, string(projectUUID), string(statusDoingUUID), "bad"); !errors.Is(err, domain.ErrInvalidReplacementStatus) {
		t.Fatalf("bad replacement err = %v", err)
	}

	ws.access.Role = domain.RoleContributor
	if _, err := svc.CreateStatus(context.Background(), contribActor, CreateStatusInput{
		ProjectID: string(projectUUID), Name: "QA", Group: "started",
	}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("contributor create status err = %v", err)
	}
}

func TestWorkflowWorkItemTypeCreateAndUpdate(t *testing.T) {
	svc, _, wf, _ := newTestWorkflowHarness(domain.RoleOwner)

	created, err := svc.CreateWorkItemType(context.Background(), ownerActor, CreateWorkItemTypeInput{
		ProjectID: string(projectUUID), Name: "  Spike ", EstimateUnit: "hours", AllowedChildTypeIDs: []string{string(typeTaskUUID), string(typeTaskUUID)},
	})
	if err != nil || created.Name != "Spike" || created.Position != 2 || len(created.AllowedChildTypeIDs) != 1 {
		t.Fatalf("CreateWorkItemType = %+v, %v", created, err)
	}

	newName, newUnit := "Feature", "none"
	children := []string{string(typeTaskUUID)}
	updated, err := svc.UpdateWorkItemType(context.Background(), ownerActor, UpdateWorkItemTypeInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeStoryUUID),
		Name: &newName, EstimateUnit: &newUnit, AllowedChildTypeIDs: &children,
	})
	if err != nil || updated.Name != "Feature" || !wf.updatedType.EstimateUnitChanged || !wf.updatedType.UpdateHierarchy {
		t.Fatalf("UpdateWorkItemType = %+v, %+v, %v", updated, wf.updatedType, err)
	}
}

func TestWorkflowWorkItemTypeDelete(t *testing.T) {
	svc, _, wf, _ := newTestWorkflowHarness(domain.RoleOwner)

	if err := svc.DeleteWorkItemType(context.Background(), ownerActor, string(projectUUID), string(typeTaskUUID), string(typeStoryUUID)); err != nil {
		t.Fatalf("DeleteWorkItemType = %v", err)
	}
	if wf.deletedTypeUnit != domain.EstimateUnitStoryPoints {
		t.Fatalf("deletedTypeUnit = %q, want story_points", wf.deletedTypeUnit)
	}
}

func TestWorkflowWorkItemTypeRejections(t *testing.T) {
	svc, _, _, _ := newTestWorkflowHarness(domain.RoleOwner)

	self := []string{string(typeStoryUUID)}
	if _, err := svc.UpdateWorkItemType(context.Background(), ownerActor, UpdateWorkItemTypeInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeStoryUUID), AllowedChildTypeIDs: &self,
	}); !errors.Is(err, domain.ErrInvalidHierarchy) {
		t.Fatalf("self child err = %v", err)
	}
	if err := svc.DeleteWorkItemType(context.Background(), ownerActor, string(projectUUID), string(typeTaskUUID), string(typeTaskUUID)); !errors.Is(err, domain.ErrInvalidReplacementType) {
		t.Fatalf("self replacement type err = %v", err)
	}
	if _, err := svc.CreateWorkItemType(context.Background(), ownerActor, CreateWorkItemTypeInput{
		ProjectID: string(projectUUID), Name: " ", EstimateUnit: "bogus",
	}); !errors.Is(err, domain.ErrInvalidWorkItemTypeName) || !errors.Is(err, domain.ErrInvalidEstimateUnit) {
		t.Fatalf("invalid type inputs err = %v", err)
	}
}

func TestWorkflowTransitionRules(t *testing.T) {
	svc, _, wf, ws := newTestWorkflowHarness(domain.RoleOwner)
	wf.rules = []domain.TransitionRule{{ProjectID: projectUUID, FromStatusID: statusBacklogUUID, ToStatusID: statusDoingUUID}}

	rule, err := svc.AddTransitionRule(context.Background(), ownerActor, string(projectUUID), string(statusBacklogUUID), string(statusDoingUUID))
	if err != nil || rule.FromStatusID != statusBacklogUUID || rule.ToStatusID != statusDoingUUID {
		t.Fatalf("AddTransitionRule = %+v, %v", rule, err)
	}
	if _, err := svc.AddTransitionRule(context.Background(), ownerActor, string(projectUUID), string(statusBacklogUUID), string(statusBacklogUUID)); !errors.Is(err, domain.ErrInvalidTransitionRule) {
		t.Fatalf("self rule err = %v", err)
	}
	if err := svc.RemoveTransitionRule(context.Background(), ownerActor, string(projectUUID), string(statusBacklogUUID), string(statusDoingUUID)); err != nil {
		t.Fatalf("RemoveTransitionRule = %v", err)
	}

	ws.access.Role = domain.RoleViewer
	rules, err := svc.ListTransitionRules(context.Background(), contribActor, string(projectUUID))
	if err != nil || len(rules) != 1 {
		t.Fatalf("viewer ListTransitionRules = %+v, %v", rules, err)
	}
	if _, err := svc.AddTransitionRule(context.Background(), contribActor, string(projectUUID), string(statusBacklogUUID), string(statusDoingUUID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("viewer add rule err = %v", err)
	}
}
