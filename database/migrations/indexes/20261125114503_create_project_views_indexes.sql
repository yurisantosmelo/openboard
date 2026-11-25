--liquibase formatted sql

--changeset openboard:20261125114503
--comment: Unique Shared View names per Project, unique Personal View names per User+Project, and lookup index (CONTEXT.md: View).
CREATE UNIQUE INDEX ux_project_views_shared_name ON project_views (project_id, lower(name)) WHERE visibility = 'shared';
CREATE UNIQUE INDEX ux_project_views_personal_name ON project_views (project_id, created_by, lower(name)) WHERE visibility = 'personal';
CREATE INDEX ix_project_views_project_visibility ON project_views (project_id, visibility, created_by);

--rollback DROP INDEX ix_project_views_project_visibility;
--rollback DROP INDEX ux_project_views_personal_name;
--rollback DROP INDEX ux_project_views_shared_name;
