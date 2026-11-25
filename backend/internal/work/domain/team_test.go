package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestTeamParsers(t *testing.T) {
	const uid = "11111111-1111-4111-8111-111111111111"
	if id, err := ParseTeamID(uid); err != nil || string(id) != uid {
		t.Fatalf("ParseTeamID valid: got (%q, %v)", id, err)
	}
	if _, err := ParseTeamID("bad"); !errors.Is(err, ErrTeamNotFound) {
		t.Fatalf("ParseTeamID invalid: got %v", err)
	}
	if id, err := ParseTeamRef(uid); err != nil || string(id) != uid {
		t.Fatalf("ParseTeamRef valid: got (%q, %v)", id, err)
	}
	if _, err := ParseTeamRef("bad"); !errors.Is(err, ErrInvalidTeamRef) {
		t.Fatalf("ParseTeamRef invalid: got %v", err)
	}
	if id, err := ParseTeamAssigneeID(uid); err != nil || string(id) != uid {
		t.Fatalf("ParseTeamAssigneeID valid: got (%q, %v)", id, err)
	}
	if _, err := ParseTeamAssigneeID("bad"); !errors.Is(err, ErrInvalidTeamAssignee) {
		t.Fatalf("ParseTeamAssigneeID invalid: got %v", err)
	}
}

func TestParseTeamName(t *testing.T) {
	if name, err := ParseTeamName("  Platform Core  "); err != nil || name != "Platform Core" {
		t.Fatalf("ParseTeamName valid: got (%q, %v)", name, err)
	}
	for _, bad := range []string{"", "   ", strings.Repeat("t", 101)} {
		if _, err := ParseTeamName(bad); !errors.Is(err, ErrInvalidTeamName) {
			t.Fatalf("ParseTeamName(%q): got %v", bad, err)
		}
	}
}
