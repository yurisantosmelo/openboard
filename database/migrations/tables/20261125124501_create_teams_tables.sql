--liquibase formatted sql

--changeset openboard:20261125124501
--comment: Teams per Workspace, Team Assignments (no access control, ADR 0005), and Project Teams scoped to one Workspace (CONTEXT.md).
CREATE TABLE teams (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID         NOT NULL,
    name         VARCHAR(100) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE team_assignments (
    team_id    UUID        NOT NULL,
    user_id    UUID        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE project_teams (
    project_id   UUID        NOT NULL,
    team_id      UUID        NOT NULL,
    workspace_id UUID        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, team_id)
);

--rollback DROP TABLE project_teams;
--rollback DROP TABLE team_assignments;
--rollback DROP TABLE teams;
