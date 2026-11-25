package domain_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func TestLinkParsingAndNormalization(t *testing.T) {
	const raw = "  01960000-0000-7000-8000-000000000001 "
	if id, err := domain.ParseLinkID(raw); err != nil || id == "" {
		t.Fatalf("ParseLinkID = (%q, %v)", id, err)
	}
	if _, err := domain.ParseLinkID("bad"); !errors.Is(err, domain.ErrLinkNotFound) {
		t.Fatalf("ParseLinkID(bad) = %v", err)
	}
	if _, err := domain.ParseLinkTargetRef("bad"); !errors.Is(err, domain.ErrInvalidLinkTarget) {
		t.Fatalf("ParseLinkTargetRef(bad) = %v", err)
	}
	for _, k := range []string{"blocks", "DUPLICATES", " relates_to "} {
		if _, err := domain.ParseLinkKind(k); err != nil {
			t.Fatalf("ParseLinkKind(%q) = %v", k, err)
		}
	}
	if _, err := domain.ParseLinkKind("depends_on"); !errors.Is(err, domain.ErrInvalidLinkKind) {
		t.Fatalf("ParseLinkKind(bad) = %v", err)
	}
}

func TestNormalizeLinkPair(t *testing.T) {
	const a = domain.WorkItemID("00000000-0000-0000-0000-000000000001")
	const b = domain.WorkItemID("00000000-0000-0000-0000-000000000002")

	if _, _, err := domain.NormalizeLinkPair(a, a, domain.LinkKindBlocks); !errors.Is(err, domain.ErrSelfLink) {
		t.Fatalf("self link err = %v", err)
	}
	s, tgt, err := domain.NormalizeLinkPair(b, a, domain.LinkKindBlocks)
	if err != nil || s != b || tgt != a {
		t.Fatalf("directional blocks = (%q, %q, %v)", s, tgt, err)
	}
	s, tgt, err = domain.NormalizeLinkPair(b, a, domain.LinkKindRelatesTo)
	if err != nil || s != a || tgt != b {
		t.Fatalf("symmetric relates_to = (%q, %q, %v), want (%q, %q)", s, tgt, err, a, b)
	}
}

func TestEraParsing(t *testing.T) {
	const raw = "  01960000-0000-7000-8000-000000000001 "
	if id, err := domain.ParseEraID(raw); err != nil || id == "" {
		t.Fatalf("ParseEraID = (%q, %v)", id, err)
	}
	if _, err := domain.ParseEraID("bad"); !errors.Is(err, domain.ErrEraNotFound) {
		t.Fatalf("ParseEraID(bad) = %v", err)
	}
	if _, err := domain.ParseEraRef("bad"); !errors.Is(err, domain.ErrInvalidEra) {
		t.Fatalf("ParseEraRef(bad) = %v", err)
	}
	if _, err := domain.ParseNextEraRef("bad"); !errors.Is(err, domain.ErrInvalidNextEra) {
		t.Fatalf("ParseNextEraRef(bad) = %v", err)
	}
	if name, err := domain.ParseEraName("  Era 1  "); err != nil || name != "Era 1" {
		t.Fatalf("ParseEraName = (%q, %v)", name, err)
	}
	if _, err := domain.ParseEraName(strings.Repeat("x", 101)); !errors.Is(err, domain.ErrInvalidEraName) {
		t.Fatalf("long era name = %v", err)
	}
}

func TestEraDates(t *testing.T) {
	start, end, err := domain.ParseEraDates("2026-11-01", "2026-11-14")
	if err != nil || start.Day() != 1 || end.Day() != 14 {
		t.Fatalf("ParseEraDates = (%v, %v, %v)", start, end, err)
	}
	if _, _, err := domain.ParseEraDates("2026-11-15", "2026-11-14"); !errors.Is(err, domain.ErrInvalidEraDates) {
		t.Fatalf("reversed dates err = %v", err)
	}
	if _, _, err := domain.ParseEraDates("bad", "2026-11-14"); !errors.Is(err, domain.ErrInvalidEraDates) {
		t.Fatalf("bad dates err = %v", err)
	}
}

func TestEraOverlapAndActive(t *testing.T) {
	existing := []domain.Era{
		{
			ID:        "e1",
			StartDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC),
			EndDate:   time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC),
			State:     domain.EraStateActive,
		},
	}
	if !domain.HasActiveEra(existing) || domain.HasActiveEra(nil) {
		t.Fatal("HasActiveEra mismatch")
	}
	if !domain.HasOverlappingEra(existing, "", time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC), time.Date(2026, 11, 28, 0, 0, 0, 0, time.UTC)) {
		t.Fatal("touching boundary date must count as overlap")
	}
	if domain.HasOverlappingEra(existing, "e1", time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC)) {
		t.Fatal("excluded era must not overlap itself")
	}
	if domain.HasOverlappingEra(existing, "", time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC), time.Date(2026, 11, 28, 0, 0, 0, 0, time.UTC)) {
		t.Fatal("disjoint dates must not overlap")
	}
}
