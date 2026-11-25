--liquibase formatted sql

--changeset openboard:20261125114502
--comment: Enforce Project boundary, creator FK, valid Layout and Visibility, and JSON object Filters on project_views (CONTEXT.md: View, ADR 0010).
ALTER TABLE project_views
    ADD CONSTRAINT fk_project_views_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_project_views_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT ck_project_views_name_not_blank CHECK (btrim(name) <> ''),
    ADD CONSTRAINT ck_project_views_layout CHECK (layout IN ('board', 'list', 'table', 'timeline', 'calendar')),
    ADD CONSTRAINT ck_project_views_visibility CHECK (visibility IN ('personal', 'shared')),
    ADD CONSTRAINT ck_project_views_filters_object CHECK (jsonb_typeof(filters) = 'object');

--rollback ALTER TABLE project_views DROP CONSTRAINT ck_project_views_filters_object, DROP CONSTRAINT ck_project_views_visibility, DROP CONSTRAINT ck_project_views_layout, DROP CONSTRAINT ck_project_views_name_not_blank, DROP CONSTRAINT fk_project_views_created_by, DROP CONSTRAINT fk_project_views_project;
