package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

func seedStatuses(ctx context.Context, tx pgx.Tx, projectID domain.ProjectID, specs []domain.StatusSpec) error {
	for _, spec := range specs {
		_, err := tx.Exec(ctx, `
			INSERT INTO project_statuses (project_id, name, status_group, position)
			VALUES ($1, $2, $3, $4)`,
			string(projectID), spec.Name, string(spec.Group), spec.Position)
		if err != nil {
			return fmt.Errorf("seed project status %q: %w", spec.Name, err)
		}
	}
	return nil
}

func seedWorkItemTypesAndHierarchy(
	ctx context.Context,
	tx pgx.Tx,
	projectID domain.ProjectID,
	types []domain.WorkItemTypeSpec,
	rules []domain.HierarchyRule,
) error {
	idByName := make(map[string]string, len(types))
	for _, spec := range types {
		var id string
		err := tx.QueryRow(ctx, `
			INSERT INTO project_work_item_types (project_id, name, estimate_unit, position)
			VALUES ($1, $2, $3, $4)
			RETURNING id::text`,
			string(projectID), spec.Name, string(spec.EstimateUnit), spec.Position).Scan(&id)
		if err != nil {
			return fmt.Errorf("seed work item type %q: %w", spec.Name, err)
		}
		idByName[spec.Name] = id
	}
	for _, rule := range rules {
		_, err := tx.Exec(ctx, `
			INSERT INTO project_work_item_type_hierarchy (project_id, parent_type_id, child_type_id)
			VALUES ($1, $2, $3)`,
			string(projectID), idByName[rule.ParentName], idByName[rule.ChildName])
		if err != nil {
			return fmt.Errorf("seed hierarchy %q -> %q: %w", rule.ParentName, rule.ChildName, err)
		}
	}
	return nil
}

// ListStatuses returns a Project's Statuses ordered by position.
func (r *Projects) ListStatuses(ctx context.Context, projectID domain.ProjectID) ([]domain.Status, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, project_id::text, name, status_group, position, created_at
		FROM project_statuses
		WHERE project_id = $1
		ORDER BY position, id`,
		string(projectID))
	if err != nil {
		return nil, fmt.Errorf("list project statuses: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Status, error) {
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
	})
}

// ListWorkItemTypes returns a Project's Work Item Types ordered by position,
// each carrying its allowed Child Work Item Type IDs.
func (r *Projects) ListWorkItemTypes(ctx context.Context, projectID domain.ProjectID) ([]domain.WorkItemType, error) {
	items, err := r.queryWorkItemTypes(ctx, projectID)
	if err != nil {
		return nil, err
	}
	childrenByParent, err := r.queryHierarchy(ctx, projectID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if children, ok := childrenByParent[items[i].ID]; ok {
			items[i].AllowedChildTypeIDs = children
		}
	}
	return items, nil
}

func (r *Projects) queryWorkItemTypes(ctx context.Context, projectID domain.ProjectID) ([]domain.WorkItemType, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, project_id::text, name, estimate_unit, position, created_at
		FROM project_work_item_types
		WHERE project_id = $1
		ORDER BY position, id`,
		string(projectID))
	if err != nil {
		return nil, fmt.Errorf("list work item types: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.WorkItemType, error) {
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
	})
}

func (r *Projects) queryHierarchy(ctx context.Context, projectID domain.ProjectID) (map[domain.WorkItemTypeID][]domain.WorkItemTypeID, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT h.parent_type_id::text, h.child_type_id::text
		FROM project_work_item_type_hierarchy h
		JOIN project_work_item_types child ON child.id = h.child_type_id
		WHERE h.project_id = $1
		ORDER BY child.position, child.id`,
		string(projectID))
	if err != nil {
		return nil, fmt.Errorf("list work item type hierarchy: %w", err)
	}
	defer rows.Close()

	children := map[domain.WorkItemTypeID][]domain.WorkItemTypeID{}
	for rows.Next() {
		var parentID, childID string
		if err := rows.Scan(&parentID, &childID); err != nil {
			return nil, fmt.Errorf("scan work item type hierarchy: %w", err)
		}
		pid := domain.WorkItemTypeID(parentID)
		children[pid] = append(children[pid], domain.WorkItemTypeID(childID))
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate work item type hierarchy: %w", err)
	}
	return children, nil
}
