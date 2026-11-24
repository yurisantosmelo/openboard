package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/identity/application"
	identityhttp "github.com/elyosemite/openboard/backend/internal/identity/http"
	"github.com/elyosemite/openboard/backend/internal/identity/infrastructure/passwordhash"
	"github.com/elyosemite/openboard/backend/internal/identity/infrastructure/postgres"
	"github.com/elyosemite/openboard/backend/internal/identity/infrastructure/throttle"
	"github.com/elyosemite/openboard/backend/internal/platform/config"
)

// Sign-in throttling: block a Username for signInLockout after
// signInMaxFailures consecutive failures.
const (
	signInMaxFailures = 5
	signInLockout     = 5 * time.Minute
)

// setupIdentity wires the identity module, creates the first Administrator
// when the Instance has no Users yet and returns its HTTP handler and service.
func setupIdentity(ctx context.Context, logger *slog.Logger, pool *pgxpool.Pool, cfg config.Config) (*identityhttp.Handler, *application.Service, error) {
	svc, err := application.NewService(application.Deps{
		Users:    postgres.NewUsers(pool),
		Sessions: postgres.NewSessions(pool),
		Hasher:   passwordhash.New(passwordhash.OWASPParams),
		Throttle: throttle.NewMemory(signInMaxFailures, signInLockout, time.Now),
	})
	if err != nil {
		return nil, nil, fmt.Errorf("build identity service: %w", err)
	}

	seed := application.AdministratorSeed{Username: cfg.AdminUsername, Password: cfg.AdminPassword}
	created, err := svc.EnsureAdministrator(ctx, seed)
	if err != nil {
		return nil, nil, fmt.Errorf("create first administrator: %w", err)
	}
	if created {
		logFirstAdministrator(ctx, logger, seed)
	}
	return identityhttp.NewHandler(svc, logger, signInLockout), svc, nil
}

func logFirstAdministrator(ctx context.Context, logger *slog.Logger, seed application.AdministratorSeed) {
	if seed.Username == "" {
		logger.WarnContext(ctx, "first Administrator created as admin/admin: sign in and change the password now")
		return
	}
	logger.InfoContext(ctx, "first Administrator created", "username", seed.Username)
}
