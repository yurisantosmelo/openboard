--liquibase formatted sql

--changeset openboard:20261125073002
--comment: Enforce Project structural boundary (ADR 0007), estimate unit exclusivity, Priority values, and safe Parent deletion (CONTEXT.md).
ALTER TABLE projects
    ADD CONSTRAINT uq_projects_id_organization UNIQUE (id, organization_id);

ALTER TABLE project_statuses
    ADD CONSTRAINT uq_project_statuses_id_project UNIQUE (id, project_id);

ALTER TABLE work_items
    ADD CONSTRAINT uq_work_items_id_project UNIQUE (id, project_id),
    ADD CONSTRAINT fk_work_items_project FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_work_items_type FOREIGN KEY (work_item_type_id, project_id) REFERENCES project_work_item_types (id, project_id),
    ADD CONSTRAINT fk_work_items_status FOREIGN KEY (status_id, project_id) REFERENCES project_statuses (id, project_id),
    ADD CONSTRAINT fk_work_items_parent FOREIGN KEY (parent_id, project_id) REFERENCES work_items (id, project_id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_work_items_assignee FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_work_items_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    ADD CONSTRAINT ck_work_items_title_not_blank CHECK (btrim(title) <> ''),
    ADD CONSTRAINT ck_work_items_priority CHECK (priority IN ('urgent', 'high', 'medium', 'low', 'none')),
    ADD CONSTRAINT ck_work_items_story_points_non_negative CHECK (story_points IS NULL OR story_points >= 0),
    ADD CONSTRAINT ck_work_items_hours_non_negative CHECK (hours IS NULL OR hours >= 0),
    ADD CONSTRAINT ck_work_items_single_estimate_unit CHECK (NOT (story_points IS NOT NULL AND hours IS NOT NULL)),
    ADD CONSTRAINT ck_work_items_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id);

--rollback ALTER TABLE work_items DROP CONSTRAINT ck_work_items_no_self_parent, DROP CONSTRAINT ck_work_items_single_estimate_unit, DROP CONSTRAINT ck_work_items_hours_non_negative, DROP CONSTRAINT ck_work_items_story_points_non_negative, DROP CONSTRAINT ck_work_items_priority, DROP CONSTRAINT ck_work_items_title_not_blank, DROP CONSTRAINT fk_work_items_created_by, DROP CONSTRAINT fk_work_items_assignee, DROP CONSTRAINT fk_work_items_parent, DROP CONSTRAINT fk_work_items_status, DROP CONSTRAINT fk_work_items_type, DROP CONSTRAINT fk_work_items_project, DROP CONSTRAINT uq_work_items_id_project;
--rollback ALTER TABLE project_statuses DROP CONSTRAINT uq_project_statuses_id_project;
--rollback ALTER TABLE projects DROP CONSTRAINT uq_projects_id_organization;
