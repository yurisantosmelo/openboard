package domain_test

import (
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func TestRoleCanWriteWorkItems(t *testing.T) {
	if !domain.RoleOwner.CanWriteWorkItems() {
		t.Fatal("RoleOwner should write work items")
	}
	if !domain.RoleContributor.CanWriteWorkItems() {
		t.Fatal("RoleContributor should write work items")
	}
	if domain.RoleViewer.CanWriteWorkItems() {
		t.Fatal("RoleViewer must not write work items")
	}
}

func TestParseWorkItemReferences(t *testing.T) {
	const raw = "  01960000-0000-7000-8000-000000000001 "
	const want = "01960000-0000-7000-8000-000000000001"

	cases := []struct {
		name    string
		parse   func(string) (string, error)
		wantErr error
	}{
		{"work item id", func(s string) (string, error) { id, e := domain.ParseWorkItemID(s); return string(id), e }, domain.ErrWorkItemNotFound},
		{"work item type", func(s string) (string, error) { id, e := domain.ParseWorkItemTypeRef(s); return string(id), e }, domain.ErrInvalidWorkItemType},
		{"status", func(s string) (string, error) { id, e := domain.ParseStatusRef(s); return string(id), e }, domain.ErrInvalidStatus},
		{"parent", func(s string) (string, error) { id, e := domain.ParseParentRef(s); return string(id), e }, domain.ErrInvalidParent},
		{"assignee", func(s string) (string, error) { id, e := domain.ParseAssigneeRef(s); return string(id), e }, domain.ErrInvalidAssignee},
	}
	for _, tc := range cases {
		if id, err := tc.parse(raw); err != nil || id != want {
			t.Fatalf("%s valid = (%q, %v), want %q", tc.name, id, err, want)
		}
		if _, err := tc.parse("bad"); !errors.Is(err, tc.wantErr) {
			t.Fatalf("%s bad err = %v, want %v", tc.name, err, tc.wantErr)
		}
	}
}

func TestParseWorkItemTitle(t *testing.T) {
	got, err := domain.ParseWorkItemTitle("  Fix login timeout  ")
	if err != nil || got != "Fix login timeout" {
		t.Fatalf("ParseWorkItemTitle = (%q, %v)", got, err)
	}
	if _, err := domain.ParseWorkItemTitle("   "); !errors.Is(err, domain.ErrInvalidTitle) {
		t.Fatalf("blank title err = %v, want ErrInvalidTitle", err)
	}
	if _, err := domain.ParseWorkItemTitle(strings.Repeat("a", 256)); !errors.Is(err, domain.ErrInvalidTitle) {
		t.Fatalf("oversized title err = %v, want ErrInvalidTitle", err)
	}
}

func TestParsePriority(t *testing.T) {
	cases := map[string]domain.Priority{
		"urgent": domain.PriorityUrgent,
		" HIGH ": domain.PriorityHigh,
		"medium": domain.PriorityMedium,
		"low":    domain.PriorityLow,
		"none":   domain.PriorityNone,
	}
	for input, want := range cases {
		got, err := domain.ParsePriority(input)
		if err != nil || got != want {
			t.Fatalf("ParsePriority(%q) = (%q, %v), want %q", input, got, err, want)
		}
	}
	if _, err := domain.ParsePriority("critical"); !errors.Is(err, domain.ErrInvalidPriority) {
		t.Fatalf("invalid priority err = %v, want ErrInvalidPriority", err)
	}
	if got, err := domain.ParseOptionalPriority("  "); err != nil || got != domain.PriorityNone {
		t.Fatalf("ParseOptionalPriority(blank) = (%q, %v), want none", got, err)
	}
	if got, err := domain.ParseOptionalPriority("high"); err != nil || got != domain.PriorityHigh {
		t.Fatalf("ParseOptionalPriority(high) = (%q, %v), want high", got, err)
	}
}

func TestValidateEstimate(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	cases := []struct {
		name string
		unit domain.EstimateUnit
		sp   *float64
		hrs  *float64
		ok   bool
	}{
		{"story points valid", domain.EstimateUnitStoryPoints, f(5), nil, true},
		{"story points zero", domain.EstimateUnitStoryPoints, f(0), nil, true},
		{"story points nil", domain.EstimateUnitStoryPoints, nil, nil, true},
		{"story points negative", domain.EstimateUnitStoryPoints, f(-1), nil, false},
		{"story points too big", domain.EstimateUnitStoryPoints, f(1000000), nil, false},
		{"story points NaN", domain.EstimateUnitStoryPoints, f(math.NaN()), nil, false},
		{"story points Inf", domain.EstimateUnitStoryPoints, f(math.Inf(1)), nil, false},
		{"story points with hours", domain.EstimateUnitStoryPoints, nil, f(2), false},
		{"hours valid", domain.EstimateUnitHours, nil, f(3.5), true},
		{"hours with story points", domain.EstimateUnitHours, f(2), nil, false},
		{"none empty", domain.EstimateUnitNone, nil, nil, true},
		{"none with story points", domain.EstimateUnitNone, f(1), nil, false},
		{"none with hours", domain.EstimateUnitNone, nil, f(1), false},
		{"unknown unit", domain.EstimateUnit("days"), nil, nil, false},
	}
	for _, tc := range cases {
		err := domain.ValidateEstimate(tc.unit, tc.sp, tc.hrs)
		if tc.ok && err != nil {
			t.Fatalf("%s: unexpected err %v", tc.name, err)
		}
		if !tc.ok && !errors.Is(err, domain.ErrInvalidEstimate) {
			t.Fatalf("%s: err = %v, want ErrInvalidEstimate", tc.name, err)
		}
	}
}

func TestAllowsChildTypeAndDefaultInitialStatus(t *testing.T) {
	wt := domain.WorkItemType{
		ID:                  "type-story",
		AllowedChildTypeIDs: []domain.WorkItemTypeID{"type-task", "type-bug"},
	}
	if !wt.AllowsChildType("type-task") || wt.AllowsChildType("type-epic") {
		t.Fatal("AllowsChildType mismatch")
	}

	if _, ok := domain.DefaultInitialStatus(nil); ok {
		t.Fatal("empty statuses should return ok=false")
	}
	s, ok := domain.DefaultInitialStatus([]domain.Status{
		{ID: "s1", Group: domain.StatusGroupPlanned},
		{ID: "s2", Group: domain.StatusGroupNotCommitted},
	})
	if !ok || s.ID != "s2" {
		t.Fatalf("DefaultInitialStatus = (%+v, %v), want s2", s, ok)
	}
	s, ok = domain.DefaultInitialStatus([]domain.Status{
		{ID: "s1", Group: domain.StatusGroupPlanned},
	})
	if !ok || s.ID != "s1" {
		t.Fatalf("DefaultInitialStatus fallback = (%+v, %v), want s1", s, ok)
	}
}
