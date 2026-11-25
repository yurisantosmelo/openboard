--liquibase formatted sql

--changeset openboard:20261124230504
--comment: Allowed Parent-to-Child Work Item Type pairs defined per Project (CONTEXT.md: Parent, Child, ADR 0007, ADR 0010).
CREATE TABLE project_work_item_type_hierarchy (
    project_id     UUID NOT NULL,
    parent_type_id UUID NOT NULL,
    child_type_id  UUID NOT NULL,
    PRIMARY KEY (project_id, parent_type_id, child_type_id)
);

--rollback DROP TABLE project_work_item_type_hierarchy;
