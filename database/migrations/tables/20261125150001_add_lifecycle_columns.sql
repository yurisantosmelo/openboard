--liquibase formatted sql

--changeset openboard:20261125150001_add_lifecycle_columns
ALTER TABLE organizations
    ADD COLUMN deleted_at  TIMESTAMPTZ NULL,
    ADD COLUMN purge_after TIMESTAMPTZ NULL;

ALTER TABLE workspaces
    ADD COLUMN archived_at TIMESTAMPTZ NULL,
    ADD COLUMN deleted_at  TIMESTAMPTZ NULL,
    ADD COLUMN purge_after TIMESTAMPTZ NULL;

ALTER TABLE projects
    ADD COLUMN archived_at TIMESTAMPTZ NULL,
    ADD COLUMN deleted_at  TIMESTAMPTZ NULL,
    ADD COLUMN purge_after TIMESTAMPTZ NULL;
--rollback ALTER TABLE projects DROP COLUMN purge_after, DROP COLUMN deleted_at, DROP COLUMN archived_at; ALTER TABLE workspaces DROP COLUMN purge_after, DROP COLUMN deleted_at, DROP COLUMN archived_at; ALTER TABLE organizations DROP COLUMN purge_after, DROP COLUMN deleted_at;
