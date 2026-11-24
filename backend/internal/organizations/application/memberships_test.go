package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

var marinaActor = domain.Actor{UserID: marinaID}

type fakeMembershipRepo struct {
	role        domain.Role
	roleErr     error
	createErr   error
	listErr     error
	roleScope   Scope
	created     NewOrganizationMembership
	returned    domain.OrganizationMembership
	items       []domain.OrganizationMembership
	total       int
	listPage    PageRequest
	listOrgID   domain.OrganizationID
	createCalls int
}

func (f *fakeMembershipRepo) RoleIn(_ context.Context, _ domain.OrganizationID, scope Scope) (domain.Role, error) {
	f.roleScope = scope
	return f.role, f.roleErr
}

func (f *fakeMembershipRepo) Create(_ context.Context, m NewOrganizationMembership) (domain.OrganizationMembership, error) {
	f.createCalls++
	f.created = m
	if f.createErr != nil {
		return domain.OrganizationMembership{}, f.createErr
	}
	return f.returned, nil
}

func (f *fakeMembershipRepo) List(_ context.Context, id domain.OrganizationID, page PageRequest) ([]domain.OrganizationMembership, int, error) {
	f.listOrgID, f.listPage = id, page
	return f.items, f.total, f.listErr
}

type fakeProvisioner struct {
	user     ProvisionedUser
	err      error
	calls    int
	username string
	name     string
}

func (f *fakeProvisioner) ProvisionUser(_ context.Context, username, name string) (ProvisionedUser, error) {
	f.calls++
	f.username, f.name = username, name
	return f.user, f.err
}

func TestAddMembershipCreatesNewUserAndLinks(t *testing.T) {
	const orgID = "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	repo := &fakeMembershipRepo{
		role: domain.RoleOwner,
		returned: domain.OrganizationMembership{
			OrganizationID: orgID, UserID: "u-ana", Username: "ana", Name: "Ana Silva", Role: domain.RoleContributor,
		},
	}
	users := &fakeProvisioner{user: ProvisionedUser{
		ID: "u-ana", Username: "ana", Name: "Ana Silva", TemporaryPassword: "generated-temp-password",
	}}
	svc := NewMembershipService(repo, users)

	res, err := svc.AddMembership(context.Background(), marinaActor, AddOrganizationMembershipInput{
		OrganizationID: orgID, Username: "  ANA  ", Name: "  Ana Silva  ",
	})
	if err != nil {
		t.Fatalf("AddMembership: %v", err)
	}
	if users.username != "ana" || users.name != "Ana Silva" {
		t.Errorf("ProvisionUser called with %q, %q", users.username, users.name)
	}
	want := NewOrganizationMembership{OrganizationID: orgID, UserID: "u-ana", Role: domain.RoleContributor}
	if repo.created != want {
		t.Errorf("created %+v, want %+v", repo.created, want)
	}
	if res.Membership != repo.returned || res.TemporaryPassword != "generated-temp-password" {
		t.Errorf("returned %+v", res)
	}
}

func TestAddMembershipWithOwnerRoleAndExistingUser(t *testing.T) {
	const orgID = "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	repo := &fakeMembershipRepo{
		role:     domain.RoleOwner,
		returned: domain.OrganizationMembership{OrganizationID: orgID, UserID: "u-ana", Username: "ana", Name: "Ana", Role: domain.RoleOwner},
	}
	users := &fakeProvisioner{user: ProvisionedUser{ID: "u-ana", Username: "ana", Name: "Ana"}}
	svc := NewMembershipService(repo, users)

	res, err := svc.AddMembership(context.Background(), administrator, AddOrganizationMembershipInput{
		OrganizationID: orgID, Username: "ana", Name: "Ignored", Role: "owner",
	})
	if err != nil {
		t.Fatalf("AddMembership: %v", err)
	}
	if !repo.roleScope.All || repo.created.Role != domain.RoleOwner || res.TemporaryPassword != "" {
		t.Errorf("scope %+v, created %+v, temp %q", repo.roleScope, repo.created, res.TemporaryPassword)
	}
}

func TestAddMembershipRejections(t *testing.T) {
	const orgID = "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	storeDown := errors.New("store down")

	cases := map[string]struct {
		in      AddOrganizationMembershipInput
		role    domain.Role
		roleErr error
		provErr error
		saveErr error
		want    []error
	}{
		"invalid org id": {
			in: AddOrganizationMembershipInput{OrganizationID: "acme", Username: "ana", Name: "Ana"}, want: []error{domain.ErrNotFound},
		},
		"all fields invalid": {
			in:   AddOrganizationMembershipInput{OrganizationID: orgID, Username: "x", Name: " ", Role: "viewer"},
			want: []error{domain.ErrInvalidUsername, domain.ErrInvalidName, domain.ErrInvalidRole},
		},
		"unseen org": {
			in: AddOrganizationMembershipInput{OrganizationID: orgID, Username: "ana", Name: "Ana"}, roleErr: domain.ErrNotFound,
			want: []error{domain.ErrNotFound},
		},
		"contributor forbidden": {
			in: AddOrganizationMembershipInput{OrganizationID: orgID, Username: "ana", Name: "Ana"}, role: domain.RoleContributor,
			want: []error{domain.ErrForbidden},
		},
		"provision fails": {
			in: AddOrganizationMembershipInput{OrganizationID: orgID, Username: "ana", Name: "Ana"}, role: domain.RoleOwner, provErr: storeDown,
			want: []error{storeDown},
		},
		"already member": {
			in: AddOrganizationMembershipInput{OrganizationID: orgID, Username: "ana", Name: "Ana"}, role: domain.RoleOwner, saveErr: domain.ErrMembershipExists,
			want: []error{domain.ErrMembershipExists},
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeMembershipRepo{role: tc.role, roleErr: tc.roleErr, createErr: tc.saveErr}
			users := &fakeProvisioner{user: ProvisionedUser{ID: "u-ana"}, err: tc.provErr}
			_, err := NewMembershipService(repo, users).AddMembership(context.Background(), marinaActor, tc.in)
			for _, want := range tc.want {
				if !errors.Is(err, want) {
					t.Errorf("err = %v, want %v", err, want)
				}
			}
			if tc.provErr == nil && tc.saveErr == nil && users.calls != 0 {
				t.Errorf("ProvisionUser called %d times before authorization succeeded", users.calls)
			}
		})
	}
}

func TestListMemberships(t *testing.T) {
	const orgID = "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	item := domain.OrganizationMembership{OrganizationID: orgID, UserID: "u1", Username: "ana", Name: "Ana", Role: domain.RoleOwner}
	repo := &fakeMembershipRepo{role: domain.RoleOwner, items: []domain.OrganizationMembership{item}, total: 1}
	svc := NewMembershipService(repo, &fakeProvisioner{})

	page := PageRequest{Limit: 10, Offset: 20}
	items, total, err := svc.ListMemberships(context.Background(), marinaActor, orgID, page)
	if err != nil || total != 1 || len(items) != 1 || items[0] != item || repo.listOrgID != orgID || repo.listPage != page {
		t.Fatalf("ListMemberships = %+v, %d, %v", items, total, err)
	}
}

func TestListMembershipsRejections(t *testing.T) {
	const orgID = "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	cases := map[string]struct {
		id      string
		role    domain.Role
		roleErr error
		want    error
	}{
		"invalid org id":        {"acme", domain.RoleOwner, nil, domain.ErrNotFound},
		"unseen org":            {orgID, "", domain.ErrNotFound, domain.ErrNotFound},
		"contributor forbidden": {orgID, domain.RoleContributor, nil, domain.ErrForbidden},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeMembershipRepo{role: tc.role, roleErr: tc.roleErr}
			if _, _, err := NewMembershipService(repo, &fakeProvisioner{}).ListMemberships(context.Background(), marinaActor, tc.id, PageRequest{Limit: 20}); !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}
