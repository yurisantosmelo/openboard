package application

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// CreateWorkItemInput is the raw request to create a Work Item inside a Project.
type CreateWorkItemInput struct {
	ProjectID      string
	WorkItemTypeID string
	StatusID       *string
	ParentID       *string
	AssigneeID     *string
	Title          string
	Description    string
	Priority       string
	StoryPoints    *float64
	Hours          *float64
}

// ListWorkItemsFilter holds optional raw query filters for listing Work Items.
type ListWorkItemsFilter struct {
	StatusID       string
	WorkItemTypeID string
	Priority       string
	AssigneeID     string
}

// UpdateWorkItemInput is the raw request to partially update a Work Item.
type UpdateWorkItemInput struct {
	ID             string
	Title          *string
	Description    *string
	Priority       *string
	WorkItemTypeID *string
	ParentID       Optional[string]
	AssigneeID     Optional[string]
	StoryPoints    Optional[float64]
	Hours          Optional[float64]
}

// WorkItemService runs the Work Item use cases (CRUD and Status transitions).
type WorkItemService struct {
	projects   ProjectRepository
	items      WorkItemRepository
	workspaces WorkspaceAccessChecker
	assignees  AssigneeChecker
}

// NewWorkItemService builds a WorkItemService from its dependencies.
func NewWorkItemService(
	projects ProjectRepository,
	items WorkItemRepository,
	workspaces WorkspaceAccessChecker,
	assignees AssigneeChecker,
) *WorkItemService {
	return &WorkItemService{
		projects:   projects,
		items:      items,
		workspaces: workspaces,
		assignees:  assignees,
	}
}

// CreateWorkItem validates and creates a new Work Item inside a Project.
func (s *WorkItemService) CreateWorkItem(ctx context.Context, actor domain.Actor, in CreateWorkItemInput) (domain.WorkItem, error) {
	project, err := s.projectWithAccess(ctx, actor, in.ProjectID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	if !project.ViewerRole.CanWriteWorkItems() {
		return domain.WorkItem{}, domain.ErrForbidden
	}
	parsed, err := parseCreateWorkItem(in)
	if err != nil {
		return domain.WorkItem{}, err
	}
	types, err := s.projects.ListWorkItemTypes(ctx, project.ID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	wt, ok := findWorkItemType(types, parsed.workItemTypeID)
	if !ok {
		return domain.WorkItem{}, domain.ErrInvalidWorkItemType
	}
	statusID, err := s.resolveInitialStatus(ctx, project.ID, parsed.statusID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	if err := s.validateWorkItemRelations(ctx, project, nil, wt, parsed.parentID, parsed.assigneeID, parsed.storyPoints, parsed.hours, types); err != nil {
		return domain.WorkItem{}, err
	}
	created, err := s.items.Create(ctx, NewWorkItem{
		OrganizationID: project.OrganizationID,
		ProjectID:      project.ID,
		WorkItemTypeID: wt.ID,
		StatusID:       statusID,
		ParentID:       parsed.parentID,
		AssigneeID:     parsed.assigneeID,
		Title:          parsed.title,
		Description:    in.Description,
		Priority:       parsed.priority,
		StoryPoints:    parsed.storyPoints,
		Hours:          parsed.hours,
		CreatedBy:      actor.UserID,
	})
	if err != nil {
		return domain.WorkItem{}, err
	}
	created.ViewerRole = project.ViewerRole
	return created, nil
}

// ListWorkItems returns one filtered page of Work Items inside a Project the
// Actor can see, along with the total matching count.
func (s *WorkItemService) ListWorkItems(
	ctx context.Context,
	actor domain.Actor,
	rawProjectID string,
	rawFilter ListWorkItemsFilter,
	page PageRequest,
) ([]domain.WorkItem, int, error) {
	filter, err := parseListWorkItemsFilter(rawFilter)
	if err != nil {
		return nil, 0, err
	}
	project, err := s.projectWithAccess(ctx, actor, rawProjectID)
	if err != nil {
		return nil, 0, err
	}
	items, total, err := s.items.List(ctx, project.ID, filter, page)
	if err != nil {
		return nil, 0, err
	}
	for i := range items {
		items[i].ViewerRole = project.ViewerRole
	}
	return items, total, nil
}

// GetWorkItem returns a single Work Item the Actor can see, or
// domain.ErrWorkItemNotFound without leaking existence (ADR 0003).
func (s *WorkItemService) GetWorkItem(ctx context.Context, actor domain.Actor, rawWorkItemID string) (domain.WorkItem, error) {
	item, _, err := s.workItemWithAccess(ctx, actor, rawWorkItemID)
	return item, err
}

// UpdateWorkItem applies partial changes to a Work Item, validating Priority,
// estimate unit, hierarchy, cycle prevention and Assignee Workspace access.
func (s *WorkItemService) UpdateWorkItem(ctx context.Context, actor domain.Actor, in UpdateWorkItemInput) (domain.WorkItem, error) {
	current, project, err := s.workItemWithAccess(ctx, actor, in.ID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	if !project.ViewerRole.CanWriteWorkItems() {
		return domain.WorkItem{}, domain.ErrForbidden
	}
	next, err := buildWorkItemUpdate(current, in)
	if err != nil {
		return domain.WorkItem{}, err
	}
	types, err := s.projects.ListWorkItemTypes(ctx, project.ID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	wt, ok := findWorkItemType(types, next.WorkItemTypeID)
	if !ok {
		return domain.WorkItem{}, domain.ErrInvalidWorkItemType
	}
	if next.WorkItemTypeID != current.WorkItemTypeID {
		if err := s.validateChildrenAllowType(ctx, current.ID, wt); err != nil {
			return domain.WorkItem{}, err
		}
	}
	if err := s.validateWorkItemRelations(ctx, project, &current.ID, wt, next.ParentID, next.AssigneeID, next.StoryPoints, next.Hours, types); err != nil {
		return domain.WorkItem{}, err
	}
	updated, err := s.items.Update(ctx, next)
	if err != nil {
		return domain.WorkItem{}, err
	}
	updated.ViewerRole = project.ViewerRole
	return updated, nil
}

// TransitionWorkItem moves a Work Item to another Status inside its Project.
func (s *WorkItemService) TransitionWorkItem(ctx context.Context, actor domain.Actor, rawWorkItemID, rawStatusID string) (domain.WorkItem, error) {
	statusID, err := domain.ParseStatusRef(rawStatusID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	current, project, err := s.workItemWithAccess(ctx, actor, rawWorkItemID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	if !project.ViewerRole.CanWriteWorkItems() {
		return domain.WorkItem{}, domain.ErrForbidden
	}
	statuses, err := s.projects.ListStatuses(ctx, project.ID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	if !hasStatus(statuses, statusID) {
		return domain.WorkItem{}, domain.ErrInvalidStatus
	}
	updated, err := s.items.UpdateStatus(ctx, current.ID, statusID)
	if err != nil {
		return domain.WorkItem{}, err
	}
	updated.ViewerRole = project.ViewerRole
	return updated, nil
}

// DeleteWorkItem immediately deletes a Work Item. Any Children keep existing
// with their Parent cleared by the database constraint.
func (s *WorkItemService) DeleteWorkItem(ctx context.Context, actor domain.Actor, rawWorkItemID string) error {
	current, project, err := s.workItemWithAccess(ctx, actor, rawWorkItemID)
	if err != nil {
		return err
	}
	if !project.ViewerRole.CanWriteWorkItems() {
		return domain.ErrForbidden
	}
	return s.items.Delete(ctx, current.ID)
}

func (s *WorkItemService) projectWithAccess(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	projectID, err := domain.ParseProjectID(rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	project, err := s.projects.Find(ctx, projectID)
	if err != nil {
		return domain.Project{}, err
	}
	access, err := s.workspaces.Access(ctx, actor, project.WorkspaceID)
	if errors.Is(err, domain.ErrWorkspaceNotFound) {
		return domain.Project{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Project{}, err
	}
	project.ViewerRole = access.Role
	return project, nil
}

func (s *WorkItemService) workItemWithAccess(ctx context.Context, actor domain.Actor, rawID string) (domain.WorkItem, domain.Project, error) {
	id, err := domain.ParseWorkItemID(rawID)
	if err != nil {
		return domain.WorkItem{}, domain.Project{}, err
	}
	item, err := s.items.Find(ctx, id)
	if err != nil {
		return domain.WorkItem{}, domain.Project{}, err
	}
	project, err := s.projects.Find(ctx, item.ProjectID)
	if err != nil {
		return domain.WorkItem{}, domain.Project{}, err
	}
	access, err := s.workspaces.Access(ctx, actor, project.WorkspaceID)
	if errors.Is(err, domain.ErrWorkspaceNotFound) {
		return domain.WorkItem{}, domain.Project{}, domain.ErrWorkItemNotFound
	}
	if err != nil {
		return domain.WorkItem{}, domain.Project{}, err
	}
	project.ViewerRole = access.Role
	item.ViewerRole = access.Role
	return item, project, nil
}

func (s *WorkItemService) resolveInitialStatus(ctx context.Context, projectID domain.ProjectID, requested *domain.StatusID) (domain.StatusID, error) {
	statuses, err := s.projects.ListStatuses(ctx, projectID)
	if err != nil {
		return "", err
	}
	if requested != nil {
		if !hasStatus(statuses, *requested) {
			return "", domain.ErrInvalidStatus
		}
		return *requested, nil
	}
	def, ok := domain.DefaultInitialStatus(statuses)
	if !ok {
		return "", domain.ErrInvalidStatus
	}
	return def.ID, nil
}

func (s *WorkItemService) validateWorkItemRelations(
	ctx context.Context,
	project domain.Project,
	selfID *domain.WorkItemID,
	wt domain.WorkItemType,
	parentID *domain.WorkItemID,
	assigneeID *domain.UserID,
	storyPoints *float64,
	hours *float64,
	types []domain.WorkItemType,
) error {
	if err := domain.ValidateEstimate(wt.EstimateUnit, storyPoints, hours); err != nil {
		return err
	}
	if parentID != nil {
		if err := s.validateParent(ctx, project.ID, selfID, wt.ID, *parentID, types); err != nil {
			return err
		}
	}
	if assigneeID != nil {
		if err := s.validateAssignee(ctx, project.WorkspaceID, *assigneeID); err != nil {
			return err
		}
	}
	return nil
}

func (s *WorkItemService) validateParent(
	ctx context.Context,
	projectID domain.ProjectID,
	selfID *domain.WorkItemID,
	childTypeID domain.WorkItemTypeID,
	parentID domain.WorkItemID,
	types []domain.WorkItemType,
) error {
	if selfID != nil && *selfID == parentID {
		return domain.ErrParentCycle
	}
	parent, err := s.items.Find(ctx, parentID)
	if errors.Is(err, domain.ErrWorkItemNotFound) {
		return domain.ErrInvalidParent
	}
	if err != nil {
		return err
	}
	if parent.ProjectID != projectID {
		return domain.ErrInvalidParent
	}
	parentType, ok := findWorkItemType(types, parent.WorkItemTypeID)
	if !ok || !parentType.AllowsChildType(childTypeID) {
		return domain.ErrInvalidParent
	}
	if selfID != nil {
		return s.checkParentCycle(ctx, *selfID, parentID)
	}
	return nil
}

func (s *WorkItemService) checkParentCycle(ctx context.Context, selfID, parentID domain.WorkItemID) error {
	ancestors, err := s.items.AncestorIDs(ctx, parentID)
	if err != nil {
		return err
	}
	if slices.Contains(ancestors, selfID) {
		return domain.ErrParentCycle
	}
	return nil
}

func (s *WorkItemService) validateChildrenAllowType(ctx context.Context, itemID domain.WorkItemID, newType domain.WorkItemType) error {
	childTypes, err := s.items.ListChildTypes(ctx, itemID)
	if err != nil {
		return err
	}
	for _, ct := range childTypes {
		if !newType.AllowsChildType(ct) {
			return domain.ErrInvalidWorkItemType
		}
	}
	return nil
}

func (s *WorkItemService) validateAssignee(ctx context.Context, workspaceID domain.WorkspaceID, userID domain.UserID) error {
	ok, err := s.assignees.CanBeAssigned(ctx, userID, workspaceID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrInvalidAssignee
	}
	return nil
}

type parsedCreateWorkItem struct {
	title          string
	workItemTypeID domain.WorkItemTypeID
	statusID       *domain.StatusID
	parentID       *domain.WorkItemID
	assigneeID     *domain.UserID
	priority       domain.Priority
	storyPoints    *float64
	hours          *float64
}

func parseCreateWorkItem(in CreateWorkItemInput) (parsedCreateWorkItem, error) {
	title, titleErr := domain.ParseWorkItemTitle(in.Title)
	wtID, wtErr := domain.ParseWorkItemTypeRef(in.WorkItemTypeID)
	priority, prioErr := domain.ParseOptionalPriority(in.Priority)
	statusID, statusErr := parseOptionalStatusRef(in.StatusID)
	parentID, parentErr := parseOptionalParentRef(in.ParentID)
	assigneeID, assigneeErr := parseOptionalAssigneeRef(in.AssigneeID)
	if err := errors.Join(titleErr, wtErr, prioErr, statusErr, parentErr, assigneeErr); err != nil {
		return parsedCreateWorkItem{}, err
	}
	return parsedCreateWorkItem{
		title:          title,
		workItemTypeID: wtID,
		statusID:       statusID,
		parentID:       parentID,
		assigneeID:     assigneeID,
		priority:       priority,
		storyPoints:    in.StoryPoints,
		hours:          in.Hours,
	}, nil
}

func parseListWorkItemsFilter(raw ListWorkItemsFilter) (WorkItemFilter, error) {
	var (
		filter                                 WorkItemFilter
		statusErr, typeErr, prioErr, assignErr error
	)
	if strings.TrimSpace(raw.StatusID) != "" {
		id, err := domain.ParseStatusRef(raw.StatusID)
		statusErr = err
		filter.StatusID = &id
	}
	if strings.TrimSpace(raw.WorkItemTypeID) != "" {
		id, err := domain.ParseWorkItemTypeRef(raw.WorkItemTypeID)
		typeErr = err
		filter.WorkItemTypeID = &id
	}
	if strings.TrimSpace(raw.Priority) != "" {
		p, err := domain.ParsePriority(raw.Priority)
		prioErr = err
		filter.Priority = &p
	}
	if strings.TrimSpace(raw.AssigneeID) != "" {
		id, err := domain.ParseAssigneeRef(raw.AssigneeID)
		assignErr = err
		filter.AssigneeID = &id
	}
	return filter, errors.Join(statusErr, typeErr, prioErr, assignErr)
}

func buildWorkItemUpdate(current domain.WorkItem, in UpdateWorkItemInput) (WorkItemUpdate, error) {
	next := WorkItemUpdate{
		ID:             current.ID,
		WorkItemTypeID: current.WorkItemTypeID,
		ParentID:       current.ParentID,
		AssigneeID:     current.AssigneeID,
		Title:          current.Title,
		Description:    current.Description,
		Priority:       current.Priority,
		StoryPoints:    current.StoryPoints,
		Hours:          current.Hours,
	}
	if in.Description != nil {
		next.Description = *in.Description
	}
	if in.StoryPoints.Set {
		next.StoryPoints = in.StoryPoints.Value
	}
	if in.Hours.Set {
		next.Hours = in.Hours.Value
	}
	err := errors.Join(
		applyTitlePatch(&next, in.Title),
		applyPriorityPatch(&next, in.Priority),
		applyTypePatch(&next, in.WorkItemTypeID),
		applyParentPatch(&next, in.ParentID),
		applyAssigneePatch(&next, in.AssigneeID),
	)
	return next, err
}

func applyTitlePatch(next *WorkItemUpdate, raw *string) error {
	if raw == nil {
		return nil
	}
	title, err := domain.ParseWorkItemTitle(*raw)
	if err == nil {
		next.Title = title
	}
	return err
}

func applyPriorityPatch(next *WorkItemUpdate, raw *string) error {
	if raw == nil {
		return nil
	}
	p, err := domain.ParsePriority(*raw)
	if err == nil {
		next.Priority = p
	}
	return err
}

func applyTypePatch(next *WorkItemUpdate, raw *string) error {
	if raw == nil {
		return nil
	}
	id, err := domain.ParseWorkItemTypeRef(*raw)
	if err == nil {
		next.WorkItemTypeID = id
	}
	return err
}

func applyParentPatch(next *WorkItemUpdate, raw Optional[string]) error {
	if !raw.Set {
		return nil
	}
	id, err := parseOptionalParentRef(raw.Value)
	if err == nil {
		next.ParentID = id
	}
	return err
}

func applyAssigneePatch(next *WorkItemUpdate, raw Optional[string]) error {
	if !raw.Set {
		return nil
	}
	id, err := parseOptionalAssigneeRef(raw.Value)
	if err == nil {
		next.AssigneeID = id
	}
	return err
}

func parseOptionalStatusRef(raw *string) (*domain.StatusID, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	id, err := domain.ParseStatusRef(*raw)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func parseOptionalParentRef(raw *string) (*domain.WorkItemID, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	id, err := domain.ParseParentRef(*raw)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func parseOptionalAssigneeRef(raw *string) (*domain.UserID, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	id, err := domain.ParseAssigneeRef(*raw)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func findWorkItemType(types []domain.WorkItemType, id domain.WorkItemTypeID) (domain.WorkItemType, bool) {
	for _, t := range types {
		if t.ID == id {
			return t, true
		}
	}
	return domain.WorkItemType{}, false
}

func hasStatus(statuses []domain.Status, id domain.StatusID) bool {
	for _, s := range statuses {
		if s.ID == id {
			return true
		}
	}
	return false
}
