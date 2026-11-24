package domain

import (
	"errors"
	"testing"
)

func TestParseUsername(t *testing.T) {
	got, err := ParseUsername("  Ana.Silva-1_2  ")
	if err != nil || got != "ana.silva-1_2" {
		t.Fatalf("ParseUsername = %q, %v; want ana.silva-1_2", got, err)
	}
	for _, bad := range []string{"", "ab", "with space", "bad@name", "a23456789012345678901234567890123"} {
		if _, err := ParseUsername(bad); !errors.Is(err, ErrInvalidUsername) {
			t.Errorf("ParseUsername(%q) err = %v, want ErrInvalidUsername", bad, err)
		}
	}
}

func TestParseOrganizationRole(t *testing.T) {
	cases := map[string]struct {
		raw  string
		want Role
		err  error
	}{
		"default contributor": {"", RoleContributor, nil},
		"contributor":         {"contributor", RoleContributor, nil},
		"owner":               {"owner", RoleOwner, nil},
		"viewer invalid":      {"viewer", "", ErrInvalidRole},
		"unknown":             {"admin", "", ErrInvalidRole},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := ParseOrganizationRole(tc.raw)
			if got != tc.want || !errors.Is(err, tc.err) {
				t.Errorf("ParseOrganizationRole(%q) = %q, %v; want %q, %v", tc.raw, got, err, tc.want, tc.err)
			}
		})
	}
}

func TestCanManageOrganization(t *testing.T) {
	if !RoleOwner.CanManageOrganization() {
		t.Error("Organization Owner must be able to manage the Organization")
	}
	if RoleContributor.CanManageOrganization() {
		t.Error("Organization Contributor must not manage the Organization")
	}
}

func TestParseMemberUserID(t *testing.T) {
	id, err := ParseMemberUserID("  0B5E3C1A-9F2D-4E6B-8A7C-1D2E3F4A5B6C ")
	if err != nil || id != "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c" {
		t.Fatalf("ParseMemberUserID = %q, %v", id, err)
	}
	if _, err := ParseMemberUserID("not-a-uuid"); !errors.Is(err, ErrMembershipNotFound) {
		t.Errorf("err = %v, want ErrMembershipNotFound", err)
	}
}

func TestParseOrganizationRoleChange(t *testing.T) {
	for _, valid := range []Role{RoleOwner, RoleContributor} {
		got, err := ParseOrganizationRoleChange(string(valid))
		if err != nil || got != valid {
			t.Errorf("ParseOrganizationRoleChange(%q) = %q, %v", valid, got, err)
		}
	}
	for _, bad := range []string{"", "viewer", "admin"} {
		if _, err := ParseOrganizationRoleChange(bad); !errors.Is(err, ErrInvalidRole) {
			t.Errorf("ParseOrganizationRoleChange(%q) err = %v, want ErrInvalidRole", bad, err)
		}
	}
}
