--liquibase formatted sql

--changeset openboard:20261125085002
--comment: Enforce Project boundary on Transition Rules and disallow self-transitions (ADR 0007, ADR 0010).
ALTER TABLE project_transition_rules
    ADD CONSTRAINT fk_project_transition_rules_from FOREIGN KEY (from_status_id, project_id) REFERENCES project_statuses (id, project_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_project_transition_rules_to FOREIGN KEY (to_status_id, project_id) REFERENCES project_statuses (id, project_id) ON DELETE CASCADE,
    ADD CONSTRAINT ck_project_transition_rules_distinct CHECK (from_status_id <> to_status_id);

--rollback ALTER TABLE project_transition_rules DROP CONSTRAINT ck_project_transition_rules_distinct, DROP CONSTRAINT fk_project_transition_rules_to, DROP CONSTRAINT fk_project_transition_rules_from;
