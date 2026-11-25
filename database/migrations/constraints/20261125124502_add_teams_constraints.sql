--liquibase formatted sql

--changeset openboard:20261125124502
--comment: Enforce Workspace boundary on Teams and Project Teams, cascade Team deletion without deleting Projects (CONTEXT.md, ADR 0005).
ALTER TABLE projects
    ADD CONSTRAINT uq_projects_id_workspace UNIQUE (id, workspace_id);

ALTER TABLE teams
    ADD CONSTRAINT uq_teams_id_workspace UNIQUE (id, workspace_id),
    ADD CONSTRAINT fk_teams_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
    ADD CONSTRAINT ck_teams_name_not_blank CHECK (btrim(name) <> '');

ALTER TABLE team_assignments
    ADD CONSTRAINT fk_team_assignments_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_team_assignments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE project_teams
    ADD CONSTRAINT fk_project_teams_project FOREIGN KEY (project_id, workspace_id) REFERENCES projects (id, workspace_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_project_teams_team FOREIGN KEY (team_id, workspace_id) REFERENCES teams (id, workspace_id) ON DELETE CASCADE;

--rollback ALTER TABLE project_teams DROP CONSTRAINT fk_project_teams_team, DROP CONSTRAINT fk_project_teams_project;
--rollback ALTER TABLE team_assignments DROP CONSTRAINT fk_team_assignments_user, DROP CONSTRAINT fk_team_assignments_team;
--rollback ALTER TABLE teams DROP CONSTRAINT ck_teams_name_not_blank, DROP CONSTRAINT fk_teams_workspace, DROP CONSTRAINT uq_teams_id_workspace;
--rollback ALTER TABLE projects DROP CONSTRAINT uq_projects_id_workspace;
