--liquibase formatted sql

--changeset openboard:20261125124503
--comment: Unique Team names per Workspace and lookup indexes for Team Assignments and Project Teams (CONTEXT.md: Team).
CREATE UNIQUE INDEX ux_teams_workspace_name ON teams (workspace_id, lower(name));
CREATE INDEX ix_team_assignments_user ON team_assignments (user_id);
CREATE INDEX ix_project_teams_team ON project_teams (team_id);

--rollback DROP INDEX ix_project_teams_team;
--rollback DROP INDEX ix_team_assignments_user;
--rollback DROP INDEX ux_teams_workspace_name;
