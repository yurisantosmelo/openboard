--liquibase formatted sql

--changeset openboard:20261124230508
--comment: Case-insensitive uniqueness within Workspace/Project and lookup indexes for Projects and workflow configuration.
CREATE UNIQUE INDEX ux_projects_workspace_name ON projects (workspace_id, lower(name));
CREATE INDEX ix_projects_organization_id ON projects (organization_id);
CREATE UNIQUE INDEX ux_project_statuses_project_name ON project_statuses (project_id, lower(name));
CREATE INDEX ix_project_statuses_project_position ON project_statuses (project_id, position, id);
CREATE UNIQUE INDEX ux_project_work_item_types_project_name ON project_work_item_types (project_id, lower(name));
CREATE INDEX ix_project_work_item_types_project_position ON project_work_item_types (project_id, position, id);

--rollback DROP INDEX ix_project_work_item_types_project_position;
--rollback DROP INDEX ux_project_work_item_types_project_name;
--rollback DROP INDEX ix_project_statuses_project_position;
--rollback DROP INDEX ux_project_statuses_project_name;
--rollback DROP INDEX ix_projects_organization_id;
--rollback DROP INDEX ux_projects_workspace_name;
