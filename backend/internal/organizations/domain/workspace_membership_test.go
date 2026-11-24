package domain

import (
	"errors"
	"testing"
)

func TestParseWorkspaceMemberUserID(t *testing.T) {
	id, err := ParseWorkspaceMemberUserID("  0B5E3C1A-9F2D-4E6B-8A7C-1D2E3F4A5B6C ")
	if err != nil || id != "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c" {
		t.Fatalf("ParseWorkspaceMemberUserID = %q, %v", id, err)
	}
	if _, err := ParseWorkspaceMemberUserID("not-a-uuid"); !errors.Is(err, ErrWorkspaceMembershipNotFound) {
		t.Errorf("err = %v, want ErrWorkspaceMembershipNotFound", err)
	}
}

func TestParseWorkspaceRole(t *testing.T) {
	cases := map[string]struct {
		raw  string
		want Role
		err  error
	}{
		"default contributor": {"", WorkspaceRoleContributor, nil},
		"owner":               {"owner", WorkspaceRoleOwner, nil},
		"contributor":         {"contributor", WorkspaceRoleContributor, nil},
		"viewer":              {"viewer", WorkspaceRoleViewer, nil},
		"unknown":             {"admin", "", ErrInvalidWorkspaceRole},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got, err := ParseWorkspaceRole(tc.raw)
			if got != tc.want || !errors.Is(err, tc.err) {
				t.Errorf("ParseWorkspaceRole(%q) = %q, %v; want %q, %v", tc.raw, got, err, tc.want, tc.err)
			}
		})
	}
}

func TestParseWorkspaceRoleChange(t *testing.T) {
	for _, valid := range []Role{WorkspaceRoleOwner, WorkspaceRoleContributor, WorkspaceRoleViewer} {
		got, err := ParseWorkspaceRoleChange(string(valid))
		if err != nil || got != valid {
			t.Errorf("ParseWorkspaceRoleChange(%q) = %q, %v", valid, got, err)
		}
	}
	for _, bad := range []string{"", "admin"} {
		if _, err := ParseWorkspaceRoleChange(bad); !errors.Is(err, ErrInvalidWorkspaceRole) {
			t.Errorf("ParseWorkspaceRoleChange(%q) err = %v, want ErrInvalidWorkspaceRole", bad, err)
		}
	}
}
