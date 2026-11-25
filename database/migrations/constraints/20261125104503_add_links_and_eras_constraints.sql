--liquibase formatted sql

--changeset openboard:20261125104503
--comment: Enforce Project boundaries on Links and Eras, cascade Link removal on Work Item delete, and clear era_id on Planned Era delete (CONTEXT.md, ADR 0007).
ALTER TABLE work_item_links
    ADD CONSTRAINT fk_work_item_links_source FOREIGN KEY (source_work_item_id, project_id) REFERENCES work_items (id, project_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_work_item_links_target FOREIGN KEY (target_work_item_id, project_id) REFERENCES work_items (id, project_id) ON DELETE CASCADE,
    ADD CONSTRAINT ck_work_item_links_kind CHECK (kind IN ('blocks', 'duplicates', 'relates_to')),
    ADD CONSTRAINT ck_work_item_links_distinct CHECK (source_work_item_id <> target_work_item_id),
    ADD CONSTRAINT uq_work_item_links_pair_kind UNIQUE (project_id, source_work_item_id, target_work_item_id, kind);

ALTER TABLE project_eras
    ADD CONSTRAINT uq_project_eras_id_project UNIQUE (id, project_id),
    ADD CONSTRAINT fk_project_eras_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    ADD CONSTRAINT ck_project_eras_name_not_blank CHECK (btrim(name) <> ''),
    ADD CONSTRAINT ck_project_eras_dates CHECK (start_date <= end_date),
    ADD CONSTRAINT ck_project_eras_state CHECK (state IN ('planned', 'active', 'completed')),
    ADD CONSTRAINT ck_project_eras_closed_at CHECK ((state = 'completed') = (closed_at IS NOT NULL));

ALTER TABLE work_items
    ADD CONSTRAINT fk_work_items_era FOREIGN KEY (era_id, project_id) REFERENCES project_eras (id, project_id) ON DELETE SET NULL (era_id);

--rollback ALTER TABLE work_items DROP CONSTRAINT fk_work_items_era;
--rollback ALTER TABLE project_eras DROP CONSTRAINT ck_project_eras_closed_at, DROP CONSTRAINT ck_project_eras_state, DROP CONSTRAINT ck_project_eras_dates, DROP CONSTRAINT ck_project_eras_name_not_blank, DROP CONSTRAINT fk_project_eras_project, DROP CONSTRAINT uq_project_eras_id_project;
--rollback ALTER TABLE work_item_links DROP CONSTRAINT uq_work_item_links_pair_kind, DROP CONSTRAINT ck_work_item_links_distinct, DROP CONSTRAINT ck_work_item_links_kind, DROP CONSTRAINT fk_work_item_links_target, DROP CONSTRAINT fk_work_item_links_source;
