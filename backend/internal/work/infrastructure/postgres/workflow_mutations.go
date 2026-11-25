package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const (
	uxStatusProjectName       = "ux_project_statuses_project_name"
	uxWorkItemTypeProjectName = "ux_project_work_item_types_project_name"
	pgUniqueViolation         = "23505"
)

// Workflow persists customizable Statuses, Work Item Types, hierarchy pairs and
// Transition Rules in PostgreSQL.
type Workflow struct {
	pool *pgxpool.Pool
}

// NewWorkflow returns a Workflow repository backed by pool.
func NewWorkflow(pool *pgxpool.Pool) *Workflow {
	return &Workflow{pool: pool}
}

// CreateStatus adds a Status to a Project.
func (r *Workflow) CreateStatus(ctx context.Context, in application.NewStatus) (domain.Status, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO project_statuses (project_id, name, status_group, position)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text, project_id::text, name, status_group, position, created_at`,
		string(in.ProjectID), in.Name, string(in.Group), in.Position)
	status, err := scanStatus(row)
	if err != nil {
		return domain.Status{}, mapWorkflowError("create status", err)
	}
	return status, nil
}

// UpdateStatus updates a Status's name, Status Group and ordering position.
func (r *Workflow) UpdateStatus(ctx context.Context, in application.StatusUpdate) (domain.Status, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE project_statuses
		SET name = $3, status_group = $4, position = $5
		WHERE project_id = $1 AND id = $2
		RETURNING id::text, project_id::text, name, status_group, position, created_at`,
		string(in.ProjectID), string(in.ID), in.Name, string(in.Group), in.Position)
	status, err := scanStatus(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Status{}, domain.ErrStatusNotFound
	}
	if err != nil {
		return domain.Status{}, mapWorkflowError("update status", err)
	}
	return status, nil
}

// DeleteStatus moves all Work Items from id to replacementID and deletes id atomically.
func (r *Workflow) DeleteStatus(ctx context.Context, projectID domain.ProjectID, id, replacementID domain.StatusID) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			UPDATE work_items
			SET status_id = $3, updated_at = NOW()
			WHERE project_id = $1 AND status_id = $2`,
			string(projectID), string(id), string(replacementID)); err != nil {
			return fmt.Errorf("reassign work item status: %w", err)
		}
		tag, err := tx.Exec(ctx, `DELETE FROM project_statuses WHERE project_id = $1 AND id = $2`,
			string(projectID), string(id))
		if err != nil {
			return fmt.Errorf("delete status: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return domain.ErrStatusNotFound
		}
		return nil
	})
}

// CreateWorkItemType inserts a Work Item Type and its allowed Child types atomically.
func (r *Workflow) CreateWorkItemType(ctx context.Context, in application.NewWorkItemType) (domain.WorkItemType, error) {
	var created domain.WorkItemType
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			INSERT INTO project_work_item_types (project_id, name, estimate_unit, position)
			VALUES ($1, $2, $3, $4)
			RETURNING id::text, project_id::text, name, estimate_unit, position, created_at`,
			string(in.ProjectID), in.Name, string(in.EstimateUnit), in.Position)
		wt, err := scanWorkItemType(row)
		if err != nil {
			return mapWorkflowError("create work item type", err)
		}
		if err := insertAllowedChildren(ctx, tx, in.ProjectID, wt.ID, in.AllowedChildTypeIDs); err != nil {
			return err
		}
		wt.AllowedChildTypeIDs = append([]domain.WorkItemTypeID{}, in.AllowedChildTypeIDs...)
		created = wt
		return nil
	})
	return created, err
}

// UpdateWorkItemType updates a Work Item Type, clearing incompatible estimates
// and disallowed Parent links when estimate unit or hierarchy changes.
func (r *Workflow) UpdateWorkItemType(ctx context.Context, in application.WorkItemTypeUpdate) (domain.WorkItemType, error) {
	var updated domain.WorkItemType
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			UPDATE project_work_item_types
			SET name = $3, estimate_unit = $4, position = $5
			WHERE project_id = $1 AND id = $2
			RETURNING id::text, project_id::text, name, estimate_unit, position, created_at`,
			string(in.ProjectID), string(in.ID), in.Name, string(in.EstimateUnit), in.Position)
		wt, err := scanWorkItemType(row)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrWorkItemTypeNotFound
		}
		if err != nil {
			return mapWorkflowError("update work item type", err)
		}
		if err := applyWorkItemTypeSideEffects(ctx, tx, in); err != nil {
			return err
		}
		children, err := loadAllowedChildrenTx(ctx, tx, in.ProjectID, wt.ID)
		if err != nil {
			return err
		}
		wt.AllowedChildTypeIDs = children
		updated = wt
		return nil
	})
	return updated, err
}

// DeleteWorkItemType moves Work Items to replacementID, discards incompatible
// estimates, undoes disallowed Parent links, and deletes the Work Item Type.
func (r *Workflow) DeleteWorkItemType(
	ctx context.Context,
	projectID domain.ProjectID,
	id, replacementID domain.WorkItemTypeID,
	replacementUnit domain.EstimateUnit,
) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if err := reassignWorkItemType(ctx, tx, projectID, id, replacementID, replacementUnit); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `DELETE FROM project_work_item_types WHERE project_id = $1 AND id = $2`,
			string(projectID), string(id))
		if err != nil {
			return fmt.Errorf("delete work item type: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return domain.ErrWorkItemTypeNotFound
		}
		return clearDisallowedParents(ctx, tx, projectID)
	})
}

// ListTransitionRules returns all optional Transition Rules of projectID.
func (r *Workflow) ListTransitionRules(ctx context.Context, projectID domain.ProjectID) ([]domain.TransitionRule, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT project_id::text, from_status_id::text, to_status_id::text, created_at
		FROM project_transition_rules
		WHERE project_id = $1
		ORDER BY from_status_id, to_status_id`, string(projectID))
	if err != nil {
		return nil, fmt.Errorf("list transition rules: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.TransitionRule, error) {
		return scanTransitionRule(row)
	})
}

// AddTransitionRule inserts one allowed transition pair (from -> to) for projectID.
func (r *Workflow) AddTransitionRule(ctx context.Context, projectID domain.ProjectID, from, to domain.StatusID) (domain.TransitionRule, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO project_transition_rules (project_id, from_status_id, to_status_id)
		VALUES ($1, $2, $3)
		RETURNING project_id::text, from_status_id::text, to_status_id::text, created_at`,
		string(projectID), string(from), string(to))
	rule, err := scanTransitionRule(row)
	if err != nil {
		return domain.TransitionRule{}, mapWorkflowError("add transition rule", err)
	}
	return rule, nil
}

// RemoveTransitionRule deletes one Transition Rule from projectID.
func (r *Workflow) RemoveTransitionRule(ctx context.Context, projectID domain.ProjectID, from, to domain.StatusID) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM project_transition_rules
		WHERE project_id = $1 AND from_status_id = $2 AND to_status_id = $3`,
		string(projectID), string(from), string(to))
	if err != nil {
		return fmt.Errorf("remove transition rule: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrTransitionRuleNotFound
	}
	return nil
}

func applyWorkItemTypeSideEffects(ctx context.Context, tx pgx.Tx, in application.WorkItemTypeUpdate) error {
	if in.EstimateUnitChanged {
		if err := clearIncompatibleEstimates(ctx, tx, in.ProjectID, in.ID, in.EstimateUnit); err != nil {
			return err
		}
	}
	if !in.UpdateHierarchy {
		return nil
	}
	if _, err := tx.Exec(ctx, `DELETE FROM project_work_item_type_hierarchy WHERE project_id = $1 AND parent_type_id = $2`,
		string(in.ProjectID), string(in.ID)); err != nil {
		return fmt.Errorf("clear work item type hierarchy: %w", err)
	}
	if err := insertAllowedChildren(ctx, tx, in.ProjectID, in.ID, in.AllowedChildTypeIDs); err != nil {
		return err
	}
	return clearDisallowedParents(ctx, tx, in.ProjectID)
}

func insertAllowedChildren(ctx context.Context, tx pgx.Tx, projectID domain.ProjectID, parentTypeID domain.WorkItemTypeID, children []domain.WorkItemTypeID) error {
	for _, childID := range children {
		if _, err := tx.Exec(ctx, `
			INSERT INTO project_work_item_type_hierarchy (project_id, parent_type_id, child_type_id)
			VALUES ($1, $2, $3)`,
			string(projectID), string(parentTypeID), string(childID)); err != nil {
			return fmt.Errorf("insert hierarchy rule: %w", err)
		}
	}
	return nil
}

func loadAllowedChildrenTx(ctx context.Context, tx pgx.Tx, projectID domain.ProjectID, parentTypeID domain.WorkItemTypeID) ([]domain.WorkItemTypeID, error) {
	rows, err := tx.Query(ctx, `
		SELECT h.child_type_id::text
		FROM project_work_item_type_hierarchy h
		JOIN project_work_item_types child ON child.id = h.child_type_id
		WHERE h.project_id = $1 AND h.parent_type_id = $2
		ORDER BY child.position, child.id`,
		string(projectID), string(parentTypeID))
	if err != nil {
		return nil, fmt.Errorf("load allowed child types: %w", err)
	}
	ids, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.WorkItemTypeID, error) {
		var id string
		err := row.Scan(&id)
		return domain.WorkItemTypeID(id), err
	})
	if err != nil {
		return nil, fmt.Errorf("scan allowed child types: %w", err)
	}
	if ids == nil {
		return []domain.WorkItemTypeID{}, nil
	}
	return ids, nil
}

func clearIncompatibleEstimates(ctx context.Context, tx pgx.Tx, projectID domain.ProjectID, typeID domain.WorkItemTypeID, unit domain.EstimateUnit) error {
	var query string
	switch unit {
	case domain.EstimateUnitStoryPoints:
		query = `UPDATE work_items SET hours = NULL, updated_at = NOW() WHERE project_id = $1 AND work_item_type_id = $2 AND hours IS NOT NULL`
	case domain.EstimateUnitHours:
		query = `UPDATE work_items SET story_points = NULL, updated_at = NOW() WHERE project_id = $1 AND work_item_type_id = $2 AND story_points IS NOT NULL`
	default:
		query = `UPDATE work_items SET story_points = NULL, hours = NULL, updated_at = NOW() WHERE project_id = $1 AND work_item_type_id = $2 AND (story_points IS NOT NULL OR hours IS NOT NULL)`
	}
	if _, err := tx.Exec(ctx, query, string(projectID), string(typeID)); err != nil {
		return fmt.Errorf("clear incompatible estimates: %w", err)
	}
	return nil
}

func reassignWorkItemType(
	ctx context.Context,
	tx pgx.Tx,
	projectID domain.ProjectID,
	oldTypeID, replacementID domain.WorkItemTypeID,
	unit domain.EstimateUnit,
) error {
	var query string
	switch unit {
	case domain.EstimateUnitStoryPoints:
		query = `UPDATE work_items SET work_item_type_id = $3, hours = NULL, updated_at = NOW() WHERE project_id = $1 AND work_item_type_id = $2`
	case domain.EstimateUnitHours:
		query = `UPDATE work_items SET work_item_type_id = $3, story_points = NULL, updated_at = NOW() WHERE project_id = $1 AND work_item_type_id = $2`
	default:
		query = `UPDATE work_items SET work_item_type_id = $3, story_points = NULL, hours = NULL, updated_at = NOW() WHERE project_id = $1 AND work_item_type_id = $2`
	}
	if _, err := tx.Exec(ctx, query, string(projectID), string(oldTypeID), string(replacementID)); err != nil {
		return fmt.Errorf("reassign work item type: %w", err)
	}
	return nil
}

func clearDisallowedParents(ctx context.Context, tx pgx.Tx, projectID domain.ProjectID) error {
	if _, err := tx.Exec(ctx, `
		UPDATE work_items c
		SET parent_id = NULL, updated_at = NOW()
		FROM work_items p
		WHERE c.project_id = $1
		  AND c.parent_id = p.id
		  AND NOT EXISTS (
			SELECT 1
			FROM project_work_item_type_hierarchy h
			WHERE h.project_id = c.project_id
			  AND h.parent_type_id = p.work_item_type_id
			  AND h.child_type_id = c.work_item_type_id
		  )`, string(projectID)); err != nil {
		return fmt.Errorf("clear disallowed parent links: %w", err)
	}
	return nil
}

func scanStatus(row pgx.Row) (domain.Status, error) {
	var (
		s                 domain.Status
		id, projID, group string
	)
	if err := row.Scan(&id, &projID, &s.Name, &group, &s.Position, &s.CreatedAt); err != nil {
		return domain.Status{}, err
	}
	s.ID = domain.StatusID(id)
	s.ProjectID = domain.ProjectID(projID)
	s.Group = domain.StatusGroup(group)
	return s, nil
}

func scanWorkItemType(row pgx.Row) (domain.WorkItemType, error) {
	var (
		wt               domain.WorkItemType
		id, projID, unit string
	)
	if err := row.Scan(&id, &projID, &wt.Name, &unit, &wt.Position, &wt.CreatedAt); err != nil {
		return domain.WorkItemType{}, err
	}
	wt.ID = domain.WorkItemTypeID(id)
	wt.ProjectID = domain.ProjectID(projID)
	wt.EstimateUnit = domain.EstimateUnit(unit)
	wt.AllowedChildTypeIDs = []domain.WorkItemTypeID{}
	return wt, nil
}

func scanTransitionRule(row pgx.Row) (domain.TransitionRule, error) {
	var (
		r                domain.TransitionRule
		projID, from, to string
	)
	if err := row.Scan(&projID, &from, &to, &r.CreatedAt); err != nil {
		return domain.TransitionRule{}, err
	}
	r.ProjectID = domain.ProjectID(projID)
	r.FromStatusID = domain.StatusID(from)
	r.ToStatusID = domain.StatusID(to)
	return r, nil
}

func mapWorkflowError(op string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		switch pgErr.ConstraintName {
		case uxStatusProjectName:
			return domain.ErrStatusNameInUse
		case uxWorkItemTypeProjectName:
			return domain.ErrWorkItemTypeNameInUse
		default:
			return domain.ErrTransitionRuleExists
		}
	}
	return fmt.Errorf("%s: %w", op, err)
}
