package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/organizations/application"
	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

func TestCreateOrganizationMembership(t *testing.T) {
	marina := createUser(t, "marina")
	julia := addUser(t, "julia")
	acme := seed(t, marina, "Acme")["Acme"]

	added, err := NewMemberships(pool).Create(context.Background(), application.NewOrganizationMembership{
		OrganizationID: acme.ID, UserID: julia, Role: domain.RoleContributor,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if added.OrganizationID != acme.ID || added.UserID != julia || added.Role != domain.RoleContributor {
		t.Fatalf("unexpected ids/role: %+v", added)
	}
	if added.Username != "julia" || added.Name != "julia" || added.CreatedAt.IsZero() {
		t.Fatalf("unexpected user fields: %+v", added)
	}
}

func TestListOrganizationMembershipsPagesByName(t *testing.T) {
	marina := createUser(t, "marina")
	julia := addUser(t, "julia")
	pedro := addUser(t, "pedro")
	acme := seed(t, marina, "Acme")["Acme"]
	repo := NewMemberships(pool)
	ctx := context.Background()

	for _, m := range []application.NewOrganizationMembership{
		{OrganizationID: acme.ID, UserID: julia, Role: domain.RoleContributor},
		{OrganizationID: acme.ID, UserID: pedro, Role: domain.RoleOwner},
	} {
		if _, err := repo.Create(ctx, m); err != nil {
			t.Fatalf("Create %s: %v", m.UserID, err)
		}
	}

	assertMembershipPage(t, repo, acme.ID, application.PageRequest{Limit: 2, Offset: 0}, 3, []string{"julia", "marina"})
	assertMembershipPage(t, repo, acme.ID, application.PageRequest{Limit: 2, Offset: 2}, 3, []string{"pedro"})
}

func assertMembershipPage(t *testing.T, repo *Memberships, orgID domain.OrganizationID, page application.PageRequest, wantTotal int, wantUsers []string) {
	t.Helper()
	items, total, err := repo.List(context.Background(), orgID, page)
	if err != nil || total != wantTotal || len(items) != len(wantUsers) {
		t.Fatalf("List = %+v, %d, %v; want %v, %d", items, total, err, wantUsers, wantTotal)
	}
	for i, want := range wantUsers {
		if items[i].Username != want {
			t.Errorf("item %d = %q, want %q", i, items[i].Username, want)
		}
	}
}

func TestCreateOrganizationMembershipErrors(t *testing.T) {
	marina := createUser(t, "marina")
	acme := seed(t, marina, "Acme")["Acme"]
	repo := NewMemberships(pool)
	ctx := context.Background()

	_, err := repo.Create(ctx, application.NewOrganizationMembership{
		OrganizationID: acme.ID, UserID: marina, Role: domain.RoleContributor,
	})
	if !errors.Is(err, domain.ErrMembershipExists) {
		t.Errorf("duplicate err = %v, want ErrMembershipExists", err)
	}

	_, err = repo.Create(ctx, application.NewOrganizationMembership{
		OrganizationID: acme.ID, UserID: "00000000-0000-0000-0000-000000000000", Role: domain.RoleContributor,
	})
	if err == nil || errors.Is(err, domain.ErrMembershipExists) {
		t.Errorf("unknown user err = %v, want a storage error", err)
	}
}

func TestMembershipsRoleInAndListFailures(t *testing.T) {
	marina := createUser(t, "marina")
	outsider := addUser(t, "outsider")
	acme := seed(t, marina, "Acme")["Acme"]
	repo := NewMemberships(pool)
	ctx := context.Background()

	role, err := repo.RoleIn(ctx, acme.ID, application.Scope{UserID: marina})
	if err != nil || role != domain.RoleOwner {
		t.Errorf("owner RoleIn = %q, %v", role, err)
	}
	if _, err := repo.RoleIn(ctx, acme.ID, application.Scope{UserID: outsider}); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("outsider RoleIn = %v, want ErrNotFound", err)
	}
	if _, _, err := repo.List(ctx, acme.ID, application.PageRequest{Limit: -1}); err == nil {
		t.Error("negative LIMIT must fail")
	}
	if _, _, err := repo.List(ctx, "not-a-uuid", application.PageRequest{Limit: 1}); err == nil {
		t.Error("invalid Organization ID must fail")
	}
}
