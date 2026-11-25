package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func seedSecondWorkspace(t *testing.T, orgID domain.OrganizationID, name string) domain.WorkspaceID {
	t.Helper()
	var id string
	err := pool.QueryRow(context.Background(), `
		INSERT INTO workspaces (organization_id, name, visibility)
		VALUES ($1, $2, 'open')
		RETURNING id::text`, string(orgID), name).Scan(&id)
	if err != nil {
		t.Fatalf("seed second workspace: %v", err)
	}
	return domain.WorkspaceID(id)
}

func TestTeamsAndAssignmentsCRUD(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	repo := NewTeams(pool)

	wsID := s.project.WorkspaceID
	team, err := repo.Create(ctx, wsID, "Core")
	if err != nil || team.Name != "Core" {
		t.Fatalf("Create team: got (%+v, %v)", team, err)
	}
	if _, err := repo.Create(ctx, wsID, "core"); !errors.Is(err, domain.ErrTeamNameInUse) {
		t.Fatalf("expected ErrTeamNameInUse, got %v", err)
	}
	renamed, err := repo.Rename(ctx, wsID, team.ID, "Platform")
	if err != nil || renamed.Name != "Platform" {
		t.Fatalf("Rename team: got (%+v, %v)", renamed, err)
	}
	a, err := repo.AddAssignment(ctx, team.ID, s.userID)
	if err != nil || a.UserID != s.userID {
		t.Fatalf("AddAssignment: got (%+v, %v)", a, err)
	}
	if _, err := repo.AddAssignment(ctx, team.ID, s.userID); !errors.Is(err, domain.ErrTeamAssignmentExists) {
		t.Fatalf("expected ErrTeamAssignmentExists, got %v", err)
	}
	if err := repo.RemoveAssignment(ctx, team.ID, s.userID); err != nil {
		t.Fatalf("RemoveAssignment: %v", err)
	}
}

func TestTeamsListFindAndRemoveProjectTeam(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	wsID := s.project.WorkspaceID
	repo := NewTeams(pool)

	team := mustCreateTeam(t, repo, wsID, "Data")
	listed, err := repo.ListByWorkspace(ctx, wsID)
	if err != nil || len(listed) != 1 {
		t.Fatalf("ListByWorkspace: got (%d, %v)", len(listed), err)
	}
	if _, err := repo.Find(ctx, wsID, team.ID); err != nil {
		t.Fatalf("Find team: %v", err)
	}
	if _, err := repo.AddAssignment(ctx, team.ID, s.userID); err != nil {
		t.Fatalf("AddAssignment: %v", err)
	}
	assignments, err := repo.ListAssignments(ctx, team.ID)
	if err != nil || len(assignments) != 1 {
		t.Fatalf("ListAssignments: got (%d, %v)", len(assignments), err)
	}
	if _, err := repo.AddProjectTeam(ctx, s.project.ID, team.ID, wsID); err != nil {
		t.Fatalf("AddProjectTeam: %v", err)
	}
	if err := repo.RemoveProjectTeam(ctx, s.project.ID, team.ID); err != nil {
		t.Fatalf("RemoveProjectTeam: %v", err)
	}
}

func mustCreateTeam(t *testing.T, repo *Teams, wsID domain.WorkspaceID, name string) domain.Team {
	t.Helper()
	team, err := repo.Create(context.Background(), wsID, name)
	if err != nil {
		t.Fatalf("CreateTeam(%q): %v", name, err)
	}
	return team
}

func TestProjectTeamsDeleteTeamAndMoveProject(t *testing.T) {
	ctx := context.Background()
	s := seedWorkProject(t)
	teams := NewTeams(pool)
	projects := NewProjects(pool)

	wsID := s.project.WorkspaceID
	teamA := mustCreateTeam(t, teams, wsID, "Squad A")
	teamB := mustCreateTeam(t, teams, wsID, "Squad B")
	if _, err := teams.AddProjectTeam(ctx, s.project.ID, teamA.ID, wsID); err != nil {
		t.Fatalf("AddProjectTeam A: %v", err)
	}
	if _, err := teams.AddProjectTeam(ctx, s.project.ID, teamB.ID, wsID); err != nil {
		t.Fatalf("AddProjectTeam B: %v", err)
	}
	// Deleting a Team removes its Project Team without deleting the Project.
	if err := teams.Delete(ctx, wsID, teamA.ID); err != nil {
		t.Fatalf("Delete teamA: %v", err)
	}
	if _, err := projects.Find(ctx, s.project.ID); err != nil {
		t.Fatalf("Project must survive Team deletion: %v", err)
	}

	// Moving Project to another Workspace in the same Organization clears Project Teams.
	ws2 := seedSecondWorkspace(t, s.orgID, "Target Workspace")
	moved, err := projects.Move(ctx, s.project.ID, ws2)
	if err != nil || moved.WorkspaceID != ws2 {
		t.Fatalf("Move project: got (%+v, %v)", moved, err)
	}
	remaining, err := teams.ListProjectTeams(ctx, s.project.ID)
	if err != nil || len(remaining) != 0 {
		t.Fatalf("expected Project Teams cleared on move, got (%+v, %v)", remaining, err)
	}
}
