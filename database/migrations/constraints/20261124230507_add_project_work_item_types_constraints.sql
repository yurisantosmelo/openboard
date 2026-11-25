--liquibase formatted sql

--changeset openboard:20261124230507
--comment: Project Work Item Types carry an estimate unit and hierarchy pairs never cross a Project (ADR 0007, ADR 0010).
ALTER TABLE project_work_item_types
    ADD CONSTRAINT fk_project_work_item_types_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_project_work_item_types_id_project UNIQUE (id, project_id),
    ADD CONSTRAINT ck_project_work_item_types_name_not_blank CHECK (btrim(name) <> ''),
    ADD CONSTRAINT ck_project_work_item_types_estimate_unit CHECK (estimate_unit IN ('story_points', 'hours', 'none')),
    ADD CONSTRAINT ck_project_work_item_types_position CHECK (position >= 0);

ALTER TABLE project_work_item_type_hierarchy
    ADD CONSTRAINT fk_project_hierarchy_parent FOREIGN KEY (parent_type_id, project_id) REFERENCES project_work_item_types (id, project_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_project_hierarchy_child FOREIGN KEY (child_type_id, project_id) REFERENCES project_work_item_types (id, project_id) ON DELETE CASCADE;

--rollback ALTER TABLE project_work_item_type_hierarchy DROP CONSTRAINT fk_project_hierarchy_child, DROP CONSTRAINT fk_project_hierarchy_parent;
--rollback ALTER TABLE project_work_item_types DROP CONSTRAINT ck_project_work_item_types_position, DROP CONSTRAINT ck_project_work_item_types_estimate_unit, DROP CONSTRAINT ck_project_work_item_types_name_not_blank, DROP CONSTRAINT uq_project_work_item_types_id_project, DROP CONSTRAINT fk_project_work_item_types_project;
