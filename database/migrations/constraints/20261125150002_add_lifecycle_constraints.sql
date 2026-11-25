--liquibase formatted sql

--changeset openboard:20261125150002_add_lifecycle_constraints
ALTER TABLE organizations
    ADD CONSTRAINT ck_organizations_deletion_window
        CHECK ((deleted_at IS NULL) = (purge_after IS NULL) AND (purge_after IS NULL OR purge_after >= deleted_at));

ALTER TABLE workspaces
    ADD CONSTRAINT ck_workspaces_deletion_window
        CHECK ((deleted_at IS NULL) = (purge_after IS NULL) AND (purge_after IS NULL OR purge_after >= deleted_at));

ALTER TABLE projects
    ADD CONSTRAINT ck_projects_deletion_window
        CHECK ((deleted_at IS NULL) = (purge_after IS NULL) AND (purge_after IS NULL OR purge_after >= deleted_at));
--rollback ALTER TABLE projects DROP CONSTRAINT ck_projects_deletion_window; ALTER TABLE workspaces DROP CONSTRAINT ck_workspaces_deletion_window; ALTER TABLE organizations DROP CONSTRAINT ck_organizations_deletion_window;
