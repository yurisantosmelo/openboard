--liquibase formatted sql

--changeset openboard:20261124220501
--comment: Track Deactivated Users without deleting them so authorship and Memberships remain intact (CONTEXT.md: Deactivated).
ALTER TABLE users
    ADD COLUMN deactivated_at TIMESTAMPTZ;

--rollback ALTER TABLE users DROP COLUMN deactivated_at;
