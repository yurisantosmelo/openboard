--liquibase formatted sql

--changeset openboard:20261125104501
--comment: Non-hierarchical Links between two Work Items of the same Project: Blocks, Duplicates or Relates To (CONTEXT.md: Link, ADR 0007).
CREATE TABLE work_item_links (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID        NOT NULL,
    source_work_item_id UUID        NOT NULL,
    target_work_item_id UUID        NOT NULL,
    kind                VARCHAR(16) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--rollback DROP TABLE work_item_links;
