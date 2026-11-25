--liquibase formatted sql

--changeset openboard:20261125073003
--comment: Indexes for listing, filtering, Parent/Child navigation, and clearing Assignee on access loss.
CREATE INDEX ix_work_items_project_status ON work_items (project_id, status_id, created_at DESC, id);
CREATE INDEX ix_work_items_project_parent ON work_items (project_id, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX ix_work_items_assignee_id ON work_items (assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX ix_work_items_organization_id ON work_items (organization_id);

--rollback DROP INDEX ix_work_items_organization_id;
--rollback DROP INDEX ix_work_items_assignee_id;
--rollback DROP INDEX ix_work_items_project_parent;
--rollback DROP INDEX ix_work_items_project_status;
