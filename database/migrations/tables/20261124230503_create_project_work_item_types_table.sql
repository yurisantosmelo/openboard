--liquibase formatted sql

--changeset openboard:20261124230503
--comment: Each Project defines its own Work Item Types and estimate unit (CONTEXT.md: Work Item Type, Story Points, Hours, ADR 0010).
CREATE TABLE project_work_item_types (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID         NOT NULL,
    name          VARCHAR(100) NOT NULL,
    estimate_unit VARCHAR(16)  NOT NULL,
    position      INTEGER      NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

--rollback DROP TABLE project_work_item_types;
