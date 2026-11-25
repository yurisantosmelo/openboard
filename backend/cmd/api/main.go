// Command api runs the OpenBoard HTTP API.
package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/elyosemite/openboard/backend/internal/platform/config"
	"github.com/elyosemite/openboard/backend/internal/platform/database"
	"github.com/elyosemite/openboard/backend/internal/platform/logging"
	"github.com/elyosemite/openboard/backend/internal/platform/server"
)

func main() {
	if err := runMain(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runMain() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return run(ctx, os.Getenv, os.Stdout)
}

func run(ctx context.Context, getenv func(string) string, out io.Writer) error {
	cfg, err := config.Load(getenv)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	logger := logging.New(out, cfg.LogLevel)

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer pool.Close()

	identity, identitySvc, err := setupIdentity(ctx, logger, pool, cfg)
	if err != nil {
		return err
	}
	organizations := setupOrganizations(logger, pool, identity)
	memberships := setupOrganizationMemberships(logger, pool, identity, identitySvc)
	workspaces := setupWorkspaces(logger, pool, identity)
	workspaceMemberships := setupWorkspaceMemberships(logger, pool, identity)
	work := setupWork(logger, pool, identity)

	var lc net.ListenConfig
	ln, err := lc.Listen(ctx, "tcp", cfg.HTTPAddr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.HTTPAddr, err)
	}

	srv := &http.Server{
		Handler:           newRouter(logger, []module{identity, organizations, memberships, workspaces, workspaceMemberships, work}, database.Checker{Pool: pool}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	logger.InfoContext(ctx, "http server listening", "addr", ln.Addr().String())
	if err := server.Run(ctx, srv, ln, cfg.ShutdownTimeout); err != nil {
		return err
	}
	logger.InfoContext(ctx, "http server stopped")
	return nil
}
