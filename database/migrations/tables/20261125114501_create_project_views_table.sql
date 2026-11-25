--liquibase formatted sql

--changeset openboard:20261125114501
--comment: Saved Views (Personal View and Shared View) scoped to one Project with Layout and Filters (CONTEXT.md: View, ADR 0010).
CREATE TABLE project_views (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID         NOT NULL,
    name       VARCHAR(100) NOT NULL,
    layout     VARCHAR(16)  NOT NULL,
    visibility VARCHAR(16)  NOT NULL DEFAULT 'personal',
    filters    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

--rollback DROP TABLE project_views;
