package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestParseProjectIDAndWorkspaceID(t *testing.T) {
	const raw = "  550E8400-E29B-41D4-A716-446655440000  "
	const want = "550e8400-e29b-41d4-a716-446655440000"

	if got, err := ParseProjectID(raw); err != nil || string(got) != want {
		t.Fatalf("ParseProjectID = %q, %v", got, err)
	}
	if _, err := ParseProjectID("not-a-uuid"); !errors.Is(err, ErrNotFound) {
		t.Errorf("ParseProjectID bad err = %v, want ErrNotFound", err)
	}

	if got, err := ParseWorkspaceRef(raw); err != nil || string(got) != want {
		t.Fatalf("ParseWorkspaceRef = %q, %v", got, err)
	}
	if _, err := ParseWorkspaceRef("not-a-uuid"); !errors.Is(err, ErrInvalidWorkspaceRef) {
		t.Errorf("ParseWorkspaceRef bad err = %v, want ErrInvalidWorkspaceRef", err)
	}
}

func TestParseProjectName(t *testing.T) {
	if got, err := ParseProjectName("  Core Platform  "); err != nil || got != "Core Platform" {
		t.Fatalf("ParseProjectName = %q, %v", got, err)
	}
	for _, bad := range []string{"", "   ", strings.Repeat("é", 256)} {
		if _, err := ParseProjectName(bad); !errors.Is(err, ErrInvalidName) {
			t.Errorf("ParseProjectName(%d runes) err = %v, want ErrInvalidName", len([]rune(bad)), err)
		}
	}
	if _, err := ParseProjectName(strings.Repeat("é", 255)); err != nil {
		t.Errorf("255 runes should be accepted: %v", err)
	}
}

func TestRoleCanManageProject(t *testing.T) {
	if !RoleOwner.CanManageProject() {
		t.Error("Workspace Owner must be able to manage Projects")
	}
	for _, r := range []Role{RoleContributor, RoleViewer, ""} {
		if r.CanManageProject() {
			t.Errorf("role %q must not manage Projects", r)
		}
	}
}

func TestDefaultStatusesMatchGlossary(t *testing.T) {
	statuses := DefaultStatuses()
	if len(statuses) != 4 {
		t.Fatalf("DefaultStatuses len = %d, want 4", len(statuses))
	}
	wantGroups := []StatusGroup{StatusGroupNotCommitted, StatusGroupPlanned, StatusGroupStarted, StatusGroupCompleted}
	for i, s := range statuses {
		if s.Group != wantGroups[i] || s.Position != i {
			t.Errorf("status[%d] = %+v, want group %s pos %d", i, s, wantGroups[i], i)
		}
	}
}

func TestDefaultWorkItemTypesAndHierarchyMatchGlossary(t *testing.T) {
	types := DefaultWorkItemTypes()
	if len(types) != 6 {
		t.Fatalf("DefaultWorkItemTypes len = %d, want 6", len(types))
	}
	byName := map[string]EstimateUnit{}
	for _, wt := range types {
		byName[wt.Name] = wt.EstimateUnit
	}
	wantUnits := map[string]EstimateUnit{
		"Epic":       EstimateUnitNone,
		"Feature":    EstimateUnitNone,
		"User Story": EstimateUnitStoryPoints,
		"Task":       EstimateUnitHours,
		"Bug":        EstimateUnitStoryPoints,
		"Subtask":    EstimateUnitHours,
	}
	for name, unit := range wantUnits {
		if byName[name] != unit {
			t.Errorf("%s estimate unit = %q, want %q", name, byName[name], unit)
		}
	}
	hierarchy := DefaultHierarchy()
	if len(hierarchy) != 6 {
		t.Fatalf("DefaultHierarchy len = %d, want 6", len(hierarchy))
	}
	for _, rule := range hierarchy {
		if _, ok := byName[rule.ParentName]; !ok {
			t.Errorf("unknown parent %q", rule.ParentName)
		}
		if _, ok := byName[rule.ChildName]; !ok {
			t.Errorf("unknown child %q", rule.ChildName)
		}
	}
}
