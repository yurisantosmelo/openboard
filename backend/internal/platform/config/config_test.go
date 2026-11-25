package config

import (
	"errors"
	"log/slog"
	"testing"
	"time"
)

const testDatabaseURL = "postgres://u:p@localhost:5432/openboard"

// env returns a getenv with a database URL set unless values overrides it.
func env(values map[string]string) func(string) string {
	return func(key string) string {
		if v, ok := values[key]; ok {
			return v
		}
		if key == "OPENBOARD_DATABASE_URL" {
			return testDatabaseURL
		}
		return ""
	}
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(env(nil))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.HTTPAddr != ":8080" {
		t.Errorf("HTTPAddr = %q, want :8080", cfg.HTTPAddr)
	}
	if cfg.LogLevel != slog.LevelInfo {
		t.Errorf("LogLevel = %v, want INFO", cfg.LogLevel)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Errorf("ShutdownTimeout = %v, want 10s", cfg.ShutdownTimeout)
	}
	if cfg.DeletionGracePeriod != 30*24*time.Hour {
		t.Errorf("DeletionGracePeriod = %v, want 720h", cfg.DeletionGracePeriod)
	}
	if cfg.DatabaseURL != testDatabaseURL || cfg.AdminUsername != "" || cfg.AdminPassword != "" {
		t.Errorf("unexpected database/admin config: %+v", cfg)
	}
}

func TestLoadOverrides(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"OPENBOARD_HTTP_ADDR":             "127.0.0.1:9090",
		"OPENBOARD_LOG_LEVEL":             "debug",
		"OPENBOARD_SHUTDOWN_TIMEOUT":      "3s",
		"OPENBOARD_DELETION_GRACE_PERIOD": "48h",
		"OPENBOARD_ADMIN_USERNAME":        "root",
		"OPENBOARD_ADMIN_PASSWORD":        "a long and fine passphrase",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.HTTPAddr != "127.0.0.1:9090" {
		t.Errorf("HTTPAddr = %q", cfg.HTTPAddr)
	}
	if cfg.LogLevel != slog.LevelDebug {
		t.Errorf("LogLevel = %v, want DEBUG", cfg.LogLevel)
	}
	if cfg.ShutdownTimeout != 3*time.Second {
		t.Errorf("ShutdownTimeout = %v, want 3s", cfg.ShutdownTimeout)
	}
	if cfg.DeletionGracePeriod != 48*time.Hour {
		t.Errorf("DeletionGracePeriod = %v, want 48h", cfg.DeletionGracePeriod)
	}
	if cfg.AdminUsername != "root" || cfg.AdminPassword != "a long and fine passphrase" {
		t.Errorf("admin seed not read: %+v", cfg)
	}
}

func TestLoadRequiresDatabaseURL(t *testing.T) {
	if _, err := Load(env(map[string]string{"OPENBOARD_DATABASE_URL": ""})); !errors.Is(err, ErrMissingDatabaseURL) {
		t.Fatalf("err = %v, want ErrMissingDatabaseURL", err)
	}
}

func TestLoadRejectsInvalidValues(t *testing.T) {
	cases := map[string]map[string]string{
		"log level":          {"OPENBOARD_LOG_LEVEL": "loud"},
		"timeout not parsed": {"OPENBOARD_SHUTDOWN_TIMEOUT": "soon"},
		"timeout zero":       {"OPENBOARD_SHUTDOWN_TIMEOUT": "0s"},
		"timeout negative":   {"OPENBOARD_SHUTDOWN_TIMEOUT": "-1s"},
		"grace invalid":      {"OPENBOARD_DELETION_GRACE_PERIOD": "never"},
		"grace zero":         {"OPENBOARD_DELETION_GRACE_PERIOD": "0s"},
	}
	for name, values := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Load(env(values)); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}
