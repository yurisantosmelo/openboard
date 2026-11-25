--liquibase formatted sql

--changeset openboard:20261125085001
--comment: Optional Transition Rules limiting which Statuses a Work Item may move to from a given Status (CONTEXT.md: Transition Rule, ADR 0010).
CREATE TABLE project_transition_rules (
    project_id     UUID NOT NULL,
    from_status_id UUID NOT NULL,
    to_status_id   UUID NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, from_status_id, to_status_id)
);

--rollback DROP TABLE project_transition_rules;
