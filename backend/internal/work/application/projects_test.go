package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func TestCreateProjectSeedsDefaultWorkflow(t *testing.T) {
	repo := &fakeProjects{
		project: domain.Project{ID: projectUUID, OrganizationID: orgUUID, WorkspaceID: wsUUID, Name: "Core"},
	}
	ws := &fakeWorkspaces{access: domain.WorkspaceAccess{WorkspaceID: wsUUID, OrganizationID: orgUUID, Role: domain.RoleOwner}}

	got, err := NewService(repo, ws).CreateProject(context.Background(), ownerActor, CreateProjectInput{
		WorkspaceID: string(wsUUID), Name: "  Core  ",
	})
	if err != nil || got.ViewerRole != domain.RoleOwner || got.ID != projectUUID {
		t.Fatalf("CreateProject = %+v, %v", got, err)
	}
	if repo.created.Name != "Core" || repo.created.OrganizationID != orgUUID {
		t.Errorf("created = %+v", repo.created)
	}
	if len(repo.created.Statuses) != 4 || len(repo.created.WorkItemTypes) != 6 || len(repo.created.Hierarchy) != 6 {
		t.Errorf("defaults not passed: %d statuses, %d types, %d rules",
			len(repo.created.Statuses), len(repo.created.WorkItemTypes), len(repo.created.Hierarchy))
	}
}

func TestCreateProjectRejections(t *testing.T) {
	cases := map[string]struct {
		in      CreateProjectInput
		role    domain.Role
		wsErr   error
		repoErr error
		want    []error
	}{
		"all invalid":   {CreateProjectInput{WorkspaceID: "x", Name: " "}, domain.RoleOwner, nil, nil, []error{domain.ErrInvalidWorkspaceRef, domain.ErrInvalidName}},
		"unknown ws":    {CreateProjectInput{WorkspaceID: string(wsUUID), Name: "Core"}, "", domain.ErrWorkspaceNotFound, nil, []error{domain.ErrWorkspaceNotFound}},
		"contributor":   {CreateProjectInput{WorkspaceID: string(wsUUID), Name: "Core"}, domain.RoleContributor, nil, nil, []error{domain.ErrForbidden}},
		"duplicate":     {CreateProjectInput{WorkspaceID: string(wsUUID), Name: "Core"}, domain.RoleOwner, nil, domain.ErrProjectNameInUse, []error{domain.ErrProjectNameInUse}},
		"storage error": {CreateProjectInput{WorkspaceID: string(wsUUID), Name: "Core"}, domain.RoleOwner, nil, errBoom, []error{errBoom}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeProjects{createErr: tc.repoErr}
			ws := &fakeWorkspaces{access: domain.WorkspaceAccess{WorkspaceID: wsUUID, OrganizationID: orgUUID, Role: tc.role}, err: tc.wsErr}
			_, err := NewService(repo, ws).CreateProject(context.Background(), contribActor, tc.in)
			for _, want := range tc.want {
				if !errors.Is(err, want) {
					t.Errorf("err = %v, want %v", err, want)
				}
			}
		})
	}
}

func TestListProjects(t *testing.T) {
	repo := &fakeProjects{
		items: []domain.Project{{ID: projectUUID, WorkspaceID: wsUUID, Name: "Core"}},
		total: 1,
	}
	ws := &fakeWorkspaces{access: domain.WorkspaceAccess{WorkspaceID: wsUUID, OrganizationID: orgUUID, Role: domain.RoleViewer}}

	items, total, err := NewService(repo, ws).ListProjects(context.Background(), contribActor, string(wsUUID), PageRequest{Limit: 10, Offset: 5})
	if err != nil || total != 1 || len(items) != 1 || items[0].ViewerRole != domain.RoleViewer || repo.lastPage.Limit != 10 {
		t.Fatalf("ListProjects = %+v, %d, %v", items, total, err)
	}

	if _, _, err := NewService(repo, ws).ListProjects(context.Background(), contribActor, "bad", PageRequest{}); !errors.Is(err, domain.ErrInvalidWorkspaceRef) {
		t.Errorf("bad ws err = %v", err)
	}
	ws.err = domain.ErrWorkspaceNotFound
	if _, _, err := NewService(repo, ws).ListProjects(context.Background(), contribActor, string(wsUUID), PageRequest{}); !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Errorf("unseen ws err = %v", err)
	}
	ws.err = nil
	repo.listErr = errBoom
	if _, _, err := NewService(repo, ws).ListProjects(context.Background(), contribActor, string(wsUUID), PageRequest{}); !errors.Is(err, errBoom) {
		t.Errorf("list err = %v", err)
	}
}

func TestGetAndReadWorkflow(t *testing.T) {
	repo := &fakeProjects{
		project:  domain.Project{ID: projectUUID, WorkspaceID: wsUUID, Name: "Core"},
		statuses: []domain.Status{{ID: "s1", Name: "Backlog", Group: domain.StatusGroupNotCommitted}},
		types:    []domain.WorkItemType{{ID: "t1", Name: "Task", EstimateUnit: domain.EstimateUnitHours}},
	}
	ws := &fakeWorkspaces{access: domain.WorkspaceAccess{WorkspaceID: wsUUID, OrganizationID: orgUUID, Role: domain.RoleContributor}}
	svc := NewService(repo, ws)

	p, err := svc.GetProject(context.Background(), contribActor, string(projectUUID))
	if err != nil || p.ViewerRole != domain.RoleContributor {
		t.Fatalf("GetProject = %+v, %v", p, err)
	}
	if statuses, err := svc.ListStatuses(context.Background(), contribActor, string(projectUUID)); err != nil || len(statuses) != 1 {
		t.Fatalf("ListStatuses = %+v, %v", statuses, err)
	}
	if types, err := svc.ListWorkItemTypes(context.Background(), contribActor, string(projectUUID)); err != nil || len(types) != 1 {
		t.Fatalf("ListWorkItemTypes = %+v, %v", types, err)
	}
}

func TestGetAndReadWorkflowRejections(t *testing.T) {
	repo := &fakeProjects{project: domain.Project{ID: projectUUID, WorkspaceID: wsUUID, Name: "Core"}}
	ws := &fakeWorkspaces{err: domain.ErrWorkspaceNotFound}
	svc := NewService(repo, ws)

	// Unseen Workspace hides the Project as ErrNotFound (ADR 0003).
	if _, err := svc.GetProject(context.Background(), contribActor, string(projectUUID)); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unseen GetProject err = %v, want ErrNotFound", err)
	}
	if _, err := svc.ListStatuses(context.Background(), contribActor, string(projectUUID)); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unseen ListStatuses err = %v, want ErrNotFound", err)
	}
	if _, err := svc.ListWorkItemTypes(context.Background(), contribActor, string(projectUUID)); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unseen ListWorkItemTypes err = %v, want ErrNotFound", err)
	}

	ws.err = errBoom
	if _, err := svc.GetProject(context.Background(), contribActor, string(projectUUID)); !errors.Is(err, errBoom) {
		t.Errorf("access err = %v, want boom", err)
	}
	if _, err := svc.GetProject(context.Background(), contribActor, "bad"); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("bad id err = %v, want ErrNotFound", err)
	}
	repo.findErr = domain.ErrNotFound
	if _, err := svc.GetProject(context.Background(), contribActor, string(projectUUID)); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("missing err = %v, want ErrNotFound", err)
	}
}

func TestUpdateProject(t *testing.T) {
	newName := "  Renamed  "
	repo := &fakeProjects{project: domain.Project{ID: projectUUID, WorkspaceID: wsUUID, Name: "Core"}}
	ws := &fakeWorkspaces{access: domain.WorkspaceAccess{WorkspaceID: wsUUID, OrganizationID: orgUUID, Role: domain.RoleOwner}}
	svc := NewService(repo, ws)

	got, err := svc.UpdateProject(context.Background(), ownerActor, UpdateProjectInput{ID: string(projectUUID), Name: &newName})
	if err != nil || got.Name != "Renamed" || got.ViewerRole != domain.RoleOwner || repo.renamed != "Renamed" {
		t.Fatalf("UpdateProject = %+v, %v", got, err)
	}
	noop, err := svc.UpdateProject(context.Background(), ownerActor, UpdateProjectInput{ID: string(projectUUID)})
	if err != nil || noop.Name != "Core" {
		t.Fatalf("noop UpdateProject = %+v, %v", noop, err)
	}
}

func TestUpdateProjectRejections(t *testing.T) {
	newName := "Renamed"
	blank := "   "
	repo := &fakeProjects{project: domain.Project{ID: projectUUID, WorkspaceID: wsUUID, Name: "Core"}}
	ws := &fakeWorkspaces{access: domain.WorkspaceAccess{WorkspaceID: wsUUID, OrganizationID: orgUUID, Role: domain.RoleOwner}}
	svc := NewService(repo, ws)

	if _, err := svc.UpdateProject(context.Background(), ownerActor, UpdateProjectInput{ID: string(projectUUID), Name: &blank}); !errors.Is(err, domain.ErrInvalidName) {
		t.Errorf("blank err = %v, want ErrInvalidName", err)
	}
	if _, err := svc.UpdateProject(context.Background(), ownerActor, UpdateProjectInput{ID: "bad", Name: &newName}); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("bad id err = %v, want ErrNotFound", err)
	}
	ws.access.Role = domain.RoleContributor
	if _, err := svc.UpdateProject(context.Background(), contribActor, UpdateProjectInput{ID: string(projectUUID), Name: &newName}); !errors.Is(err, domain.ErrForbidden) {
		t.Errorf("contributor err = %v, want ErrForbidden", err)
	}
	ws.access.Role = domain.RoleOwner
	repo.renameErr = domain.ErrProjectNameInUse
	if _, err := svc.UpdateProject(context.Background(), ownerActor, UpdateProjectInput{ID: string(projectUUID), Name: &newName}); !errors.Is(err, domain.ErrProjectNameInUse) {
		t.Errorf("duplicate err = %v, want ErrProjectNameInUse", err)
	}
}
