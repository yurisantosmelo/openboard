package domain_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func TestParseWorkflowIDs(t *testing.T) {
	const raw = "  01960000-0000-7000-8000-000000000001 "
	const want = "01960000-0000-7000-8000-000000000001"

	if id, err := domain.ParseStatusID(raw); err != nil || string(id) != want {
		t.Fatalf("ParseStatusID = (%q, %v)", id, err)
	}
	if _, err := domain.ParseStatusID("bad"); !errors.Is(err, domain.ErrStatusNotFound) {
		t.Fatalf("ParseStatusID(bad) = %v", err)
	}
	if id, err := domain.ParseWorkItemTypeID(raw); err != nil || string(id) != want {
		t.Fatalf("ParseWorkItemTypeID = (%q, %v)", id, err)
	}
	if _, err := domain.ParseWorkItemTypeID("bad"); !errors.Is(err, domain.ErrWorkItemTypeNotFound) {
		t.Fatalf("ParseWorkItemTypeID(bad) = %v", err)
	}
}

func TestParseWorkflowNamesAndPosition(t *testing.T) {
	if name, err := domain.ParseStatusName("  In Review "); err != nil || name != "In Review" {
		t.Fatalf("ParseStatusName = (%q, %v)", name, err)
	}
	if _, err := domain.ParseStatusName("   "); !errors.Is(err, domain.ErrInvalidStatusName) {
		t.Fatalf("blank status name = %v", err)
	}
	if _, err := domain.ParseStatusName(strings.Repeat("a", 101)); !errors.Is(err, domain.ErrInvalidStatusName) {
		t.Fatalf("long status name = %v", err)
	}
	if name, err := domain.ParseWorkItemTypeName(" Spike "); err != nil || name != "Spike" {
		t.Fatalf("ParseWorkItemTypeName = (%q, %v)", name, err)
	}
	if _, err := domain.ParseWorkItemTypeName(""); !errors.Is(err, domain.ErrInvalidWorkItemTypeName) {
		t.Fatalf("blank type name = %v", err)
	}
}

func TestParseWorkflowEnums(t *testing.T) {
	for _, g := range []string{"not_committed", "PLANNED", "started", "completed"} {
		if _, err := domain.ParseStatusGroup(g); err != nil {
			t.Fatalf("ParseStatusGroup(%q) err = %v", g, err)
		}
	}
	if _, err := domain.ParseStatusGroup("archived"); !errors.Is(err, domain.ErrInvalidStatusGroup) {
		t.Fatalf("bad status group = %v", err)
	}
	for _, u := range []string{"story_points", "HOURS", "none"} {
		if _, err := domain.ParseEstimateUnit(u); err != nil {
			t.Fatalf("ParseEstimateUnit(%q) err = %v", u, err)
		}
	}
	if _, err := domain.ParseEstimateUnit("days"); !errors.Is(err, domain.ErrInvalidEstimateUnit) {
		t.Fatalf("bad estimate unit = %v", err)
	}
	if pos, err := domain.ParsePosition(0); err != nil || pos != 0 {
		t.Fatalf("ParsePosition(0) = (%d, %v)", pos, err)
	}
	if _, err := domain.ParsePosition(-1); !errors.Is(err, domain.ErrInvalidPosition) {
		t.Fatalf("ParsePosition(-1) = %v", err)
	}
}

func TestStatusGroupMinimumInvariant(t *testing.T) {
	statuses := []domain.Status{
		{ID: "s-backlog", Group: domain.StatusGroupNotCommitted},
		{ID: "s-doing", Group: domain.StatusGroupStarted},
		{ID: "s-done", Group: domain.StatusGroupCompleted},
	}

	if domain.CanChangeStatusGroup(statuses, "s-backlog", domain.StatusGroupPlanned) {
		t.Fatal("cannot change last not_committed status to planned")
	}
	if domain.CanChangeStatusGroup(statuses, "s-done", domain.StatusGroupStarted) {
		t.Fatal("cannot change last completed status to started")
	}
	if !domain.CanChangeStatusGroup(statuses, "s-doing", domain.StatusGroupPlanned) {
		t.Fatal("changing started status to planned must be allowed")
	}
	if domain.CanRemoveStatus(statuses, "s-backlog") || domain.CanRemoveStatus(statuses, "s-done") {
		t.Fatal("cannot remove sole not_committed or completed status")
	}
	if !domain.CanRemoveStatus(statuses, "s-doing") {
		t.Fatal("removing non-sole started status must be allowed")
	}

	withExtra := append(statuses, domain.Status{ID: "s-icebox", Group: domain.StatusGroupNotCommitted})
	if !domain.CanRemoveStatus(withExtra, "s-backlog") {
		t.Fatal("removing one of two not_committed statuses must be allowed")
	}
}

func TestIsTransitionAllowed(t *testing.T) {
	rules := []domain.TransitionRule{
		{FromStatusID: "s-backlog", ToStatusID: "s-todo"},
		{FromStatusID: "s-todo", ToStatusID: "s-doing"},
	}

	if !domain.IsTransitionAllowed(nil, "s-backlog", "s-done") {
		t.Fatal("no rules should allow any transition")
	}
	if !domain.IsTransitionAllowed(rules, "s-backlog", "s-backlog") {
		t.Fatal("same status transition must always be allowed")
	}
	if !domain.IsTransitionAllowed(rules, "s-backlog", "s-todo") {
		t.Fatal("listed target status must be allowed")
	}
	if domain.IsTransitionAllowed(rules, "s-backlog", "s-done") {
		t.Fatal("unlisted target status must be rejected when source has rules")
	}
	if !domain.IsTransitionAllowed(rules, "s-doing", "s-done") {
		t.Fatal("status without outgoing rules must move freely")
	}
}
