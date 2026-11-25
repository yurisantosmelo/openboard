--liquibase formatted sql

--changeset openboard:20261124230501
--comment: A Project is the central unit of planned and executed work, owned by one Workspace inside one Organization (CONTEXT.md: Project, ADR 0003, ADR 0007).
CREATE TABLE projects (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL,
    workspace_id    UUID         NOT NULL,
    name            VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

--rollback DROP TABLE projects;
