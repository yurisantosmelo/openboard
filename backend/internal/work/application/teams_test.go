package application

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

type fakeTeamRepo struct {
	teams        map[domain.TeamID]domain.Team
	assignments  map[domain.TeamID][]domain.TeamAssignment
	projectTeams map[domain.ProjectID][]domain.TeamID
	seq          int
}

func newFakeTeamRepo() *fakeTeamRepo {
	return &fakeTeamRepo{
		teams:        make(map[domain.TeamID]domain.Team),
		assignments:  make(map[domain.TeamID][]domain.TeamAssignment),
		projectTeams: make(map[domain.ProjectID][]domain.TeamID),
	}
}

func (r *fakeTeamRepo) ListByWorkspace(_ context.Context, ws domain.WorkspaceID) ([]domain.Team, error) {
	out := make([]domain.Team, 0)
	for _, t := range r.teams {
		if t.WorkspaceID == ws {
			out = append(out, t)
		}
	}
	return out, nil
}

func (r *fakeTeamRepo) Find(_ context.Context, ws domain.WorkspaceID, id domain.TeamID) (domain.Team, error) {
	t, ok := r.teams[id]
	if !ok || t.WorkspaceID != ws {
		return domain.Team{}, domain.ErrTeamNotFound
	}
	return t, nil
}

func (r *fakeTeamRepo) Create(_ context.Context, ws domain.WorkspaceID, name string) (domain.Team, error) {
	for _, existing := range r.teams {
		if existing.WorkspaceID == ws && strings.EqualFold(existing.Name, name) {
			return domain.Team{}, domain.ErrTeamNameInUse
		}
	}
	r.seq++
	now := time.Now().UTC()
	team := domain.Team{
		ID:          domain.TeamID(fmt.Sprintf("bbbbbbbb-bbbb-4bbb-8bbb-%012d", r.seq)),
		WorkspaceID: ws,
		Name:        name,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	r.teams[team.ID] = team
	return team, nil
}

func (r *fakeTeamRepo) Rename(_ context.Context, ws domain.WorkspaceID, id domain.TeamID, name string) (domain.Team, error) {
	team, ok := r.teams[id]
	if !ok || team.WorkspaceID != ws {
		return domain.Team{}, domain.ErrTeamNotFound
	}
	team.Name = name
	r.teams[id] = team
	return team, nil
}

func (r *fakeTeamRepo) Delete(_ context.Context, ws domain.WorkspaceID, id domain.TeamID) error {
	team, ok := r.teams[id]
	if !ok || team.WorkspaceID != ws {
		return domain.ErrTeamNotFound
	}
	delete(r.teams, id)
	delete(r.assignments, id)
	return nil
}

func (r *fakeTeamRepo) ListAssignments(_ context.Context, teamID domain.TeamID) ([]domain.TeamAssignment, error) {
	return append([]domain.TeamAssignment(nil), r.assignments[teamID]...), nil
}

func (r *fakeTeamRepo) AddAssignment(_ context.Context, teamID domain.TeamID, userID domain.UserID) (domain.TeamAssignment, error) {
	for _, a := range r.assignments[teamID] {
		if a.UserID == userID {
			return domain.TeamAssignment{}, domain.ErrTeamAssignmentExists
		}
	}
	a := domain.TeamAssignment{TeamID: teamID, UserID: userID, Username: "dev", Name: "Dev", CreatedAt: time.Now().UTC()}
	r.assignments[teamID] = append(r.assignments[teamID], a)
	return a, nil
}

func (r *fakeTeamRepo) RemoveAssignment(_ context.Context, teamID domain.TeamID, userID domain.UserID) error {
	list := r.assignments[teamID]
	for i, a := range list {
		if a.UserID == userID {
			r.assignments[teamID] = append(list[:i], list[i+1:]...)
			return nil
		}
	}
	return domain.ErrTeamAssignmentNotFound
}

func (r *fakeTeamRepo) ListProjectTeams(_ context.Context, projectID domain.ProjectID) ([]domain.Team, error) {
	out := make([]domain.Team, 0)
	for _, tid := range r.projectTeams[projectID] {
		if t, ok := r.teams[tid]; ok {
			out = append(out, t)
		}
	}
	return out, nil
}

func (r *fakeTeamRepo) AddProjectTeam(_ context.Context, projectID domain.ProjectID, teamID domain.TeamID, _ domain.WorkspaceID) (domain.Team, error) {
	for _, tid := range r.projectTeams[projectID] {
		if tid == teamID {
			return domain.Team{}, domain.ErrProjectTeamExists
		}
	}
	r.projectTeams[projectID] = append(r.projectTeams[projectID], teamID)
	return r.teams[teamID], nil
}

func (r *fakeTeamRepo) RemoveProjectTeam(_ context.Context, projectID domain.ProjectID, teamID domain.TeamID) error {
	list := r.projectTeams[projectID]
	for i, tid := range list {
		if tid == teamID {
			r.projectTeams[projectID] = append(list[:i], list[i+1:]...)
			return nil
		}
	}
	return domain.ErrProjectTeamNotFound
}

type fakeMover struct {
	movedTo domain.WorkspaceID
	project domain.Project
}

func (m *fakeMover) Move(_ context.Context, _ domain.ProjectID, target domain.WorkspaceID) (domain.Project, error) {
	m.movedTo = target
	p := m.project
	p.WorkspaceID = target
	return p, nil
}

type multiWorkspaceAccess struct {
	byWS map[domain.WorkspaceID]domain.WorkspaceAccess
}

func (m multiWorkspaceAccess) Access(_ context.Context, _ domain.Actor, ws domain.WorkspaceID) (domain.WorkspaceAccess, error) {
	a, ok := m.byWS[ws]
	if !ok {
		return domain.WorkspaceAccess{}, domain.ErrWorkspaceNotFound
	}
	return a, nil
}

func TestTeamServiceCRUDAndAssignments(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, eligibility := newTestWorkItemHarness(domain.RoleOwner)
	wsID := ws.access.WorkspaceID
	repo := newFakeTeamRepo()
	svc := NewTeamService(projects, repo, ws, eligibility)

	team, err := svc.CreateTeam(ctx, ownerActor, string(wsID), "Core")
	if err != nil || team.Name != "Core" {
		t.Fatalf("CreateTeam: got (%+v, %v)", team, err)
	}
	if _, err := svc.RenameTeam(ctx, ownerActor, string(wsID), string(team.ID), "Platform"); err != nil {
		t.Fatalf("RenameTeam: %v", err)
	}
	const devID = "77777777-7777-4777-8777-777777777771"
	if _, err := svc.AddTeamAssignment(ctx, ownerActor, string(wsID), string(team.ID), devID); err != nil {
		t.Fatalf("AddTeamAssignment: %v", err)
	}
	// Losing Workspace access prunes the Team Assignment on list.
	eligibility.ok = false
	list, err := svc.ListTeamAssignments(ctx, ownerActor, string(wsID), string(team.ID))
	if err != nil || len(list) != 0 {
		t.Fatalf("expected pruned assignments, got (%+v, %v)", list, err)
	}
	// Non-owner cannot create Teams.
	ws.access.Role = domain.RoleContributor
	if _, err := svc.CreateTeam(ctx, contribActor, string(wsID), "Nope"); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for Contributor CreateTeam, got %v", err)
	}
}

func TestTeamServiceListRemoveAndDelete(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, eligibility := newTestWorkItemHarness(domain.RoleOwner)
	wsID := ws.access.WorkspaceID
	svc := NewTeamService(projects, newFakeTeamRepo(), ws, eligibility)

	team, err := svc.CreateTeam(ctx, ownerActor, string(wsID), "Ops")
	if err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}
	teamsList, err := svc.ListTeams(ctx, ownerActor, string(wsID))
	if err != nil || len(teamsList) != 1 {
		t.Fatalf("ListTeams: got (%d, %v)", len(teamsList), err)
	}
	const devID = "77777777-7777-4777-8777-777777777771"
	if _, err := svc.AddTeamAssignment(ctx, ownerActor, string(wsID), string(team.ID), devID); err != nil {
		t.Fatalf("AddTeamAssignment: %v", err)
	}
	if err := svc.RemoveTeamAssignment(ctx, ownerActor, string(wsID), string(team.ID), devID); err != nil {
		t.Fatalf("RemoveTeamAssignment: %v", err)
	}
	if err := svc.DeleteTeam(ctx, ownerActor, string(wsID), string(team.ID)); err != nil {
		t.Fatalf("DeleteTeam: %v", err)
	}
}

func TestTeamServiceProjectTeamsAndMoveProject(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, eligibility := newTestWorkItemHarness(domain.RoleOwner)
	wsID := ws.access.WorkspaceID
	orgID := ws.access.OrganizationID
	repo := newFakeTeamRepo()
	teamSvc := NewTeamService(projects, repo, ws, eligibility)

	team, err := teamSvc.CreateTeam(ctx, ownerActor, string(wsID), "Backend")
	if err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}
	if _, err := teamSvc.AddProjectTeam(ctx, ownerActor, string(projectUUID), string(team.ID)); err != nil {
		t.Fatalf("AddProjectTeam: %v", err)
	}
	pt, err := teamSvc.ListProjectTeams(ctx, ownerActor, string(projectUUID))
	if err != nil || len(pt) != 1 {
		t.Fatalf("ListProjectTeams: got (%d, %v)", len(pt), err)
	}
	if err := teamSvc.RemoveProjectTeam(ctx, ownerActor, string(projectUUID), string(team.ID)); err != nil {
		t.Fatalf("RemoveProjectTeam: %v", err)
	}

	ws2 := domain.WorkspaceID("22222222-2222-4222-8222-222222222229")
	otherOrgWS := domain.WorkspaceID("22222222-2222-4222-8222-222222222299")
	multi := multiWorkspaceAccess{byWS: map[domain.WorkspaceID]domain.WorkspaceAccess{
		wsID:       {WorkspaceID: wsID, OrganizationID: orgID, Role: domain.RoleOwner},
		ws2:        {WorkspaceID: ws2, OrganizationID: orgID, Role: domain.RoleOwner},
		otherOrgWS: {WorkspaceID: otherOrgWS, OrganizationID: "99999999-9999-4999-8999-999999999999", Role: domain.RoleOwner},
	}}
	mover := &fakeMover{project: domain.Project{ID: projectUUID, OrganizationID: orgID, WorkspaceID: wsID, Name: "Alpha"}}
	projSvc := NewService(projects, multi).WithProjectMover(mover)

	if _, err := projSvc.MoveProject(ctx, ownerActor, string(projectUUID), string(otherOrgWS)); !errors.Is(err, domain.ErrCrossOrganizationMove) {
		t.Fatalf("expected ErrCrossOrganizationMove, got %v", err)
	}
	moved, err := projSvc.MoveProject(ctx, ownerActor, string(projectUUID), string(ws2))
	if err != nil || moved.WorkspaceID != ws2 || mover.movedTo != ws2 {
		t.Fatalf("MoveProject: got (%+v, %v)", moved, err)
	}
}

func TestTeamServiceErrorPaths(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, eligibility := newTestWorkItemHarness(domain.RoleOwner)
	wsID := ws.access.WorkspaceID
	repo := newFakeTeamRepo()
	teamSvc := NewTeamService(projects, repo, ws, eligibility)

	team, err := teamSvc.CreateTeam(ctx, ownerActor, string(wsID), "Core")
	if err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}
	eligibility.ok = false
	const devID = "77777777-7777-4777-8777-777777777771"
	if _, err := teamSvc.AddTeamAssignment(ctx, ownerActor, string(wsID), string(team.ID), devID); !errors.Is(err, domain.ErrInvalidTeamAssignee) {
		t.Fatalf("expected ErrInvalidTeamAssignee, got %v", err)
	}
	if _, err := teamSvc.AddProjectTeam(ctx, ownerActor, string(projectUUID), "bbbbbbbb-bbbb-4bbb-8bbb-999999999999"); !errors.Is(err, domain.ErrInvalidTeamRef) {
		t.Fatalf("expected ErrInvalidTeamRef, got %v", err)
	}
	if err := teamSvc.RemoveProjectTeam(ctx, ownerActor, string(projectUUID), "bad-id"); !errors.Is(err, domain.ErrProjectTeamNotFound) {
		t.Fatalf("expected ErrProjectTeamNotFound, got %v", err)
	}
	ws.access.Role = domain.RoleContributor
	if _, err := teamSvc.AddProjectTeam(ctx, contribActor, string(projectUUID), string(team.ID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for Contributor AddProjectTeam, got %v", err)
	}
	if err := teamSvc.RemoveProjectTeam(ctx, contribActor, string(projectUUID), string(team.ID)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for Contributor RemoveProjectTeam, got %v", err)
	}
}

func TestMoveProjectEdgeCases(t *testing.T) {
	ctx := context.Background()
	_, projects, _, ws, _ := newTestWorkItemHarness(domain.RoleOwner)
	wsID := ws.access.WorkspaceID
	orgID := ws.access.OrganizationID
	wsContrib := domain.WorkspaceID("22222222-2222-4222-8222-222222222230")
	multi := multiWorkspaceAccess{byWS: map[domain.WorkspaceID]domain.WorkspaceAccess{
		wsID:      {WorkspaceID: wsID, OrganizationID: orgID, Role: domain.RoleOwner},
		wsContrib: {WorkspaceID: wsContrib, OrganizationID: orgID, Role: domain.RoleContributor},
	}}
	projSvc := NewService(projects, multi).WithProjectMover(&fakeMover{})

	if _, err := projSvc.MoveProject(ctx, ownerActor, string(projectUUID), "bad"); !errors.Is(err, domain.ErrInvalidWorkspaceRef) {
		t.Fatalf("expected ErrInvalidWorkspaceRef, got %v", err)
	}
	if _, err := projSvc.MoveProject(ctx, ownerActor, string(projectUUID), string(wsContrib)); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden on non-owner destination, got %v", err)
	}
	same, err := projSvc.MoveProject(ctx, ownerActor, string(projectUUID), string(wsID))
	if err != nil || same.WorkspaceID != wsID {
		t.Fatalf("expected same-workspace no-op, got (%+v, %v)", same, err)
	}
}
