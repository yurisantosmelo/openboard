--liquibase formatted sql

--changeset openboard:20261124230506
--comment: Each Project Status belongs to one Project and one of the four fixed Status Groups (CONTEXT.md: Status, Status Group, ADR 0010).
ALTER TABLE project_statuses
    ADD CONSTRAINT fk_project_statuses_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    ADD CONSTRAINT ck_project_statuses_name_not_blank CHECK (btrim(name) <> ''),
    ADD CONSTRAINT ck_project_statuses_group CHECK (status_group IN ('not_committed', 'planned', 'started', 'completed')),
    ADD CONSTRAINT ck_project_statuses_position CHECK (position >= 0);

--rollback ALTER TABLE project_statuses DROP CONSTRAINT ck_project_statuses_position, DROP CONSTRAINT ck_project_statuses_group, DROP CONSTRAINT ck_project_statuses_name_not_blank, DROP CONSTRAINT fk_project_statuses_project;
