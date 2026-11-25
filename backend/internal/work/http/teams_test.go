package workhttp

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

type stubTeamService struct {
	team       domain.Team
	assignment domain.TeamAssignment
	err        error
}

func (s *stubTeamService) ListTeams(context.Context, domain.Actor, string) ([]domain.Team, error) {
	return []domain.Team{s.team}, s.err
}
func (s *stubTeamService) CreateTeam(context.Context, domain.Actor, string, string) (domain.Team, error) {
	return s.team, s.err
}
func (s *stubTeamService) RenameTeam(context.Context, domain.Actor, string, string, string) (domain.Team, error) {
	return s.team, s.err
}
func (s *stubTeamService) DeleteTeam(context.Context, domain.Actor, string, string) error {
	return s.err
}
func (s *stubTeamService) ListTeamAssignments(context.Context, domain.Actor, string, string) ([]domain.TeamAssignment, error) {
	return []domain.TeamAssignment{s.assignment}, s.err
}
func (s *stubTeamService) AddTeamAssignment(context.Context, domain.Actor, string, string, string) (domain.TeamAssignment, error) {
	return s.assignment, s.err
}
func (s *stubTeamService) RemoveTeamAssignment(context.Context, domain.Actor, string, string, string) error {
	return s.err
}
func (s *stubTeamService) ListProjectTeams(context.Context, domain.Actor, string) ([]domain.Team, error) {
	return []domain.Team{s.team}, s.err
}
func (s *stubTeamService) AddProjectTeam(context.Context, domain.Actor, string, string) (domain.Team, error) {
	return s.team, s.err
}
func (s *stubTeamService) RemoveProjectTeam(context.Context, domain.Actor, string, string) error {
	return s.err
}

func TestTeamHandlerAndMoveEndpoints(t *testing.T) {
	svc := &stubTeamService{
		team:       domain.Team{ID: "t1", WorkspaceID: "w1", Name: "Core", CreatedAt: t0, UpdatedAt: t0},
		assignment: domain.TeamAssignment{TeamID: "t1", UserID: "u1", Username: "ada", Name: "Ada", CreatedAt: t0},
	}
	projSvc := &fakeService{project: sample}
	mux := http.NewServeMux()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	NewTeamHandler(svc, fakeAuth(false), logger).Register(mux)
	NewHandler(projSvc, fakeAuth(false), logger).Register(mux)

	cases := []struct {
		method, path, body string
		want               int
	}{
		{http.MethodGet, "/api/v1/workspaces/w1/teams", "", http.StatusOK},
		{http.MethodPost, "/api/v1/workspaces/w1/teams", `{"name":"Core"}`, http.StatusCreated},
		{http.MethodPatch, "/api/v1/workspaces/w1/teams/t1", `{"name":"Platform"}`, http.StatusOK},
		{http.MethodDelete, "/api/v1/workspaces/w1/teams/t1", "", http.StatusNoContent},
		{http.MethodGet, "/api/v1/workspaces/w1/teams/t1/assignments", "", http.StatusOK},
		{http.MethodPost, "/api/v1/workspaces/w1/teams/t1/assignments", `{"user_id":"u1"}`, http.StatusCreated},
		{http.MethodDelete, "/api/v1/workspaces/w1/teams/t1/assignments/u1", "", http.StatusNoContent},
		{http.MethodGet, "/api/v1/projects/p1/teams", "", http.StatusOK},
		{http.MethodPost, "/api/v1/projects/p1/teams", `{"team_id":"t1"}`, http.StatusCreated},
		{http.MethodDelete, "/api/v1/projects/p1/teams/t1", "", http.StatusNoContent},
		{http.MethodPost, "/api/v1/projects/p1/move", `{"workspace_id":"w2"}`, http.StatusOK},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		if tc.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Fatalf("%s %s: got %d want %d body=%s", tc.method, tc.path, rec.Code, tc.want, rec.Body.String())
		}
	}
}

func TestTeamHandlerErrorMappings(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cases := []struct {
		err  error
		want int
	}{
		{domain.ErrTeamNameInUse, http.StatusConflict},
		{domain.ErrTeamAssignmentExists, http.StatusConflict},
		{domain.ErrProjectTeamExists, http.StatusConflict},
		{domain.ErrInvalidTeamName, http.StatusUnprocessableEntity},
		{domain.ErrInvalidTeamRef, http.StatusUnprocessableEntity},
		{domain.ErrInvalidTeamAssignee, http.StatusUnprocessableEntity},
		{domain.ErrCrossOrganizationMove, http.StatusUnprocessableEntity},
		{domain.ErrTeamNotFound, http.StatusNotFound},
	}
	for _, tc := range cases {
		mux := http.NewServeMux()
		NewTeamHandler(&stubTeamService{err: tc.err}, fakeAuth(false), logger).Register(mux)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/w1/teams", strings.NewReader(`{"name":"x"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Fatalf("err %v: got %d want %d", tc.err, rec.Code, tc.want)
		}
	}
}
