--liquibase formatted sql

--changeset openboard:20261124230502
--comment: Each Project defines its own Statuses, each belonging to one of the four fixed Status Groups (CONTEXT.md: Status, Status Group, ADR 0010).
CREATE TABLE project_statuses (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID         NOT NULL,
    name         VARCHAR(100) NOT NULL,
    status_group VARCHAR(16)  NOT NULL,
    position     INTEGER      NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

--rollback DROP TABLE project_statuses;
