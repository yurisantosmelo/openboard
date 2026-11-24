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
