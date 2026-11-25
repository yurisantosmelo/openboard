package application

import (
	"context"
	"errors"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// TeamRepository stores Teams, Team Assignments and Project Teams in PostgreSQL.
type TeamRepository interface {
	ListByWorkspace(ctx context.Context, workspaceID domain.WorkspaceID) ([]domain.Team, error)
	Find(ctx context.Context, workspaceID domain.WorkspaceID, id domain.TeamID) (domain.Team, error)
	Create(ctx context.Context, workspaceID domain.WorkspaceID, name string) (domain.Team, error)
	Rename(ctx context.Context, workspaceID domain.WorkspaceID, id domain.TeamID, name string) (domain.Team, error)
	Delete(ctx context.Context, workspaceID domain.WorkspaceID, id domain.TeamID) error

	ListAssignments(ctx context.Context, teamID domain.TeamID) ([]domain.TeamAssignment, error)
	AddAssignment(ctx context.Context, teamID domain.TeamID, userID domain.UserID) (domain.TeamAssignment, error)
	RemoveAssignment(ctx context.Context, teamID domain.TeamID, userID domain.UserID) error

	ListProjectTeams(ctx context.Context, projectID domain.ProjectID) ([]domain.Team, error)
	AddProjectTeam(ctx context.Context, projectID domain.ProjectID, teamID domain.TeamID, workspaceID domain.WorkspaceID) (domain.Team, error)
	RemoveProjectTeam(ctx context.Context, projectID domain.ProjectID, teamID domain.TeamID) error
}

// TeamService manages Workspace Teams, Team Assignments and Project Teams (ADR 0005).
type TeamService struct {
	projects    ProjectRepository
	teams       TeamRepository
	workspaces  WorkspaceAccessChecker
	eligibility AssigneeChecker
}

// NewTeamService builds a TeamService from its dependencies.
func NewTeamService(
	projects ProjectRepository,
	teams TeamRepository,
	workspaces WorkspaceAccessChecker,
	eligibility AssigneeChecker,
) *TeamService {
	return &TeamService{projects: projects, teams: teams, workspaces: workspaces, eligibility: eligibility}
}

// ListTeams returns all Teams of a Workspace the Actor can enter.
func (s *TeamService) ListTeams(ctx context.Context, actor domain.Actor, rawWorkspaceID string) ([]domain.Team, error) {
	access, err := s.workspaceAccess(ctx, actor, rawWorkspaceID)
	if err != nil {
		return nil, err
	}
	return s.teams.ListByWorkspace(ctx, access.WorkspaceID)
}

// CreateTeam creates a Team inside a Workspace the Actor manages (Workspace Owner).
func (s *TeamService) CreateTeam(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawName string) (domain.Team, error) {
	access, err := s.workspaceOwner(ctx, actor, rawWorkspaceID)
	if err != nil {
		return domain.Team{}, err
	}
	name, err := domain.ParseTeamName(rawName)
	if err != nil {
		return domain.Team{}, err
	}
	return s.teams.Create(ctx, access.WorkspaceID, name)
}

// RenameTeam renames a Team inside a Workspace the Actor manages.
func (s *TeamService) RenameTeam(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID, rawName string) (domain.Team, error) {
	access, err := s.workspaceOwner(ctx, actor, rawWorkspaceID)
	if err != nil {
		return domain.Team{}, err
	}
	teamID, err := domain.ParseTeamID(rawTeamID)
	if err != nil {
		return domain.Team{}, err
	}
	name, err := domain.ParseTeamName(rawName)
	if err != nil {
		return domain.Team{}, err
	}
	return s.teams.Rename(ctx, access.WorkspaceID, teamID, name)
}

// DeleteTeam deletes a Team and its Project Teams without deleting any Project.
func (s *TeamService) DeleteTeam(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID string) error {
	access, err := s.workspaceOwner(ctx, actor, rawWorkspaceID)
	if err != nil {
		return err
	}
	teamID, err := domain.ParseTeamID(rawTeamID)
	if err != nil {
		return err
	}
	return s.teams.Delete(ctx, access.WorkspaceID, teamID)
}

// ListTeamAssignments returns active Team Assignments and prunes any User who
// can no longer enter the Team's Workspace or has been Deactivated (CONTEXT.md).
func (s *TeamService) ListTeamAssignments(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID string) ([]domain.TeamAssignment, error) {
	access, err := s.workspaceAccess(ctx, actor, rawWorkspaceID)
	if err != nil {
		return nil, err
	}
	teamID, err := domain.ParseTeamID(rawTeamID)
	if err != nil {
		return nil, err
	}
	if _, err := s.teams.Find(ctx, access.WorkspaceID, teamID); err != nil {
		return nil, err
	}
	rows, err := s.teams.ListAssignments(ctx, teamID)
	if err != nil {
		return nil, err
	}
	return s.pruneIneligibleAssignments(ctx, access.WorkspaceID, teamID, rows)
}

// AddTeamAssignment assigns an eligible User to a Team (Workspace Owner only).
func (s *TeamService) AddTeamAssignment(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID, rawUserID string) (domain.TeamAssignment, error) {
	access, err := s.workspaceOwner(ctx, actor, rawWorkspaceID)
	if err != nil {
		return domain.TeamAssignment{}, err
	}
	teamID, err := domain.ParseTeamID(rawTeamID)
	if err != nil {
		return domain.TeamAssignment{}, err
	}
	userID, err := domain.ParseTeamAssigneeID(rawUserID)
	if err != nil {
		return domain.TeamAssignment{}, err
	}
	if _, err := s.teams.Find(ctx, access.WorkspaceID, teamID); err != nil {
		return domain.TeamAssignment{}, err
	}
	eligible, err := s.eligibility.CanBeAssigned(ctx, userID, access.WorkspaceID)
	if err != nil {
		return domain.TeamAssignment{}, err
	}
	if !eligible {
		return domain.TeamAssignment{}, domain.ErrInvalidTeamAssignee
	}
	return s.teams.AddAssignment(ctx, teamID, userID)
}

// RemoveTeamAssignment removes a User's Team Assignment (Workspace Owner only).
func (s *TeamService) RemoveTeamAssignment(ctx context.Context, actor domain.Actor, rawWorkspaceID, rawTeamID, rawUserID string) error {
	access, err := s.workspaceOwner(ctx, actor, rawWorkspaceID)
	if err != nil {
		return err
	}
	teamID, err := domain.ParseTeamID(rawTeamID)
	if err != nil {
		return err
	}
	userID, err := domain.ParseTeamAssigneeID(rawUserID)
	if err != nil {
		return domain.ErrTeamAssignmentNotFound
	}
	if _, err := s.teams.Find(ctx, access.WorkspaceID, teamID); err != nil {
		return err
	}
	return s.teams.RemoveAssignment(ctx, teamID, userID)
}

// ListProjectTeams returns Teams associated with a Project the Actor can see.
func (s *TeamService) ListProjectTeams(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.Team, error) {
	project, _, err := s.projectAccess(ctx, actor, rawProjectID)
	if err != nil {
		return nil, err
	}
	return s.teams.ListProjectTeams(ctx, project.ID)
}

// AddProjectTeam associates a Team from the Project's own Workspace (Workspace Owner only).
func (s *TeamService) AddProjectTeam(ctx context.Context, actor domain.Actor, rawProjectID, rawTeamID string) (domain.Team, error) {
	project, role, err := s.projectAccess(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Team{}, err
	}
	if !role.CanManageProject() {
		return domain.Team{}, domain.ErrForbidden
	}
	teamID, err := domain.ParseTeamRef(rawTeamID)
	if err != nil {
		return domain.Team{}, err
	}
	if _, err := s.teams.Find(ctx, project.WorkspaceID, teamID); errors.Is(err, domain.ErrTeamNotFound) {
		return domain.Team{}, domain.ErrInvalidTeamRef
	} else if err != nil {
		return domain.Team{}, err
	}
	return s.teams.AddProjectTeam(ctx, project.ID, teamID, project.WorkspaceID)
}

// RemoveProjectTeam disassociates a Team from a Project (Workspace Owner only).
func (s *TeamService) RemoveProjectTeam(ctx context.Context, actor domain.Actor, rawProjectID, rawTeamID string) error {
	project, role, err := s.projectAccess(ctx, actor, rawProjectID)
	if err != nil {
		return err
	}
	if !role.CanManageProject() {
		return domain.ErrForbidden
	}
	teamID, err := domain.ParseTeamID(rawTeamID)
	if err != nil {
		return domain.ErrProjectTeamNotFound
	}
	return s.teams.RemoveProjectTeam(ctx, project.ID, teamID)
}

func (s *TeamService) pruneIneligibleAssignments(
	ctx context.Context,
	workspaceID domain.WorkspaceID,
	teamID domain.TeamID,
	rows []domain.TeamAssignment,
) ([]domain.TeamAssignment, error) {
	kept := make([]domain.TeamAssignment, 0, len(rows))
	for _, a := range rows {
		ok, err := s.eligibility.CanBeAssigned(ctx, a.UserID, workspaceID)
		if err != nil {
			return nil, err
		}
		if !ok {
			if err := s.teams.RemoveAssignment(ctx, teamID, a.UserID); err != nil && !errors.Is(err, domain.ErrTeamAssignmentNotFound) {
				return nil, err
			}
			continue
		}
		kept = append(kept, a)
	}
	return kept, nil
}

func (s *TeamService) workspaceAccess(ctx context.Context, actor domain.Actor, rawWorkspaceID string) (domain.WorkspaceAccess, error) {
	wsID, err := domain.ParseWorkspaceRef(rawWorkspaceID)
	if err != nil {
		return domain.WorkspaceAccess{}, domain.ErrNotFound
	}
	access, err := s.workspaces.Access(ctx, actor, wsID)
	if errors.Is(err, domain.ErrWorkspaceNotFound) {
		return domain.WorkspaceAccess{}, domain.ErrNotFound
	}
	return access, err
}

func (s *TeamService) workspaceOwner(ctx context.Context, actor domain.Actor, rawWorkspaceID string) (domain.WorkspaceAccess, error) {
	access, err := s.workspaceAccess(ctx, actor, rawWorkspaceID)
	if err != nil {
		return domain.WorkspaceAccess{}, err
	}
	if !access.Role.CanManageProject() {
		return domain.WorkspaceAccess{}, domain.ErrForbidden
	}
	return access, nil
}

func (s *TeamService) projectAccess(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, domain.Role, error) {
	projectID, err := domain.ParseProjectID(rawProjectID)
	if err != nil {
		return domain.Project{}, "", err
	}
	project, err := s.projects.Find(ctx, projectID)
	if err != nil {
		return domain.Project{}, "", err
	}
	access, err := s.workspaces.Access(ctx, actor, project.WorkspaceID)
	if errors.Is(err, domain.ErrWorkspaceNotFound) {
		return domain.Project{}, "", domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, "", err
	}
	return project, access.Role, nil
}
