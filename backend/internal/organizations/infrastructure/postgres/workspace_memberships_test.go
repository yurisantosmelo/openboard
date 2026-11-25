package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

func TestCreateAndListWorkspaceMemberships(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaceMemberships(pool)
	ctx := context.Background()

	added, err := repo.Create(ctx, application.NewWorkspaceMembership{
		WorkspaceID: w.legal.ID, OrganizationID: w.acme.ID, Username: "julia", Role: domain.WorkspaceRoleContributor,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if added.WorkspaceID != w.legal.ID || added.OrganizationID != w.acme.ID || added.UserID != w.contributor {
		t.Fatalf("unexpected ids: %+v", added)
	}
	if added.Username != "julia" || added.Role != domain.WorkspaceRoleContributor || added.CreatedAt.IsZero() {
		t.Fatalf("unexpected fields: %+v", added)
	}

	assertWorkspaceMembershipPage(t, repo, w.legal.ID, application.PageRequest{Limit: 2, Offset: 0}, 3, []string{"julia", "marina"})
	assertWorkspaceMembershipPage(t, repo, w.legal.ID, application.PageRequest{Limit: 2, Offset: 2}, 3, []string{"pedro"})
}

func assertWorkspaceMembershipPage(t *testing.T, repo *WorkspaceMemberships, wsID domain.WorkspaceID, page application.PageRequest, wantTotal int, wantUsers []string) {
	t.Helper()
	items, total, err := repo.List(context.Background(), wsID, page)
	if err != nil || total != wantTotal || len(items) != len(wantUsers) {
		t.Fatalf("List = %+v, %d, %v; want %v, %d", items, total, err, wantUsers, wantTotal)
	}
	for i, want := range wantUsers {
		if items[i].Username != want {
			t.Errorf("item %d = %q, want %q", i, items[i].Username, want)
		}
	}
}

func TestCreateWorkspaceMembershipErrors(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaceMemberships(pool)
	ctx := context.Background()

	cases := map[string]struct {
		in   application.NewWorkspaceMembership
		want error
	}{
		"outsider not in org": {application.NewWorkspaceMembership{WorkspaceID: w.legal.ID, OrganizationID: w.acme.ID, Username: "rui", Role: domain.WorkspaceRoleViewer}, domain.ErrOrganizationMemberNotFound},
		"unknown username":    {application.NewWorkspaceMembership{WorkspaceID: w.legal.ID, OrganizationID: w.acme.ID, Username: "nobody", Role: domain.WorkspaceRoleViewer}, domain.ErrOrganizationMemberNotFound},
		"already added":       {application.NewWorkspaceMembership{WorkspaceID: w.legal.ID, OrganizationID: w.acme.ID, Username: "pedro", Role: domain.WorkspaceRoleContributor}, domain.ErrWorkspaceMembershipExists},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := repo.Create(ctx, tc.in); !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
	if _, err := repo.Create(ctx, application.NewWorkspaceMembership{WorkspaceID: w.legal.ID, OrganizationID: "not-a-uuid", Username: "julia", Role: domain.WorkspaceRoleViewer}); err == nil {
		t.Error("invalid org id must fail")
	}
	if _, err := repo.Create(ctx, application.NewWorkspaceMembership{WorkspaceID: w.legal.ID, OrganizationID: w.acme.ID, Username: "julia", Role: "admin"}); err == nil {
		t.Error("invalid role must fail")
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET deactivated_at = NOW() WHERE id = $1`, string(w.contributor)); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Create(ctx, application.NewWorkspaceMembership{
		WorkspaceID: w.legal.ID, OrganizationID: w.acme.ID, Username: "julia", Role: domain.WorkspaceRoleViewer,
	}); !errors.Is(err, domain.ErrUserDeactivated) {
		t.Errorf("deactivated user err = %v, want ErrUserDeactivated", err)
	}
}

func TestUpdateWorkspaceMembershipRole(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaceMemberships(pool)
	ctx := context.Background()

	ws, err := repo.FindWorkspace(ctx, w.legal.ID, application.Scope{UserID: w.owner})
	if err != nil || ws.ID != w.legal.ID {
		t.Fatalf("FindWorkspace = %+v, %v", ws, err)
	}
	updated, err := repo.UpdateRole(ctx, w.legal.ID, w.legalMember, domain.WorkspaceRoleOwner)
	if err != nil || updated.Role != domain.WorkspaceRoleOwner || updated.Username != "pedro" {
		t.Fatalf("UpdateRole = %+v, %v", updated, err)
	}
	if _, err := repo.UpdateRole(ctx, w.legal.ID, w.contributor, domain.WorkspaceRoleViewer); !errors.Is(err, domain.ErrWorkspaceMembershipNotFound) {
		t.Errorf("absent UpdateRole err = %v, want ErrWorkspaceMembershipNotFound", err)
	}
	if _, err := repo.UpdateRole(ctx, w.legal.ID, w.legalMember, "admin"); err == nil {
		t.Error("invalid role must fail")
	}
}

func TestDeleteWorkspaceMembershipAndListErrors(t *testing.T) {
	w := newWorkspaceWorld(t)
	repo := NewWorkspaceMemberships(pool)
	ctx := context.Background()

	if err := repo.Delete(ctx, w.legal.ID, w.legalMember); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := repo.Delete(ctx, w.legal.ID, w.legalMember); !errors.Is(err, domain.ErrWorkspaceMembershipNotFound) {
		t.Errorf("second Delete err = %v, want ErrWorkspaceMembershipNotFound", err)
	}
	if err := repo.Delete(ctx, "not-a-uuid", w.legalMember); err == nil {
		t.Error("invalid workspace id must fail")
	}
	if _, _, err := repo.List(ctx, w.legal.ID, application.PageRequest{Limit: -1}); err == nil {
		t.Error("negative LIMIT must fail")
	}
	if _, _, err := repo.List(ctx, "not-a-uuid", application.PageRequest{Limit: 1}); err == nil {
		t.Error("invalid workspace id must fail")
	}
}
