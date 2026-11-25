package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const (
	statusBacklogUUID = domain.StatusID("44444444-4444-4444-4444-444444444441")
	statusDoingUUID   = domain.StatusID("44444444-4444-4444-4444-444444444442")
	typeStoryUUID     = domain.WorkItemTypeID("55555555-5555-5555-5555-555555555551")
	typeTaskUUID      = domain.WorkItemTypeID("55555555-5555-5555-5555-555555555552")
	typeEpicUUID      = domain.WorkItemTypeID("55555555-5555-5555-5555-555555555553")
	workItem1UUID     = domain.WorkItemID("66666666-6666-6666-6666-666666666661")
	workItem2UUID     = domain.WorkItemID("66666666-6666-6666-6666-666666666662")
	assigneeUUID      = domain.UserID("77777777-7777-7777-7777-777777777771")
)

type fakeAssignees struct {
	ok  bool
	err error
}

func (f *fakeAssignees) CanBeAssigned(_ context.Context, _ domain.UserID, _ domain.WorkspaceID) (bool, error) {
	return f.ok, f.err
}

type fakeWorkItems struct {
	byID          map[domain.WorkItemID]domain.WorkItem
	created       NewWorkItem
	updated       WorkItemUpdate
	listItems     []domain.WorkItem
	listTotal     int
	lastFilter    WorkItemFilter
	lastPage      PageRequest
	ancestors     []domain.WorkItemID
	childTypes    []domain.WorkItemTypeID
	deletedID     domain.WorkItemID
	transitioned  domain.StatusID
	createErr     error
	findErr       error
	listErr       error
	updateErr     error
	statusErr     error
	deleteErr     error
	ancestorsErr  error
	childTypesErr error
}

func (f *fakeWorkItems) Create(_ context.Context, in NewWorkItem) (domain.WorkItem, error) {
	f.created = in
	if f.createErr != nil {
		return domain.WorkItem{}, f.createErr
	}
	return domain.WorkItem{
		ID:             workItem1UUID,
		OrganizationID: in.OrganizationID,
		ProjectID:      in.ProjectID,
		WorkItemTypeID: in.WorkItemTypeID,
		StatusID:       in.StatusID,
		ParentID:       in.ParentID,
		AssigneeID:     in.AssigneeID,
		Title:          in.Title,
		Description:    in.Description,
		Priority:       in.Priority,
		StoryPoints:    in.StoryPoints,
		Hours:          in.Hours,
		CreatedBy:      in.CreatedBy,
	}, nil
}

func (f *fakeWorkItems) Find(_ context.Context, id domain.WorkItemID) (domain.WorkItem, error) {
	if f.findErr != nil {
		return domain.WorkItem{}, f.findErr
	}
	if item, ok := f.byID[id]; ok {
		return item, nil
	}
	return domain.WorkItem{}, domain.ErrWorkItemNotFound
}

func (f *fakeWorkItems) List(_ context.Context, _ domain.ProjectID, filter WorkItemFilter, page PageRequest) ([]domain.WorkItem, int, error) {
	f.lastFilter = filter
	f.lastPage = page
	if f.listErr != nil {
		return nil, 0, f.listErr
	}
	out := append([]domain.WorkItem(nil), f.listItems...)
	return out, f.listTotal, nil
}

func (f *fakeWorkItems) Update(_ context.Context, in WorkItemUpdate) (domain.WorkItem, error) {
	f.updated = in
	if f.updateErr != nil {
		return domain.WorkItem{}, f.updateErr
	}
	item := f.byID[in.ID]
	item.WorkItemTypeID = in.WorkItemTypeID
	item.ParentID = in.ParentID
	item.AssigneeID = in.AssigneeID
	item.Title = in.Title
	item.Description = in.Description
	item.Priority = in.Priority
	item.StoryPoints = in.StoryPoints
	item.Hours = in.Hours
	return item, nil
}

func (f *fakeWorkItems) UpdateStatus(_ context.Context, id domain.WorkItemID, statusID domain.StatusID) (domain.WorkItem, error) {
	f.transitioned = statusID
	if f.statusErr != nil {
		return domain.WorkItem{}, f.statusErr
	}
	item := f.byID[id]
	item.StatusID = statusID
	return item, nil
}

func (f *fakeWorkItems) Delete(_ context.Context, id domain.WorkItemID) error {
	f.deletedID = id
	return f.deleteErr
}

func (f *fakeWorkItems) AncestorIDs(_ context.Context, _ domain.WorkItemID) ([]domain.WorkItemID, error) {
	return f.ancestors, f.ancestorsErr
}

func (f *fakeWorkItems) ListChildTypes(_ context.Context, _ domain.WorkItemID) ([]domain.WorkItemTypeID, error) {
	return f.childTypes, f.childTypesErr
}

func newTestWorkItemHarness(role domain.Role) (*WorkItemService, *fakeProjects, *fakeWorkItems, *fakeWorkspaces, *fakeAssignees) {
	projects := &fakeProjects{
		project: domain.Project{ID: projectUUID, OrganizationID: orgUUID, WorkspaceID: wsUUID, Name: "Core"},
		statuses: []domain.Status{
			{ID: statusBacklogUUID, ProjectID: projectUUID, Name: "Backlog", Group: domain.StatusGroupNotCommitted, Position: 0},
			{ID: statusDoingUUID, ProjectID: projectUUID, Name: "In Progress", Group: domain.StatusGroupStarted, Position: 1},
		},
		types: []domain.WorkItemType{
			{ID: typeEpicUUID, ProjectID: projectUUID, Name: "Epic", EstimateUnit: domain.EstimateUnitNone, AllowedChildTypeIDs: []domain.WorkItemTypeID{typeStoryUUID}},
			{ID: typeStoryUUID, ProjectID: projectUUID, Name: "Story", EstimateUnit: domain.EstimateUnitStoryPoints, AllowedChildTypeIDs: []domain.WorkItemTypeID{typeTaskUUID}},
			{ID: typeTaskUUID, ProjectID: projectUUID, Name: "Task", EstimateUnit: domain.EstimateUnitHours},
		},
	}
	items := &fakeWorkItems{
		byID: map[domain.WorkItemID]domain.WorkItem{
			workItem1UUID: {
				ID:             workItem1UUID,
				OrganizationID: orgUUID,
				ProjectID:      projectUUID,
				WorkItemTypeID: typeStoryUUID,
				StatusID:       statusBacklogUUID,
				Title:          "Auth flow",
				Priority:       domain.PriorityMedium,
				CreatedBy:      contribActor.UserID,
			},
			workItem2UUID: {
				ID:             workItem2UUID,
				OrganizationID: orgUUID,
				ProjectID:      projectUUID,
				WorkItemTypeID: typeTaskUUID,
				StatusID:       statusBacklogUUID,
				Title:          "Write tests",
				Priority:       domain.PriorityLow,
				CreatedBy:      contribActor.UserID,
			},
		},
	}
	ws := &fakeWorkspaces{access: domain.WorkspaceAccess{WorkspaceID: wsUUID, OrganizationID: orgUUID, Role: role}}
	assignees := &fakeAssignees{ok: true}
	return NewWorkItemService(projects, items, ws, assignees), projects, items, ws, assignees
}

func TestCreateWorkItemDefaultsAndRelations(t *testing.T) {
	svc, _, items, _, _ := newTestWorkItemHarness(domain.RoleContributor)
	parentRaw := string(workItem1UUID)
	assigneeRaw := string(assigneeUUID)
	hrs := 4.5

	got, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID:      string(projectUUID),
		WorkItemTypeID: string(typeTaskUUID),
		ParentID:       &parentRaw,
		AssigneeID:     &assigneeRaw,
		Title:          "  Implement login  ",
		Description:    "Details",
		Hours:          &hrs,
	})
	if err != nil {
		t.Fatalf("CreateWorkItem err = %v", err)
	}
	if got.StatusID != statusBacklogUUID || got.Priority != domain.PriorityNone || got.ViewerRole != domain.RoleContributor {
		t.Fatalf("got = %+v", got)
	}
	if items.created.Title != "Implement login" || *items.created.Hours != 4.5 || *items.created.ParentID != workItem1UUID {
		t.Fatalf("created = %+v", items.created)
	}
}

func TestCreateWorkItemExplicitStatusAndRejections(t *testing.T) {
	svc, projects, items, _, assignees := newTestWorkItemHarness(domain.RoleContributor)
	doingRaw := string(statusDoingUUID)
	sp := 5.0
	got, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID:      string(projectUUID),
		WorkItemTypeID: string(typeStoryUUID),
		StatusID:       &doingRaw,
		Title:          "Story",
		Priority:       "high",
		StoryPoints:    &sp,
	})
	if err != nil || got.StatusID != statusDoingUUID || got.Priority != domain.PriorityHigh {
		t.Fatalf("explicit create = %+v, %v", got, err)
	}

	// Wrong estimate unit
	if _, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeTaskUUID), Title: "T", StoryPoints: &sp,
	}); !errors.Is(err, domain.ErrInvalidEstimate) {
		t.Fatalf("wrong estimate err = %v", err)
	}

	// Disallowed hierarchy (Task cannot be parent of Story)
	badParent := string(workItem2UUID)
	if _, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeStoryUUID), ParentID: &badParent, Title: "S",
	}); !errors.Is(err, domain.ErrInvalidParent) {
		t.Fatalf("bad hierarchy err = %v", err)
	}

	// Assignee without access
	assignees.ok = false
	a := string(assigneeUUID)
	if _, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeTaskUUID), AssigneeID: &a, Title: "T",
	}); !errors.Is(err, domain.ErrInvalidAssignee) {
		t.Fatalf("bad assignee err = %v", err)
	}

	// Unknown status / unknown type / empty project statuses
	otherStatus := "44444444-4444-4444-4444-444444444499"
	if _, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeTaskUUID), StatusID: &otherStatus, Title: "T",
	}); !errors.Is(err, domain.ErrInvalidStatus) {
		t.Fatalf("unknown status err = %v", err)
	}
	projects.statuses = nil
	if _, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeTaskUUID), Title: "T",
	}); !errors.Is(err, domain.ErrInvalidStatus) {
		t.Fatalf("no statuses err = %v", err)
	}
	if _, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: "55555555-5555-5555-5555-555555555599", Title: "T",
	}); !errors.Is(err, domain.ErrInvalidWorkItemType) {
		t.Fatalf("unknown type err = %v", err)
	}
	_ = items
}

func TestCreateWorkItemAccessAndInputValidation(t *testing.T) {
	svc, _, _, ws, _ := newTestWorkItemHarness(domain.RoleViewer)
	if _, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeTaskUUID), Title: "T",
	}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("viewer create err = %v, want ErrForbidden", err)
	}

	ws.access.Role = domain.RoleContributor
	bad := "not-a-uuid"
	_, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: bad, StatusID: &bad, ParentID: &bad, AssigneeID: &bad, Title: " ", Priority: "bogus",
	})
	for _, want := range []error{domain.ErrInvalidTitle, domain.ErrInvalidWorkItemType, domain.ErrInvalidPriority, domain.ErrInvalidStatus, domain.ErrInvalidParent, domain.ErrInvalidAssignee} {
		if !errors.Is(err, want) {
			t.Errorf("joined err %v missing %v", err, want)
		}
	}

	ws.err = domain.ErrWorkspaceNotFound
	if _, err := svc.CreateWorkItem(context.Background(), contribActor, CreateWorkItemInput{
		ProjectID: string(projectUUID), WorkItemTypeID: string(typeTaskUUID), Title: "T",
	}); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("unseen workspace err = %v, want ErrNotFound", err)
	}
}

func TestListWorkItems(t *testing.T) {
	svc, _, items, _, _ := newTestWorkItemHarness(domain.RoleViewer)
	items.listItems = []domain.WorkItem{items.byID[workItem1UUID]}
	items.listTotal = 1

	got, total, err := svc.ListWorkItems(context.Background(), contribActor, string(projectUUID), ListWorkItemsFilter{
		StatusID:       string(statusBacklogUUID),
		WorkItemTypeID: string(typeStoryUUID),
		Priority:       "medium",
		AssigneeID:     string(assigneeUUID),
	}, PageRequest{Limit: 10, Offset: 0})
	if err != nil || total != 1 || len(got) != 1 || got[0].ViewerRole != domain.RoleViewer {
		t.Fatalf("ListWorkItems = %+v, %d, %v", got, total, err)
	}
	if *items.lastFilter.StatusID != statusBacklogUUID || *items.lastFilter.Priority != domain.PriorityMedium {
		t.Fatalf("lastFilter = %+v", items.lastFilter)
	}
	if _, _, err := svc.ListWorkItems(context.Background(), contribActor, string(projectUUID), ListWorkItemsFilter{Priority: "bad"}, PageRequest{}); !errors.Is(err, domain.ErrInvalidPriority) {
		t.Fatalf("bad filter err = %v", err)
	}
}

func TestGetWorkItem(t *testing.T) {
	svc, _, _, ws, _ := newTestWorkItemHarness(domain.RoleViewer)

	one, err := svc.GetWorkItem(context.Background(), contribActor, string(workItem1UUID))
	if err != nil || one.ID != workItem1UUID || one.ViewerRole != domain.RoleViewer {
		t.Fatalf("GetWorkItem = %+v, %v", one, err)
	}
	ws.err = domain.ErrWorkspaceNotFound
	if _, err := svc.GetWorkItem(context.Background(), contribActor, string(workItem1UUID)); !errors.Is(err, domain.ErrWorkItemNotFound) {
		t.Fatalf("unseen GetWorkItem err = %v, want ErrWorkItemNotFound", err)
	}
	if _, err := svc.GetWorkItem(context.Background(), contribActor, "bad"); !errors.Is(err, domain.ErrWorkItemNotFound) {
		t.Fatalf("bad id err = %v", err)
	}
}

func TestUpdateWorkItem(t *testing.T) {
	svc, _, items, _, _ := newTestWorkItemHarness(domain.RoleContributor)
	title := "  New Title  "
	desc := "Updated desc"
	prio := "urgent"
	parentRaw := string(workItem1UUID)
	assigneeRaw := string(assigneeUUID)
	hrs := 2.0

	got, err := svc.UpdateWorkItem(context.Background(), contribActor, UpdateWorkItemInput{
		ID:          string(workItem2UUID),
		Title:       &title,
		Description: &desc,
		Priority:    &prio,
		ParentID:    Optional[string]{Set: true, Value: &parentRaw},
		AssigneeID:  Optional[string]{Set: true, Value: &assigneeRaw},
		Hours:       Optional[float64]{Set: true, Value: &hrs},
	})
	if err != nil {
		t.Fatalf("UpdateWorkItem err = %v", err)
	}
	if got.Title != "New Title" || got.Priority != domain.PriorityUrgent || *got.ParentID != workItem1UUID || *got.AssigneeID != assigneeUUID {
		t.Fatalf("updated = %+v", got)
	}

	// Clearing nullable fields
	cleared, err := svc.UpdateWorkItem(context.Background(), contribActor, UpdateWorkItemInput{
		ID:         string(workItem2UUID),
		ParentID:   Optional[string]{Set: true, Value: nil},
		AssigneeID: Optional[string]{Set: true, Value: nil},
		Hours:      Optional[float64]{Set: true, Value: nil},
	})
	if err != nil || cleared.ParentID != nil || cleared.AssigneeID != nil || cleared.Hours != nil {
		t.Fatalf("cleared = %+v, %v", cleared, err)
	}
	_ = items
}

func TestUpdateWorkItemHierarchyCyclesAndChildren(t *testing.T) {
	svc, _, items, ws, _ := newTestWorkItemHarness(domain.RoleContributor)

	// Self-parent cycle
	self := string(workItem1UUID)
	if _, err := svc.UpdateWorkItem(context.Background(), contribActor, UpdateWorkItemInput{
		ID:       string(workItem1UUID),
		ParentID: Optional[string]{Set: true, Value: &self},
	}); !errors.Is(err, domain.ErrParentCycle) {
		t.Fatalf("self parent err = %v, want ErrParentCycle", err)
	}

	// Indirect cycle via AncestorIDs
	items.ancestors = []domain.WorkItemID{workItem2UUID}
	parentRaw := string(workItem1UUID)
	if _, err := svc.UpdateWorkItem(context.Background(), contribActor, UpdateWorkItemInput{
		ID:       string(workItem2UUID),
		ParentID: Optional[string]{Set: true, Value: &parentRaw},
	}); !errors.Is(err, domain.ErrParentCycle) {
		t.Fatalf("indirect cycle err = %v, want ErrParentCycle", err)
	}
	items.ancestors = nil

	// Parent in another project is rejected
	otherParent := domain.WorkItemID("66666666-6666-6666-6666-666666666699")
	items.byID[otherParent] = domain.WorkItem{
		ID:             otherParent,
		ProjectID:      domain.ProjectID("33333333-3333-3333-3333-333333333399"),
		WorkItemTypeID: typeStoryUUID,
	}
	otherRaw := string(otherParent)
	if _, err := svc.UpdateWorkItem(context.Background(), contribActor, UpdateWorkItemInput{
		ID:       string(workItem2UUID),
		ParentID: Optional[string]{Set: true, Value: &otherRaw},
	}); !errors.Is(err, domain.ErrInvalidParent) {
		t.Fatalf("cross-project parent err = %v, want ErrInvalidParent", err)
	}

	// Changing Story -> Epic when it has Task children is rejected
	items.childTypes = []domain.WorkItemTypeID{typeTaskUUID}
	epicRaw := string(typeEpicUUID)
	if _, err := svc.UpdateWorkItem(context.Background(), contribActor, UpdateWorkItemInput{
		ID:             string(workItem1UUID),
		WorkItemTypeID: &epicRaw,
	}); !errors.Is(err, domain.ErrInvalidWorkItemType) {
		t.Fatalf("incompatible child type err = %v, want ErrInvalidWorkItemType", err)
	}

	// Viewer forbidden
	ws.access.Role = domain.RoleViewer
	if _, err := svc.UpdateWorkItem(context.Background(), contribActor, UpdateWorkItemInput{ID: string(workItem1UUID)}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("viewer update err = %v, want ErrForbidden", err)
	}
}

func TestTransitionAndDeleteWorkItem(t *testing.T) {
	svc, _, items, ws, _ := newTestWorkItemHarness(domain.RoleContributor)

	got, err := svc.TransitionWorkItem(context.Background(), contribActor, string(workItem1UUID), string(statusDoingUUID))
	if err != nil || got.StatusID != statusDoingUUID || items.transitioned != statusDoingUUID {
		t.Fatalf("TransitionWorkItem = %+v, %v", got, err)
	}
	if _, err := svc.TransitionWorkItem(context.Background(), contribActor, string(workItem1UUID), "bad"); !errors.Is(err, domain.ErrInvalidStatus) {
		t.Fatalf("bad status err = %v", err)
	}
	if _, err := svc.TransitionWorkItem(context.Background(), contribActor, string(workItem1UUID), "44444444-4444-4444-4444-444444444499"); !errors.Is(err, domain.ErrInvalidStatus) {
		t.Fatalf("other project status err = %v", err)
	}

	if err := svc.DeleteWorkItem(context.Background(), contribActor, string(workItem1UUID)); err != nil || items.deletedID != workItem1UUID {
		t.Fatalf("DeleteWorkItem err = %v, deleted = %q", err, items.deletedID)
	}

	ws.access.Role = domain.RoleViewer
	if _, err := svc.TransitionWorkItem(context.Background(), contribActor, string(workItem1UUID), string(statusDoingUUID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("viewer transition err = %v", err)
	}
	if err := svc.DeleteWorkItem(context.Background(), contribActor, string(workItem1UUID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("viewer delete err = %v", err)
	}
}
