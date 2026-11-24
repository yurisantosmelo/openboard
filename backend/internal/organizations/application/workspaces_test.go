package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

const legalID = "7c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f"

type fakeWorkspaces struct {
	role    domain.Role
	roleErr error
	err     error
	created []NewWorkspace
	foundID domain.WorkspaceID
	orgID   domain.OrganizationID
	scope   Scope
	page    PageRequest
	// viewerRole is the role Find reports; updated and updateErr serve Update.
	viewerRole domain.Role
	updated    []WorkspaceChange
	updateErr  error
}

func (f *fakeWorkspaces) Update(_ context.Context, change WorkspaceChange) (domain.Workspace, error) {
	f.updated = append(f.updated, change)
	return domain.Workspace{ID: change.ID, Name: "Renamed"}, f.updateErr
}

func (f *fakeWorkspaces) RoleIn(_ context.Context, id domain.OrganizationID, scope Scope) (domain.Role, error) {
	f.orgID, f.scope = id, scope
	return f.role, f.roleErr
}

func (f *fakeWorkspaces) Create(_ context.Context, w NewWorkspace) (domain.Workspace, error) {
	f.created = append(f.created, w)
	return domain.Workspace{ID: legalID, Name: w.Name, Visibility: w.Visibility}, f.err
}

func (f *fakeWorkspaces) Find(_ context.Context, id domain.WorkspaceID, scope Scope) (domain.Workspace, error) {
	f.foundID, f.scope = id, scope
	return domain.Workspace{ID: id, ViewerRole: f.viewerRole}, f.err
}

func (f *fakeWorkspaces) List(_ context.Context, id domain.OrganizationID, scope Scope, page PageRequest) ([]domain.Workspace, int, error) {
	f.orgID, f.scope, f.page = id, scope, page
	return []domain.Workspace{{ID: legalID}}, 7, f.err
}

func TestCreateWorkspaceIsRestrictedByDefault(t *testing.T) {
	repo := &fakeWorkspaces{role: domain.RoleOwner}
	ws, err := NewWorkspaceService(repo).CreateWorkspace(context.Background(), contributor,
		CreateWorkspaceInput{OrganizationID: acmeID, Name: "  Legal "})
	if err != nil {
		t.Fatal(err)
	}
	want := NewWorkspace{OrganizationID: acmeID, Name: "Legal", Visibility: domain.VisibilityRestricted, CreatorID: marinaID}
	if len(repo.created) != 1 || repo.created[0] != want {
		t.Fatalf("created %+v, want %+v", repo.created, want)
	}
	if ws.ID != legalID || ws.ViewerRole != domain.WorkspaceRoleOwner || repo.scope != (Scope{UserID: marinaID}) {
		t.Errorf("returned %+v, scope %+v", ws, repo.scope)
	}
}

func TestCreateOpenWorkspace(t *testing.T) {
	repo := &fakeWorkspaces{role: domain.RoleOwner}
	_, err := NewWorkspaceService(repo).CreateWorkspace(context.Background(), administrator,
		CreateWorkspaceInput{OrganizationID: acmeID, Name: "Legal", Visibility: "open"})
	if err != nil || repo.created[0].Visibility != domain.VisibilityOpen {
		t.Fatalf("created %+v, err %v", repo.created, err)
	}
}

func TestCreateWorkspaceRejections(t *testing.T) {
	errStore := errors.New("store down")
	valid := CreateWorkspaceInput{OrganizationID: acmeID, Name: "Legal"}
	cases := map[string]struct {
		in   CreateWorkspaceInput
		repo fakeWorkspaces
		want []error
	}{
		"every field invalid": {CreateWorkspaceInput{OrganizationID: "x", Name: " ", Visibility: "private"}, fakeWorkspaces{},
			[]error{domain.ErrInvalidOrganizationRef, domain.ErrInvalidName, domain.ErrInvalidVisibility}},
		"unseen Organization": {valid, fakeWorkspaces{roleErr: domain.ErrUnknownOrganization}, []error{domain.ErrUnknownOrganization}},
		"not an Owner":        {valid, fakeWorkspaces{role: domain.RoleContributor}, []error{domain.ErrForbidden}},
		"name taken":          {valid, fakeWorkspaces{role: domain.RoleOwner, err: domain.ErrWorkspaceNameTaken}, []error{domain.ErrWorkspaceNameTaken}},
		"store failure":       {valid, fakeWorkspaces{role: domain.RoleOwner, err: errStore}, []error{errStore}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := NewWorkspaceService(&tc.repo).CreateWorkspace(context.Background(), contributor, tc.in)
			for _, want := range tc.want {
				if !errors.Is(err, want) {
					t.Errorf("err = %v, want it to wrap %v", err, want)
				}
			}
		})
	}
}

func TestCreateWorkspaceStoresNothingWhenForbidden(t *testing.T) {
	repo := &fakeWorkspaces{role: domain.RoleContributor}
	_, _ = NewWorkspaceService(repo).CreateWorkspace(context.Background(), contributor,
		CreateWorkspaceInput{OrganizationID: acmeID, Name: "Legal"})
	if len(repo.created) != 0 {
		t.Errorf("created %+v, want nothing", repo.created)
	}
}

func ptr[T any](v T) *T { return &v }

func TestUpdateWorkspace(t *testing.T) {
	repo := &fakeWorkspaces{viewerRole: domain.WorkspaceRoleOwner}
	ws, err := NewWorkspaceService(repo).UpdateWorkspace(context.Background(), contributor,
		UpdateWorkspaceInput{ID: legalID, Name: ptr(" Legal team "), Visibility: ptr("open")})
	if err != nil {
		t.Fatal(err)
	}
	if len(repo.updated) != 1 {
		t.Fatalf("updated %+v, want one change", repo.updated)
	}
	got := repo.updated[0]
	if got.ID != legalID || *got.Name != "Legal team" || *got.Visibility != domain.VisibilityOpen {
		t.Errorf("change %+v", got)
	}
	if ws.Name != "Renamed" || ws.ViewerRole != domain.WorkspaceRoleOwner || repo.scope != (Scope{UserID: marinaID}) {
		t.Errorf("returned %+v, scope %+v", ws, repo.scope)
	}
}

func TestUpdateWorkspaceChangesOnlyGivenFields(t *testing.T) {
	repo := &fakeWorkspaces{viewerRole: domain.WorkspaceRoleOwner}
	_, err := NewWorkspaceService(repo).UpdateWorkspace(context.Background(), contributor,
		UpdateWorkspaceInput{ID: legalID, Visibility: ptr("restricted")})
	if err != nil || len(repo.updated) != 1 || repo.updated[0].Name != nil {
		t.Fatalf("updated %+v, err %v", repo.updated, err)
	}
}

func TestUpdateWorkspaceWithoutFieldsReturnsItUnchanged(t *testing.T) {
	repo := &fakeWorkspaces{viewerRole: domain.WorkspaceRoleOwner}
	ws, err := NewWorkspaceService(repo).UpdateWorkspace(context.Background(), contributor,
		UpdateWorkspaceInput{ID: legalID})
	if err != nil || ws.ID != legalID || len(repo.updated) != 0 {
		t.Fatalf("workspace %+v, updated %+v, err %v", ws, repo.updated, err)
	}
}

func TestUpdateWorkspaceRejections(t *testing.T) {
	errStore := errors.New("store down")
	rename := UpdateWorkspaceInput{ID: legalID, Name: ptr("Legal")}
	owner := domain.WorkspaceRoleOwner
	cases := map[string]struct {
		in   UpdateWorkspaceInput
		repo fakeWorkspaces
		want []error
	}{
		"invalid id":          {UpdateWorkspaceInput{ID: "legal"}, fakeWorkspaces{}, []error{domain.ErrWorkspaceNotFound}},
		"every field invalid": {UpdateWorkspaceInput{ID: legalID, Name: ptr(" "), Visibility: ptr("")}, fakeWorkspaces{viewerRole: owner}, []error{domain.ErrInvalidName, domain.ErrInvalidVisibility}},
		"cannot enter":        {rename, fakeWorkspaces{err: domain.ErrWorkspaceNotFound}, []error{domain.ErrWorkspaceNotFound}},
		"not an Owner":        {rename, fakeWorkspaces{viewerRole: domain.WorkspaceRoleContributor}, []error{domain.ErrForbidden}},
		"name taken":          {rename, fakeWorkspaces{viewerRole: owner, updateErr: domain.ErrWorkspaceNameTaken}, []error{domain.ErrWorkspaceNameTaken}},
		"store failure":       {rename, fakeWorkspaces{viewerRole: owner, updateErr: errStore}, []error{errStore}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := NewWorkspaceService(&tc.repo).UpdateWorkspace(context.Background(), contributor, tc.in)
			for _, want := range tc.want {
				if !errors.Is(err, want) {
					t.Errorf("err = %v, want it to wrap %v", err, want)
				}
			}
		})
	}
}

func TestUpdateWorkspaceChangesNothingWhenForbidden(t *testing.T) {
	repo := &fakeWorkspaces{viewerRole: domain.WorkspaceRoleViewer}
	_, _ = NewWorkspaceService(repo).UpdateWorkspace(context.Background(), contributor,
		UpdateWorkspaceInput{ID: legalID, Name: ptr("Legal")})
	if len(repo.updated) != 0 {
		t.Errorf("updated %+v, want nothing", repo.updated)
	}
}

func TestGetWorkspaceScopesByActor(t *testing.T) {
	repo := &fakeWorkspaces{}
	ws, err := NewWorkspaceService(repo).GetWorkspace(context.Background(), administrator, legalID)
	if err != nil || ws.ID != legalID {
		t.Fatalf("workspace %+v, err %v", ws, err)
	}
	if repo.scope != (Scope{UserID: adminID, All: true}) {
		t.Errorf("scope %+v", repo.scope)
	}
}

func TestGetWorkspaceWithInvalidIDIsNotFound(t *testing.T) {
	repo := &fakeWorkspaces{}
	_, err := NewWorkspaceService(repo).GetWorkspace(context.Background(), administrator, "legal")
	if !errors.Is(err, domain.ErrWorkspaceNotFound) || repo.foundID != "" {
		t.Errorf("err = %v, Find called with %q", err, repo.foundID)
	}
}

func TestListWorkspaces(t *testing.T) {
	repo := &fakeWorkspaces{role: domain.RoleContributor}
	page := PageRequest{Limit: 20, Offset: 20}
	items, total, err := NewWorkspaceService(repo).ListWorkspaces(context.Background(), contributor, acmeID, page)
	if err != nil || total != 7 || len(items) != 1 {
		t.Fatalf("items %+v, total %d, err %v", items, total, err)
	}
	if repo.orgID != acmeID || repo.scope != (Scope{UserID: marinaID}) || repo.page != page {
		t.Errorf("List(%q, %+v, %+v)", repo.orgID, repo.scope, repo.page)
	}
}

func TestListWorkspacesRejections(t *testing.T) {
	cases := map[string]struct {
		organizationID string
		roleErr        error
		want           error
	}{
		"invalid Organization": {"acme", nil, domain.ErrInvalidOrganizationRef},
		"unseen Organization":  {acmeID, domain.ErrUnknownOrganization, domain.ErrUnknownOrganization},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeWorkspaces{roleErr: tc.roleErr}
			_, _, err := NewWorkspaceService(repo).ListWorkspaces(context.Background(), contributor, tc.organizationID, PageRequest{Limit: 20})
			if !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}
