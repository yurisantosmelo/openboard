--liquibase formatted sql

--changeset openboard:20261125150003_create_lifecycle_indexes
CREATE INDEX ix_organizations_pending_deletion ON organizations (purge_after) WHERE deleted_at IS NOT NULL;
CREATE INDEX ix_workspaces_pending_deletion ON workspaces (organization_id, purge_after) WHERE deleted_at IS NOT NULL;
CREATE INDEX ix_workspaces_archived ON workspaces (organization_id) WHERE archived_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_projects_pending_deletion ON projects (workspace_id, purge_after) WHERE deleted_at IS NOT NULL;
CREATE INDEX ix_projects_archived ON projects (workspace_id) WHERE archived_at IS NOT NULL AND deleted_at IS NULL;
--rollback DROP INDEX ix_projects_archived; DROP INDEX ix_projects_pending_deletion; DROP INDEX ix_workspaces_archived; DROP INDEX ix_workspaces_pending_deletion; DROP INDEX ix_organizations_pending_deletion;
