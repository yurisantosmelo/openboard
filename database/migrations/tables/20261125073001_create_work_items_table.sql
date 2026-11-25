--liquibase formatted sql

--changeset openboard:20261125073001
--comment: A Work Item is the fundamental unit of planned and executed work inside one Project (CONTEXT.md: Work Item, ADR 0003, ADR 0007, ADR 0010).
CREATE TABLE work_items (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID         NOT NULL,
    project_id        UUID         NOT NULL,
    work_item_type_id UUID         NOT NULL,
    status_id         UUID         NOT NULL,
    parent_id         UUID,
    assignee_id       UUID,
    title             VARCHAR(255) NOT NULL,
    description       TEXT         NOT NULL DEFAULT '',
    priority          VARCHAR(16)  NOT NULL DEFAULT 'none',
    story_points      NUMERIC(8,2),
    hours             NUMERIC(8,2),
    created_by        UUID         NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

--rollback DROP TABLE work_items;
