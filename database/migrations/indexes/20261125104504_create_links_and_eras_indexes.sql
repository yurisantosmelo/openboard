--liquibase formatted sql

--changeset openboard:20261125104504
--comment: Lookup indexes for Work Item Links, unique Era names, at most one Active Era per Project, and Era queries (CONTEXT.md: Era, Link).
CREATE INDEX ix_work_item_links_source ON work_item_links (source_work_item_id);
CREATE INDEX ix_work_item_links_target ON work_item_links (target_work_item_id);
CREATE UNIQUE INDEX ux_project_eras_project_name ON project_eras (project_id, lower(name));
CREATE UNIQUE INDEX ux_project_eras_active ON project_eras (project_id) WHERE state = 'active';
CREATE INDEX ix_project_eras_project_dates ON project_eras (project_id, start_date, end_date);
CREATE INDEX ix_work_items_project_era ON work_items (project_id, era_id) WHERE era_id IS NOT NULL;

--rollback DROP INDEX ix_work_items_project_era;
--rollback DROP INDEX ix_project_eras_project_dates;
--rollback DROP INDEX ux_project_eras_active;
--rollback DROP INDEX ux_project_eras_project_name;
--rollback DROP INDEX ix_work_item_links_target;
--rollback DROP INDEX ix_work_item_links_source;
