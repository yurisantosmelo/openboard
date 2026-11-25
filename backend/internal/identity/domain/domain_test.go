package domain

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestParseUsername(t *testing.T) {
	valid := map[string]Username{
		"gabriel":               "gabriel",
		"  Gabriel  ":           "gabriel",
		"ana.lima_01-x":         "ana.lima_01-x",
		"abc":                   "abc",
		strings.Repeat("a", 32): Username(strings.Repeat("a", 32)),
	}
	for raw, want := range valid {
		got, err := ParseUsername(raw)
		if err != nil || got != want {
			t.Errorf("ParseUsername(%q) = %q, %v; want %q", raw, got, err, want)
		}
	}
	for _, raw := range []string{"", "ab", strings.Repeat("a", 33), "ana lima", "ana@acme", "joão"} {
		if _, err := ParseUsername(raw); !errors.Is(err, ErrInvalidUsername) {
			t.Errorf("ParseUsername(%q) err = %v, want ErrInvalidUsername", raw, err)
		}
	}
	if Username("ana").String() != "ana" {
		t.Error("String() should return the raw value")
	}
}

func TestParseName(t *testing.T) {
	if got, err := ParseName("  Gabriel Souza "); err != nil || got != "Gabriel Souza" {
		t.Errorf("ParseName = %q, %v", got, err)
	}
	for _, raw := range []string{"", "   ", strings.Repeat("é", 256)} {
		if _, err := ParseName(raw); !errors.Is(err, ErrInvalidName) {
			t.Errorf("ParseName(%d runes) err = %v", len([]rune(raw)), err)
		}
	}
	if _, err := ParseName(strings.Repeat("é", 255)); err != nil {
		t.Errorf("255 runes should be accepted: %v", err)
	}
}

func TestValidateNewPassword(t *testing.T) {
	const username = Username("gabriel")
	ok := []string{strings.Repeat("a", 12), strings.Repeat("ç", 128), "correct horse battery"}
	for _, pw := range ok {
		if err := ValidateNewPassword(pw, "admin", username); err != nil {
			t.Errorf("%q rejected: %v", pw, err)
		}
	}
	bad := []struct {
		name, password, current string
		username                Username
	}{
		{"too short", "elevenchars", "admin", username},
		{"too long", strings.Repeat("a", 129), "admin", username},
		{"same as current", "the current password", "the current password", username},
		{"same as username, any case", "A-VERY-LONG-USERNAME", "admin", "a-very-long-username"},
	}
	for _, tc := range bad {
		if err := ValidateNewPassword(tc.password, tc.current, tc.username); !errors.Is(err, ErrWeakPassword) {
			t.Errorf("%s: err = %v, want ErrWeakPassword", tc.name, err)
		}
	}
}

func TestSessionExpiry(t *testing.T) {
	start := time.Date(2026, 11, 15, 12, 0, 0, 0, time.UTC)
	s := NewSession([]byte("id"), "u1", start)

	if s.ExpiresAt != start.Add(SessionLifetime) || !s.LastUsedAt.Equal(start) {
		t.Fatalf("unexpected session: %+v", s)
	}
	if s.IsExpired(start.Add(SessionIdleTimeout - time.Second)) {
		t.Error("session should still be valid just before the idle timeout")
	}
	if !s.IsExpired(start.Add(SessionIdleTimeout)) {
		t.Error("session should expire after sitting idle")
	}

	s.LastUsedAt = start.Add(SessionLifetime - time.Hour)
	if s.IsExpired(start.Add(SessionLifetime - time.Minute)) {
		t.Error("recently used session should be valid before its lifetime ends")
	}
	if !s.IsExpired(start.Add(SessionLifetime)) {
		t.Error("session must expire at its lifetime even when recently used")
	}
}

func TestParseUserID(t *testing.T) {
	const raw = "  550E8400-E29B-41D4-A716-446655440000  "
	got, err := ParseUserID(raw)
	if err != nil || got != "550e8400-e29b-41d4-a716-446655440000" {
		t.Fatalf("ParseUserID = %q, %v", got, err)
	}
	for _, bad := range []string{"", "not-a-uuid", "550e8400-e29b-41d4-a716-44665544000z"} {
		if _, err := ParseUserID(bad); !errors.Is(err, ErrUserNotFound) {
			t.Errorf("ParseUserID(%q) err = %v, want ErrUserNotFound", bad, err)
		}
	}
}

func TestUserIsDeactivated(t *testing.T) {
	u := User{ID: "u1"}
	if u.IsDeactivated() {
		t.Error("active user should not report IsDeactivated")
	}
	now := time.Now().UTC()
	u.DeactivatedAt = &now
	if !u.IsDeactivated() {
		t.Error("user with DeactivatedAt should report IsDeactivated")
	}
}
