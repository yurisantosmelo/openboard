package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

// workspaceWorld is one Organization with an Open Default Workspace, a
// Restricted Legal Workspace and one User of each kind.
type workspaceWorld struct {
	acme                                     domain.Organization
	legal                                    domain.Workspace
	owner, contributor, legalMember, outside domain.UserID
}

func addMembership(t *testing.T, org domain.OrganizationID, user domain.UserID) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `INSERT INTO organization_memberships (organization_id, user_id, role)
		VALUES ($1, $2, 'contributor')`, string(org), string(user)); err != nil {
		t.Fatal(err)
	}
}

func newWorkspaceWorld(t *testing.T) workspaceWorld {
	t.Helper()
	w := workspaceWorld{owner: createUser(t, "marina")}
	w.contributor, w.legalMember, w.outside = addUser(t, "julia"), addUser(t, "pedro"), addUser(t, "rui")
	w.acme = seed(t, w.owner, "Acme")["Acme"]
	addMembership(t, w.acme.ID, w.contributor)
	addMembership(t, w.acme.ID, w.legalMember)

	legal, err := NewWorkspaces(pool).Create(context.Background(), application.NewWorkspace{
		OrganizationID: w.acme.ID, Name: "Legal", Visibility: domain.VisibilityRestricted, CreatorID: w.owner,
	})
	if err != nil {
		t.Fatal(err)
	}
	w.legal = legal
	if _, err := pool.Exec(context.Background(), `INSERT INTO workspace_memberships (workspace_id, organization_id, user_id, role)
		VALUES ($1, $2, $3, 'viewer')`, string(legal.ID), string(w.acme.ID), string(w.legalMember)); err != nil {
		t.Fatal(err)
	}
	return w
}

func membershipRole(t *testing.T, ws domain.WorkspaceID, user domain.UserID) string {
	t.Helper()
	var role string
	err := pool.QueryRow(context.Background(), `SELECT coalesce(max(role), '') FROM workspace_memberships
		WHERE workspace_id = $1 AND user_id = $2`, string(ws), string(user)).Scan(&role)
	if err != nil {
		t.Fatal(err)
	}
	return role
}

func TestCreateWorkspaceMakesCreatorItsOwner(t *testing.T) {
	w := newWorkspaceWorld(t)
	if w.legal.ID == "" || w.legal.OrganizationID != w.acme.ID || w.legal.Name != "Legal" ||
		w.legal.Visibility != domain.VisibilityRestricted || w.legal.CreatedAt.IsZero() || w.legal.UpdatedAt.IsZero() {
		t.Fatalf("returned %+v", w.legal)
	}
	if got := membershipRole(t, w.legal.ID, w.owner); got != "owner" {
		t.Errorf("creator role = %q, want owner", got)
	}
}

func TestCreateWorkspaceGivesAdministratorNoMembership(t *testing.T) {
	w := newWorkspaceWorld(t)
	ws, err := NewWorkspaces(pool).Create(context.Background(), application.NewWorkspace{
		OrganizationID: w.acme.ID, Name: "Finance", Visibility: domain.VisibilityOpen, CreatorID: w.outside,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := membershipRole(t, ws.ID, w.outside); got != "" {
		t.Errorf("role = %q, want no Workspace Membership", got)
	}
}

func TestCreateWorkspaceRejectsNameInUseIgnoringCase(t *testing.T) {
	w := newWorkspaceWorld(t)
	_, err := NewWorkspaces(pool).Create(context.Background(), application.NewWorkspace{
		OrganizationID: w.acme.ID, Name: "LEGAL", Visibility: domain.VisibilityOpen, CreatorID: w.owner,
	})
	if !errors.Is(err, domain.ErrWorkspaceNameTaken) {
		t.Fatalf("err = %v, want ErrWorkspaceNameTaken", err)
	}
}

func TestSameWorkspaceNameInAnotherOrganization(t *testing.T) {
	w := newWorkspaceWorld(t)
	globex := seed(t, w.owner, "Globex")["Globex"]
	_, err := NewWorkspaces(pool).Create(context.Background(), application.NewWorkspace{
		OrganizationID: globex.ID, Name: "Legal", Visibility: domain.VisibilityOpen, CreatorID: w.owner,
	})
	if err != nil {
		t.Fatalf("err = %v; names only collide inside one Organization", err)
	}
}

func TestCreateWorkspaceReportsOtherFailures(t *testing.T) {
	w := newWorkspaceWorld(t)
	_, err := NewWorkspaces(pool).Create(context.Background(), application.NewWorkspace{
		OrganizationID: w.acme.ID, Name: "Finance", Visibility: "secret", CreatorID: w.owner,
	})
	if err == nil || errors.Is(err, domain.ErrWorkspaceNameTaken) {
		t.Fatalf("err = %v, want a storage error", err)
	}
}

func TestRemovingOrganizationMembershipRemovesWorkspaceMemberships(t *testing.T) {
	w := newWorkspaceWorld(t)
	if _, err := pool.Exec(context.Background(), `DELETE FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		string(w.acme.ID), string(w.legalMember)); err != nil {
		t.Fatal(err)
	}
	if got := membershipRole(t, w.legal.ID, w.legalMember); got != "" {
		t.Errorf("role = %q, want the Workspace Membership gone", got)
	}
}

func TestRoleIn(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaces(pool)
	cases := map[string]struct {
		id    domain.OrganizationID
		scope application.Scope
		role  domain.Role
		err   error
	}{
		"Organization Owner": {w.acme.ID, application.Scope{UserID: w.owner}, domain.RoleOwner, nil},
		"Contributor":        {w.acme.ID, application.Scope{UserID: w.contributor}, domain.RoleContributor, nil},
		"Administrator":      {w.acme.ID, application.Scope{All: true}, domain.RoleOwner, nil},
		"outsider":           {w.acme.ID, application.Scope{UserID: w.outside}, "", domain.ErrUnknownOrganization},
		"unknown":            {"00000000-0000-0000-0000-000000000000", application.Scope{All: true}, "", domain.ErrUnknownOrganization},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			role, err := repo.RoleIn(context.Background(), tc.id, tc.scope)
			if role != tc.role || !errors.Is(err, tc.err) {
				t.Errorf("RoleIn = %q, %v; want %q, %v", role, err, tc.role, tc.err)
			}
		})
	}
	if _, err := repo.RoleIn(context.Background(), "not-a-uuid", application.Scope{All: true}); err == nil ||
		errors.Is(err, domain.ErrUnknownOrganization) {
		t.Errorf("err = %v, want a storage error", err)
	}
}

func TestFindWorkspaceHonoursVisibility(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaces(pool)
	cases := map[string]struct {
		scope application.Scope
		found bool
	}{
		"Organization Owner":   {application.Scope{UserID: w.owner}, true},
		"Administrator":        {application.Scope{All: true}, true},
		"Workspace Membership": {application.Scope{UserID: w.legalMember}, true},
		"Contributor":          {application.Scope{UserID: w.contributor}, false},
		"outsider":             {application.Scope{UserID: w.outside}, false},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			ws, err := repo.Find(context.Background(), w.legal.ID, tc.scope)
			if tc.found && (err != nil || ws.ID != w.legal.ID) {
				t.Fatalf("Find = %+v, %v", ws, err)
			}
			if !tc.found && !errors.Is(err, domain.ErrWorkspaceNotFound) {
				t.Fatalf("err = %v, want ErrWorkspaceNotFound", err)
			}
		})
	}
}

func TestFindWorkspaceReportsViewerRole(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaces(pool)
	finance, err := repo.Create(context.Background(), application.NewWorkspace{
		OrganizationID: w.acme.ID, Name: "Finance", Visibility: domain.VisibilityOpen, CreatorID: w.outside,
	})
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]struct {
		id    domain.WorkspaceID
		scope application.Scope
		want  domain.Role
	}{
		"Administrator":                 {w.legal.ID, application.Scope{All: true}, domain.WorkspaceRoleOwner},
		"Organization Owner":            {finance.ID, application.Scope{UserID: w.owner}, domain.WorkspaceRoleOwner},
		"Workspace Membership":          {w.legal.ID, application.Scope{UserID: w.legalMember}, domain.WorkspaceRoleViewer},
		"Open Workspace, no Membership": {finance.ID, application.Scope{UserID: w.contributor}, domain.WorkspaceRoleContributor},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			ws, err := repo.Find(context.Background(), tc.id, tc.scope)
			if err != nil || ws.ViewerRole != tc.want {
				t.Errorf("ViewerRole = %q, %v; want %q", ws.ViewerRole, err, tc.want)
			}
		})
	}
}

func TestUpdateWorkspace(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaces(pool)
	name, open := "Legal team", domain.VisibilityOpen
	ws, err := repo.Update(context.Background(), application.WorkspaceChange{ID: w.legal.ID, Name: &name, Visibility: &open})
	if err != nil {
		t.Fatal(err)
	}
	if ws.ID != w.legal.ID || ws.Name != name || ws.Visibility != open || !ws.UpdatedAt.After(w.legal.UpdatedAt) {
		t.Errorf("returned %+v", ws)
	}
}

func TestUpdateWorkspaceKeepsFieldsLeftOut(t *testing.T) {
	w := newWorkspaceWorld(t)
	open := domain.VisibilityOpen
	ws, err := NewWorkspaces(pool).Update(context.Background(), application.WorkspaceChange{ID: w.legal.ID, Visibility: &open})
	if err != nil || ws.Name != "Legal" || ws.Visibility != open {
		t.Fatalf("returned %+v, %v", ws, err)
	}
}

func TestUpdateWorkspaceRejections(t *testing.T) {
	w := newWorkspaceWorld(t)
	taken, secret := "DEFAULT", domain.Visibility("secret")
	cases := map[string]struct {
		change application.WorkspaceChange
		want   error
	}{
		"name in use": {application.WorkspaceChange{ID: w.legal.ID, Name: &taken}, domain.ErrWorkspaceNameTaken},
		"gone":        {application.WorkspaceChange{ID: "00000000-0000-0000-0000-000000000000", Name: &taken}, domain.ErrWorkspaceNotFound},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := NewWorkspaces(pool).Update(context.Background(), tc.change); !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
	_, err := NewWorkspaces(pool).Update(context.Background(), application.WorkspaceChange{ID: w.legal.ID, Visibility: &secret})
	if err == nil || errors.Is(err, domain.ErrWorkspaceNameTaken) {
		t.Errorf("err = %v, want a storage error", err)
	}
}

func TestListWorkspacesHonoursVisibilityAndPages(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaces(pool)
	cases := map[string]struct {
		scope application.Scope
		page  application.PageRequest
		want  []string
		total int
	}{
		"Owner sees all":     {application.Scope{UserID: w.owner}, application.PageRequest{Limit: 20}, []string{"Default", "Legal"}, 2},
		"Contributor, Open":  {application.Scope{UserID: w.contributor}, application.PageRequest{Limit: 20}, []string{"Default"}, 1},
		"Membership adds":    {application.Scope{UserID: w.legalMember}, application.PageRequest{Limit: 20}, []string{"Default", "Legal"}, 2},
		"outsider sees none": {application.Scope{UserID: w.outside}, application.PageRequest{Limit: 20}, nil, 0},
		"second page":        {application.Scope{All: true}, application.PageRequest{Limit: 1, Offset: 1}, []string{"Legal"}, 2},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			items, total, err := repo.List(context.Background(), w.acme.ID, tc.scope, tc.page)
			if err != nil || total != tc.total || len(items) != len(tc.want) {
				t.Fatalf("List = %+v, %d, %v; want %v, %d", items, total, err, tc.want, tc.total)
			}
			for i, ws := range items {
				if ws.Name != tc.want[i] {
					t.Errorf("item %d = %q, want %q", i, ws.Name, tc.want[i])
				}
			}
		})
	}
}

func TestListWorkspacesReportsStorageFailures(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaces(pool)
	if _, _, err := repo.List(context.Background(), w.acme.ID, application.Scope{All: true}, application.PageRequest{Limit: -1}); err == nil {
		t.Error("a negative LIMIT must fail")
	}
	if _, _, err := repo.List(context.Background(), "not-a-uuid", application.Scope{All: true}, application.PageRequest{Limit: 1}); err == nil {
		t.Error("an invalid Organization ID must fail")
	}
}
