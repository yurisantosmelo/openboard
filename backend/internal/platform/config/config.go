// Package config loads the API configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"time"
)

const (
	defaultHTTPAddr            = ":8080"
	defaultShutdownTimeout     = 10 * time.Second
	defaultDeletionGracePeriod = 30 * 24 * time.Hour
)

// Config is the runtime configuration of the API process.
type Config struct {
	HTTPAddr            string
	LogLevel            slog.Level
	ShutdownTimeout     time.Duration
	DeletionGracePeriod time.Duration
	DatabaseURL         string
	// AdminUsername and AdminPassword optionally seed the first Administrator.
	AdminUsername string
	AdminPassword string
}

// ErrMissingDatabaseURL reports that OPENBOARD_DATABASE_URL is not set.
var ErrMissingDatabaseURL = errors.New("OPENBOARD_DATABASE_URL is required")

// Load reads the configuration using getenv (usually os.Getenv), applying
// defaults for unset variables and rejecting invalid values.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		HTTPAddr:            defaultHTTPAddr,
		LogLevel:            slog.LevelInfo,
		ShutdownTimeout:     defaultShutdownTimeout,
		DeletionGracePeriod: defaultDeletionGracePeriod,
		DatabaseURL:         getenv("OPENBOARD_DATABASE_URL"),
		AdminUsername:       getenv("OPENBOARD_ADMIN_USERNAME"),
		AdminPassword:       getenv("OPENBOARD_ADMIN_PASSWORD"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, ErrMissingDatabaseURL
	}

	if raw := getenv("OPENBOARD_HTTP_ADDR"); raw != "" {
		cfg.HTTPAddr = raw
	}

	if raw := getenv("OPENBOARD_LOG_LEVEL"); raw != "" {
		if err := cfg.LogLevel.UnmarshalText([]byte(raw)); err != nil {
			return Config{}, fmt.Errorf("OPENBOARD_LOG_LEVEL: %w", err)
		}
	}

	if raw := getenv("OPENBOARD_SHUTDOWN_TIMEOUT"); raw != "" {
		timeout, err := parsePositiveDuration(raw)
		if err != nil {
			return Config{}, fmt.Errorf("OPENBOARD_SHUTDOWN_TIMEOUT: %w", err)
		}
		cfg.ShutdownTimeout = timeout
	}

	if raw := getenv("OPENBOARD_DELETION_GRACE_PERIOD"); raw != "" {
		grace, err := parsePositiveDuration(raw)
		if err != nil {
			return Config{}, fmt.Errorf("OPENBOARD_DELETION_GRACE_PERIOD: %w", err)
		}
		cfg.DeletionGracePeriod = grace
	}

	return cfg, nil
}

func parsePositiveDuration(raw string) (time.Duration, error) {
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, err
	}
	if d <= 0 {
		return 0, fmt.Errorf("duration must be positive, got %q", raw)
	}
	return d, nil
}
