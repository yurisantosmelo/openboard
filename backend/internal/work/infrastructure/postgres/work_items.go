package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const workItemSelectColumns = `
	wi.id::text, wi.organization_id::text, wi.project_id::text,
	wi.work_item_type_id::text, wi.status_id::text,
	wi.parent_id::text, wi.assignee_id::text,
	COALESCE(u.username, ''), COALESCE(u.name, ''),
	wi.title, wi.description, wi.priority,
	wi.story_points::double precision, wi.hours::double precision,
	wi.created_by::text, wi.created_at, wi.updated_at`

// WorkItems stores Work Items in PostgreSQL.
type WorkItems struct {
	pool *pgxpool.Pool
}

// NewWorkItems returns a WorkItems repository backed by pool.
func NewWorkItems(pool *pgxpool.Pool) *WorkItems {
	return &WorkItems{pool: pool}
}

// Create inserts a new Work Item and returns it with assignee display details.
func (r *WorkItems) Create(ctx context.Context, in application.NewWorkItem) (domain.WorkItem, error) {
	row := r.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO work_items (
				organization_id, project_id, work_item_type_id, status_id,
				parent_id, assignee_id, title, description, priority,
				story_points, hours, created_by
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			RETURNING *
		)
		SELECT `+workItemSelectColumns+`
		FROM inserted wi
		LEFT JOIN users u ON u.id = wi.assignee_id`,
		string(in.OrganizationID), string(in.ProjectID), string(in.WorkItemTypeID), string(in.StatusID),
		nullableWorkItemID(in.ParentID), nullableUserID(in.AssigneeID), in.Title, in.Description, string(in.Priority),
		in.StoryPoints, in.Hours, string(in.CreatedBy))
	item, err := scanWorkItem(row)
	if err != nil {
		return domain.WorkItem{}, fmt.Errorf("create work item: %w", err)
	}
	return item, nil
}

// Find returns the Work Item with id, or domain.ErrWorkItemNotFound.
func (r *WorkItems) Find(ctx context.Context, id domain.WorkItemID) (domain.WorkItem, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+workItemSelectColumns+`
		FROM work_items wi
		LEFT JOIN users u ON u.id = wi.assignee_id
		WHERE wi.id = $1`, string(id))
	item, err := scanWorkItem(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkItem{}, domain.ErrWorkItemNotFound
	}
	if err != nil {
		return domain.WorkItem{}, fmt.Errorf("find work item: %w", err)
	}
	return item, nil
}

// List returns one filtered page of Work Items inside projectID ordered newest first.
func (r *WorkItems) List(
	ctx context.Context,
	projectID domain.ProjectID,
	filter application.WorkItemFilter,
	page application.PageRequest,
) ([]domain.WorkItem, int, error) {
	where, args := buildWorkItemFilter(projectID, filter)
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM work_items wi WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count work items: %w", err)
	}
	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	listArgs := append(args, page.Limit, page.Offset)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT `+workItemSelectColumns+`
		FROM work_items wi
		LEFT JOIN users u ON u.id = wi.assignee_id
		WHERE %s
		ORDER BY wi.created_at DESC, wi.id DESC
		LIMIT $%d OFFSET $%d`, where, limitPos, offsetPos), listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list work items: %w", err)
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.WorkItem, error) {
		return scanWorkItem(row)
	})
	if err != nil {
		return nil, 0, fmt.Errorf("scan work items: %w", err)
	}
	return items, total, nil
}

// Update saves the resolved mutable fields of a Work Item.
func (r *WorkItems) Update(ctx context.Context, in application.WorkItemUpdate) (domain.WorkItem, error) {
	row := r.pool.QueryRow(ctx, `
		WITH updated AS (
			UPDATE work_items
			SET work_item_type_id = $2,
			    parent_id         = $3,
			    assignee_id       = $4,
			    title             = $5,
			    description       = $6,
			    priority          = $7,
			    story_points      = $8,
			    hours             = $9,
			    updated_at        = NOW()
			WHERE id = $1
			RETURNING *
		)
		SELECT `+workItemSelectColumns+`
		FROM updated wi
		LEFT JOIN users u ON u.id = wi.assignee_id`,
		string(in.ID), string(in.WorkItemTypeID), nullableWorkItemID(in.ParentID), nullableUserID(in.AssigneeID),
		in.Title, in.Description, string(in.Priority), in.StoryPoints, in.Hours)
	item, err := scanWorkItem(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkItem{}, domain.ErrWorkItemNotFound
	}
	if err != nil {
		return domain.WorkItem{}, fmt.Errorf("update work item: %w", err)
	}
	return item, nil
}

// UpdateStatus transitions a Work Item to statusID.
func (r *WorkItems) UpdateStatus(ctx context.Context, id domain.WorkItemID, statusID domain.StatusID) (domain.WorkItem, error) {
	row := r.pool.QueryRow(ctx, `
		WITH updated AS (
			UPDATE work_items
			SET status_id = $2, updated_at = NOW()
			WHERE id = $1
			RETURNING *
		)
		SELECT `+workItemSelectColumns+`
		FROM updated wi
		LEFT JOIN users u ON u.id = wi.assignee_id`,
		string(id), string(statusID))
	item, err := scanWorkItem(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkItem{}, domain.ErrWorkItemNotFound
	}
	if err != nil {
		return domain.WorkItem{}, fmt.Errorf("transition work item: %w", err)
	}
	return item, nil
}

// Delete removes a Work Item immediately; Children keep existing with parent_id cleared.
func (r *WorkItems) Delete(ctx context.Context, id domain.WorkItemID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM work_items WHERE id = $1`, string(id))
	if err != nil {
		return fmt.Errorf("delete work item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrWorkItemNotFound
	}
	return nil
}

// AncestorIDs walks up parent_id and returns all ancestor Work Item IDs.
func (r *WorkItems) AncestorIDs(ctx context.Context, id domain.WorkItemID) ([]domain.WorkItemID, error) {
	rows, err := r.pool.Query(ctx, `
		WITH RECURSIVE ancestors AS (
			SELECT parent_id FROM work_items WHERE id = $1 AND parent_id IS NOT NULL
			UNION
			SELECT w.parent_id
			FROM work_items w
			JOIN ancestors a ON w.id = a.parent_id
			WHERE w.parent_id IS NOT NULL
		)
		SELECT parent_id::text FROM ancestors`, string(id))
	if err != nil {
		return nil, fmt.Errorf("list work item ancestors: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.WorkItemID, error) {
		var ancestorID string
		err := row.Scan(&ancestorID)
		return domain.WorkItemID(ancestorID), err
	})
}

// ListChildTypes returns the distinct Work Item Type IDs of direct Children of parentID.
func (r *WorkItems) ListChildTypes(ctx context.Context, parentID domain.WorkItemID) ([]domain.WorkItemTypeID, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT work_item_type_id::text
		FROM work_items
		WHERE parent_id = $1`, string(parentID))
	if err != nil {
		return nil, fmt.Errorf("list child work item types: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.WorkItemTypeID, error) {
		var typeID string
		err := row.Scan(&typeID)
		return domain.WorkItemTypeID(typeID), err
	})
}

// ClearAssigneeForUser unassigns a User from all Work Items (used on User deactivation).
func (r *WorkItems) ClearAssigneeForUser(ctx context.Context, userID domain.UserID) error {
	if _, err := r.pool.Exec(ctx, `
		UPDATE work_items
		SET assignee_id = NULL, updated_at = NOW()
		WHERE assignee_id = $1`, string(userID)); err != nil {
		return fmt.Errorf("clear assignee for user: %w", err)
	}
	return nil
}

// ClearInaccessibleAssigneesInWorkspace clears assignees on Work Items in workspaceID
// who can no longer enter that Workspace (for example, after removing a Workspace
// Membership or switching an Open Workspace to Restricted).
func (r *WorkItems) ClearInaccessibleAssigneesInWorkspace(ctx context.Context, workspaceID domain.WorkspaceID) error {
	if _, err := r.pool.Exec(ctx, `
		UPDATE work_items wi
		SET assignee_id = NULL, updated_at = NOW()
		FROM projects p
		JOIN workspaces w ON w.id = p.workspace_id
		WHERE wi.project_id = p.id
		  AND p.workspace_id = $1
		  AND wi.assignee_id IS NOT NULL
		  AND NOT `+assigneeCanEnterWorkspaceSQL, string(workspaceID)); err != nil {
		return fmt.Errorf("clear inaccessible assignees in workspace: %w", err)
	}
	return nil
}

// ClearInaccessibleAssigneesInOrganization clears assignees for userID on Work Items
// in orgID where userID can no longer enter the Project's Workspace (for example,
// after removing an Organization Membership).
func (r *WorkItems) ClearInaccessibleAssigneesInOrganization(ctx context.Context, orgID domain.OrganizationID, userID domain.UserID) error {
	if _, err := r.pool.Exec(ctx, `
		UPDATE work_items wi
		SET assignee_id = NULL, updated_at = NOW()
		FROM projects p
		JOIN workspaces w ON w.id = p.workspace_id
		WHERE wi.project_id = p.id
		  AND wi.organization_id = $1
		  AND wi.assignee_id = $2
		  AND NOT `+assigneeCanEnterWorkspaceSQL, string(orgID), string(userID)); err != nil {
		return fmt.Errorf("clear inaccessible assignees in organization: %w", err)
	}
	return nil
}

const assigneeCanEnterWorkspaceSQL = `(
	EXISTS (
		SELECT 1 FROM users u
		WHERE u.id = wi.assignee_id AND u.deactivated_at IS NULL AND u.is_administrator = TRUE
	)
	OR (
		EXISTS (
			SELECT 1 FROM users u
			WHERE u.id = wi.assignee_id AND u.deactivated_at IS NULL
		)
		AND (
			EXISTS (
				SELECT 1 FROM organization_memberships om
				WHERE om.organization_id = w.organization_id AND om.user_id = wi.assignee_id AND om.role = 'owner'
			)
			OR (
				w.visibility = 'open'
				AND EXISTS (
					SELECT 1 FROM organization_memberships om
					WHERE om.organization_id = w.organization_id AND om.user_id = wi.assignee_id
				)
			)
			OR EXISTS (
				SELECT 1 FROM workspace_memberships wm
				JOIN organization_memberships om
				  ON om.organization_id = w.organization_id AND om.user_id = wm.user_id
				WHERE wm.workspace_id = w.id AND wm.user_id = wi.assignee_id
			)
		)
	)
)`

func buildWorkItemFilter(projectID domain.ProjectID, f application.WorkItemFilter) (string, []any) {
	clauses := []string{"wi.project_id = $1"}
	args := []any{string(projectID)}
	appendClause := func(column string, val string) {
		args = append(args, val)
		clauses = append(clauses, fmt.Sprintf("%s = $%d", column, len(args)))
	}
	if f.StatusID != nil {
		appendClause("wi.status_id", string(*f.StatusID))
	}
	if f.WorkItemTypeID != nil {
		appendClause("wi.work_item_type_id", string(*f.WorkItemTypeID))
	}
	if f.Priority != nil {
		appendClause("wi.priority", string(*f.Priority))
	}
	if f.AssigneeID != nil {
		appendClause("wi.assignee_id", string(*f.AssigneeID))
	}
	return strings.Join(clauses, " AND "), args
}

func scanWorkItem(row pgx.Row) (domain.WorkItem, error) {
	var (
		w                                       domain.WorkItem
		id, orgID, projectID, typeID, statusID  string
		parentID, assigneeID                    *string
		priority, createdBy                     string
	)
	if err := row.Scan(
		&id, &orgID, &projectID, &typeID, &statusID,
		&parentID, &assigneeID,
		&w.AssigneeUsername, &w.AssigneeName,
		&w.Title, &w.Description, &priority,
		&w.StoryPoints, &w.Hours,
		&createdBy, &w.CreatedAt, &w.UpdatedAt,
	); err != nil {
		return domain.WorkItem{}, err
	}
	w.ID = domain.WorkItemID(id)
	w.OrganizationID = domain.OrganizationID(orgID)
	w.ProjectID = domain.ProjectID(projectID)
	w.WorkItemTypeID = domain.WorkItemTypeID(typeID)
	w.StatusID = domain.StatusID(statusID)
	w.Priority = domain.Priority(priority)
	w.CreatedBy = domain.UserID(createdBy)
	if parentID != nil {
		pid := domain.WorkItemID(*parentID)
		w.ParentID = &pid
	}
	if assigneeID != nil {
		aid := domain.UserID(*assigneeID)
		w.AssigneeID = &aid
	}
	return w, nil
}

func nullableWorkItemID(id *domain.WorkItemID) *string {
	if id == nil {
		return nil
	}
	s := string(*id)
	return &s
}

func nullableUserID(id *domain.UserID) *string {
	if id == nil {
		return nil
	}
	s := string(*id)
	return &s
}
