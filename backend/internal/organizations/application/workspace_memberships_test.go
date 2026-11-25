package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

const (
	testWSID   = "7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f"
	testOrgID  = "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	testUserID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
)

type fakeWorkspaceMembershipRepo struct {
	ws          domain.Workspace
	findErr     error
	createErr   error
	listErr     error
	updateErr   error
	deleteErr   error
	findScope   Scope
	created     NewWorkspaceMembership
	returned    domain.WorkspaceMembership
	items       []domain.WorkspaceMembership
	total       int
	listWS      domain.WorkspaceID
	listPage    PageRequest
	updatedWS   domain.WorkspaceID
	updatedUser domain.UserID
	updatedRole domain.Role
	deletedWS   domain.WorkspaceID
	deletedUser domain.UserID
}

func (f *fakeWorkspaceMembershipRepo) FindWorkspace(_ context.Context, _ domain.WorkspaceID, scope Scope) (domain.Workspace, error) {
	f.findScope = scope
	return f.ws, f.findErr
}

func (f *fakeWorkspaceMembershipRepo) Create(_ context.Context, m NewWorkspaceMembership) (domain.WorkspaceMembership, error) {
	f.created = m
	return f.returned, f.createErr
}

func (f *fakeWorkspaceMembershipRepo) List(_ context.Context, id domain.WorkspaceID, page PageRequest) ([]domain.WorkspaceMembership, int, error) {
	f.listWS, f.listPage = id, page
	return f.items, f.total, f.listErr
}

func (f *fakeWorkspaceMembershipRepo) UpdateRole(_ context.Context, id domain.WorkspaceID, userID domain.UserID, role domain.Role) (domain.WorkspaceMembership, error) {
	f.updatedWS, f.updatedUser, f.updatedRole = id, userID, role
	return f.returned, f.updateErr
}

func (f *fakeWorkspaceMembershipRepo) Delete(_ context.Context, id domain.WorkspaceID, userID domain.UserID) error {
	f.deletedWS, f.deletedUser = id, userID
	return f.deleteErr
}

func ownedWorkspace(role domain.Role) domain.Workspace {
	return domain.Workspace{ID: testWSID, OrganizationID: testOrgID, Name: "Legal", ViewerRole: role}
}

func TestListWorkspaceMemberships(t *testing.T) {
	item := domain.WorkspaceMembership{WorkspaceID: testWSID, OrganizationID: testOrgID, UserID: testUserID, Username: "ana", Name: "Ana", Role: domain.WorkspaceRoleViewer}
	repo := &fakeWorkspaceMembershipRepo{ws: ownedWorkspace(domain.WorkspaceRoleOwner), items: []domain.WorkspaceMembership{item}, total: 1}
	svc := NewWorkspaceMembershipService(repo)

	page := PageRequest{Limit: 10, Offset: 20}
	items, total, err := svc.ListMemberships(context.Background(), marinaActor, testWSID, page)
	if err != nil || total != 1 || len(items) != 1 || items[0] != item || repo.listWS != testWSID || repo.listPage != page {
		t.Fatalf("ListMemberships = %+v, %d, %v", items, total, err)
	}
}

func TestListWorkspaceMembershipsRejections(t *testing.T) {
	cases := map[string]struct {
		id      string
		role    domain.Role
		findErr error
		want    error
	}{
		"invalid ws id": {"legal", domain.WorkspaceRoleOwner, nil, domain.ErrWorkspaceNotFound},
		"unseen ws":     {testWSID, "", domain.ErrWorkspaceNotFound, domain.ErrWorkspaceNotFound},
		"contributor":   {testWSID, domain.WorkspaceRoleContributor, nil, domain.ErrForbidden},
		"viewer":        {testWSID, domain.WorkspaceRoleViewer, nil, domain.ErrForbidden},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeWorkspaceMembershipRepo{ws: ownedWorkspace(tc.role), findErr: tc.findErr}
			if _, _, err := NewWorkspaceMembershipService(repo).ListMemberships(context.Background(), marinaActor, tc.id, PageRequest{Limit: 20}); !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestAddWorkspaceMembership(t *testing.T) {
	want := domain.WorkspaceMembership{WorkspaceID: testWSID, OrganizationID: testOrgID, UserID: testUserID, Username: "ana", Name: "Ana", Role: domain.WorkspaceRoleContributor}
	repo := &fakeWorkspaceMembershipRepo{ws: ownedWorkspace(domain.WorkspaceRoleOwner), returned: want}
	svc := NewWorkspaceMembershipService(repo)

	got, err := svc.AddMembership(context.Background(), administrator, AddWorkspaceMembershipInput{
		WorkspaceID: testWSID, Username: "  ANA  ",
	})
	if err != nil || got != want {
		t.Fatalf("AddMembership = %+v, %v", got, err)
	}
	wantNew := NewWorkspaceMembership{WorkspaceID: testWSID, OrganizationID: testOrgID, Username: "ana", Role: domain.WorkspaceRoleContributor}
	if !repo.findScope.All || repo.created != wantNew {
		t.Errorf("scope %+v, created %+v", repo.findScope, repo.created)
	}
}

func TestAddWorkspaceMembershipRejections(t *testing.T) {
	cases := map[string]struct {
		in        AddWorkspaceMembershipInput
		role      domain.Role
		findErr   error
		createErr error
		want      []error
	}{
		"invalid ws":    {AddWorkspaceMembershipInput{WorkspaceID: "legal", Username: "ana"}, domain.WorkspaceRoleOwner, nil, nil, []error{domain.ErrWorkspaceNotFound}},
		"all invalid":   {AddWorkspaceMembershipInput{WorkspaceID: testWSID, Username: "x", Role: "admin"}, domain.WorkspaceRoleOwner, nil, nil, []error{domain.ErrInvalidUsername, domain.ErrInvalidWorkspaceRole}},
		"unseen ws":     {AddWorkspaceMembershipInput{WorkspaceID: testWSID, Username: "ana"}, "", domain.ErrWorkspaceNotFound, nil, []error{domain.ErrWorkspaceNotFound}},
		"contributor":   {AddWorkspaceMembershipInput{WorkspaceID: testWSID, Username: "ana"}, domain.WorkspaceRoleContributor, nil, nil, []error{domain.ErrForbidden}},
		"not in org":    {AddWorkspaceMembershipInput{WorkspaceID: testWSID, Username: "ana"}, domain.WorkspaceRoleOwner, nil, domain.ErrOrganizationMemberNotFound, []error{domain.ErrOrganizationMemberNotFound}},
		"already added": {AddWorkspaceMembershipInput{WorkspaceID: testWSID, Username: "ana"}, domain.WorkspaceRoleOwner, nil, domain.ErrWorkspaceMembershipExists, []error{domain.ErrWorkspaceMembershipExists}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeWorkspaceMembershipRepo{ws: ownedWorkspace(tc.role), findErr: tc.findErr, createErr: tc.createErr}
			_, err := NewWorkspaceMembershipService(repo).AddMembership(context.Background(), marinaActor, tc.in)
			for _, want := range tc.want {
				if !errors.Is(err, want) {
					t.Errorf("err = %v, want %v", err, want)
				}
			}
		})
	}
}

func TestUpdateWorkspaceMembership(t *testing.T) {
	want := domain.WorkspaceMembership{WorkspaceID: testWSID, OrganizationID: testOrgID, UserID: testUserID, Username: "ana", Name: "Ana", Role: domain.WorkspaceRoleViewer}
	repo := &fakeWorkspaceMembershipRepo{ws: ownedWorkspace(domain.WorkspaceRoleOwner), returned: want}
	svc := NewWorkspaceMembershipService(repo)

	got, err := svc.UpdateMembership(context.Background(), marinaActor, UpdateWorkspaceMembershipInput{
		WorkspaceID: testWSID, UserID: testUserID, Role: "viewer",
	})
	if err != nil || got != want || repo.updatedWS != testWSID || repo.updatedUser != testUserID || repo.updatedRole != domain.WorkspaceRoleViewer {
		t.Fatalf("UpdateMembership = %+v, %v", got, err)
	}
}

func TestUpdateWorkspaceMembershipRejections(t *testing.T) {
	cases := map[string]struct {
		in        UpdateWorkspaceMembershipInput
		role      domain.Role
		findErr   error
		updateErr error
		want      error
	}{
		"invalid ws":    {UpdateWorkspaceMembershipInput{WorkspaceID: "x", UserID: testUserID, Role: "viewer"}, domain.WorkspaceRoleOwner, nil, nil, domain.ErrWorkspaceNotFound},
		"invalid user":  {UpdateWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: "x", Role: "viewer"}, domain.WorkspaceRoleOwner, nil, nil, domain.ErrWorkspaceMembershipNotFound},
		"invalid role":  {UpdateWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: testUserID, Role: ""}, domain.WorkspaceRoleOwner, nil, nil, domain.ErrInvalidWorkspaceRole},
		"unseen ws":     {UpdateWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: testUserID, Role: "viewer"}, "", domain.ErrWorkspaceNotFound, nil, domain.ErrWorkspaceNotFound},
		"contributor":   {UpdateWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: testUserID, Role: "viewer"}, domain.WorkspaceRoleContributor, nil, nil, domain.ErrForbidden},
		"absent member": {UpdateWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: testUserID, Role: "viewer"}, domain.WorkspaceRoleOwner, nil, domain.ErrWorkspaceMembershipNotFound, domain.ErrWorkspaceMembershipNotFound},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeWorkspaceMembershipRepo{ws: ownedWorkspace(tc.role), findErr: tc.findErr, updateErr: tc.updateErr}
			if _, err := NewWorkspaceMembershipService(repo).UpdateMembership(context.Background(), marinaActor, tc.in); !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestRemoveWorkspaceMembership(t *testing.T) {
	cases := map[string]struct {
		role   domain.Role
		target string
	}{
		"owner removes another": {domain.WorkspaceRoleOwner, testUserID},
		"viewer leaves own":     {domain.WorkspaceRoleViewer, marinaID},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeWorkspaceMembershipRepo{ws: ownedWorkspace(tc.role)}
			err := NewWorkspaceMembershipService(repo).RemoveMembership(context.Background(), marinaActor, RemoveWorkspaceMembershipInput{
				WorkspaceID: testWSID, UserID: tc.target,
			})
			if err != nil || repo.deletedWS != testWSID || repo.deletedUser != domain.UserID(tc.target) {
				t.Fatalf("RemoveMembership err=%v, deleted=(%s, %s)", err, repo.deletedWS, repo.deletedUser)
			}
		})
	}
}

func TestRemoveWorkspaceMembershipRejections(t *testing.T) {
	cases := map[string]struct {
		in        RemoveWorkspaceMembershipInput
		role      domain.Role
		findErr   error
		deleteErr error
		want      error
	}{
		"invalid ws":        {RemoveWorkspaceMembershipInput{WorkspaceID: "x", UserID: testUserID}, domain.WorkspaceRoleOwner, nil, nil, domain.ErrWorkspaceNotFound},
		"invalid user":      {RemoveWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: "x"}, domain.WorkspaceRoleOwner, nil, nil, domain.ErrWorkspaceMembershipNotFound},
		"unseen ws":         {RemoveWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: testUserID}, "", domain.ErrWorkspaceNotFound, nil, domain.ErrWorkspaceNotFound},
		"viewer other user": {RemoveWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: testUserID}, domain.WorkspaceRoleViewer, nil, nil, domain.ErrForbidden},
		"absent member":     {RemoveWorkspaceMembershipInput{WorkspaceID: testWSID, UserID: testUserID}, domain.WorkspaceRoleOwner, nil, domain.ErrWorkspaceMembershipNotFound, domain.ErrWorkspaceMembershipNotFound},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeWorkspaceMembershipRepo{ws: ownedWorkspace(tc.role), findErr: tc.findErr, deleteErr: tc.deleteErr}
			if err := NewWorkspaceMembershipService(repo).RemoveMembership(context.Background(), marinaActor, tc.in); !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}
