--liquibase formatted sql

--changeset openboard:20261125104502
--comment: Time-boxed Eras of one Project (Planned, Active, Completed) and optional Work Item membership in one Era (CONTEXT.md: Era, ADR 0007).
CREATE TABLE project_eras (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID         NOT NULL,
    name       VARCHAR(100) NOT NULL,
    goal       TEXT         NOT NULL DEFAULT '',
    start_date DATE         NOT NULL,
    end_date   DATE         NOT NULL,
    state      VARCHAR(16)  NOT NULL DEFAULT 'planned',
    closed_at  TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE work_items
    ADD COLUMN era_id UUID;

--rollback ALTER TABLE work_items DROP COLUMN era_id;
--rollback DROP TABLE project_eras;
