--liquibase formatted sql

--changeset openboard:20261124230505
--comment: A Project belongs to one Workspace within the same Organization and must have a non-blank name (CONTEXT.md: Project, ADR 0003).
ALTER TABLE projects
    ADD CONSTRAINT fk_projects_workspace FOREIGN KEY (workspace_id, organization_id) REFERENCES workspaces (id, organization_id) ON DELETE CASCADE,
    ADD CONSTRAINT ck_projects_name_not_blank CHECK (btrim(name) <> '');

--rollback ALTER TABLE projects DROP CONSTRAINT ck_projects_name_not_blank, DROP CONSTRAINT fk_projects_workspace;
