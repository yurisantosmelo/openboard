package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestViewIDAndNameParsers(t *testing.T) {
	const rawID = "11111111-1111-4111-8111-111111111111"
	if id, err := ParseViewID(rawID); err != nil || string(id) != rawID {
		t.Fatalf("ParseViewID valid: got (%q, %v)", id, err)
	}
	if _, err := ParseViewID("bad"); !errors.Is(err, ErrViewNotFound) {
		t.Fatalf("ParseViewID invalid: got %v", err)
	}
	if name, err := ParseViewName("  My Board  "); err != nil || name != "My Board" {
		t.Fatalf("ParseViewName valid: got (%q, %v)", name, err)
	}
	for _, bad := range []string{"", "   ", strings.Repeat("a", 101)} {
		if _, err := ParseViewName(bad); !errors.Is(err, ErrInvalidViewName) {
			t.Fatalf("ParseViewName(%q) expected ErrInvalidViewName, got %v", bad, err)
		}
	}
}

func TestViewLayoutAndVisibilityParsers(t *testing.T) {
	for _, layout := range []string{"board", "LIST", "table", "timeline", "calendar"} {
		if _, err := ParseViewLayout(layout); err != nil {
			t.Fatalf("ParseViewLayout(%q) unexpected err: %v", layout, err)
		}
	}
	if _, err := ParseViewLayout("gantt"); !errors.Is(err, ErrInvalidViewLayout) {
		t.Fatalf("ParseViewLayout invalid: got %v", err)
	}
	for _, vis := range []string{"personal", "SHARED"} {
		if _, err := ParseViewVisibility(vis); err != nil {
			t.Fatalf("ParseViewVisibility(%q) unexpected err: %v", vis, err)
		}
	}
	if _, err := ParseViewVisibility("public"); !errors.Is(err, ErrInvalidViewVisibility) {
		t.Fatalf("ParseViewVisibility invalid: got %v", err)
	}
}

func TestParseViewFilters(t *testing.T) {
	const uid = "22222222-2222-4222-8222-222222222222"
	got, err := ParseViewFilters(ViewFilters{
		StatusID:       uid,
		WorkItemTypeID: uid,
		Priority:       "HIGH",
		AssigneeID:     uid,
		EraID:          uid,
	})
	if err != nil {
		t.Fatalf("ParseViewFilters valid: %v", err)
	}
	if got.Priority != "high" || got.StatusID != uid || got.EraID != uid {
		t.Fatalf("unexpected normalized filters: %+v", got)
	}
	if _, err := ParseViewFilters(ViewFilters{StatusID: "not-a-uuid"}); !errors.Is(err, ErrInvalidViewFilters) {
		t.Fatalf("expected ErrInvalidViewFilters for bad status_id, got %v", err)
	}
	if _, err := ParseViewFilters(ViewFilters{Priority: "critical"}); !errors.Is(err, ErrInvalidViewFilters) {
		t.Fatalf("expected ErrInvalidViewFilters for bad priority, got %v", err)
	}
}

func TestViewAccessRules(t *testing.T) {
	creator := Actor{UserID: "u-creator"}
	other := Actor{UserID: "u-other"}
	personal := View{Visibility: ViewVisibilityPersonal, CreatedBy: creator.UserID}
	shared := View{Visibility: ViewVisibilityShared, CreatedBy: creator.UserID}

	editCases := []struct {
		name  string
		view  View
		actor Actor
		role  Role
		want  bool
	}{
		{"personal creator contributor", personal, creator, RoleContributor, true},
		{"personal other owner", personal, other, RoleOwner, false},
		{"personal viewer", personal, creator, RoleViewer, false},
		{"shared creator contributor", shared, creator, RoleContributor, true},
		{"shared other owner", shared, other, RoleOwner, true},
		{"shared other contributor", shared, other, RoleContributor, false},
		{"shared viewer", shared, creator, RoleViewer, false},
	}
	for _, tc := range editCases {
		if got := CanEditView(tc.view, tc.actor, tc.role); got != tc.want {
			t.Fatalf("CanEditView(%s) = %v, want %v", tc.name, got, tc.want)
		}
	}
	if !CanSeeView(personal, creator) || CanSeeView(personal, other) || !CanSeeView(shared, other) {
		t.Fatal("CanSeeView mismatch")
	}
	if !CanSetViewVisibility(personal, creator, ViewVisibilityShared) ||
		CanSetViewVisibility(shared, other, ViewVisibilityPersonal) ||
		!CanSetViewVisibility(shared, other, ViewVisibilityShared) {
		t.Fatal("CanSetViewVisibility mismatch")
	}
}
