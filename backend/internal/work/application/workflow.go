package application

import (
	"context"
	"errors"
	"slices"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// CreateStatusInput is the raw request to add a Status to a Project.
type CreateStatusInput struct {
	ProjectID string
	Name      string
	Group     string
	Position  *int
}

// UpdateStatusInput is the raw request to partially update a Project Status.
type UpdateStatusInput struct {
	ProjectID string
	StatusID  string
	Name      *string
	Group     *string
	Position  *int
}

// CreateWorkItemTypeInput is the raw request to add a Work Item Type to a Project.
type CreateWorkItemTypeInput struct {
	ProjectID           string
	Name                string
	EstimateUnit        string
	Position            *int
	AllowedChildTypeIDs []string
}

// UpdateWorkItemTypeInput is the raw request to partially update a Work Item Type.
type UpdateWorkItemTypeInput struct {
	ProjectID           string
	WorkItemTypeID      string
	Name                *string
	EstimateUnit        *string
	Position            *int
	AllowedChildTypeIDs *[]string
}

// WorkflowService runs Project workflow customization use cases (Statuses,
// Work Item Types, hierarchy and Transition Rules). Only Workspace Owners may
// mutate a Project's workflow (CONTEXT.md, ADR 0010).
type WorkflowService struct {
	projects   ProjectRepository
	workflow   WorkflowRepository
	workspaces WorkspaceAccessChecker
}

// NewWorkflowService builds a WorkflowService from its dependencies.
func NewWorkflowService(
	projects ProjectRepository,
	workflow WorkflowRepository,
	workspaces WorkspaceAccessChecker,
) *WorkflowService {
	return &WorkflowService{projects: projects, workflow: workflow, workspaces: workspaces}
}

// ListStatuses returns the Statuses of a Project the Actor can see.
func (s *WorkflowService) ListStatuses(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.Status, error) {
	project, err := s.projectForViewer(ctx, actor, rawProjectID)
	if err != nil {
		return nil, err
	}
	return s.projects.ListStatuses(ctx, project.ID)
}

// ListWorkItemTypes returns the Work Item Types (with hierarchy) of a Project
// the Actor can see.
func (s *WorkflowService) ListWorkItemTypes(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.WorkItemType, error) {
	project, err := s.projectForViewer(ctx, actor, rawProjectID)
	if err != nil {
		return nil, err
	}
	return s.projects.ListWorkItemTypes(ctx, project.ID)
}

// CreateStatus adds a new Status to a Project managed by actor.
func (s *WorkflowService) CreateStatus(ctx context.Context, actor domain.Actor, in CreateStatusInput) (domain.Status, error) {
	project, err := s.projectForOwner(ctx, actor, in.ProjectID)
	if err != nil {
		return domain.Status{}, err
	}
	name, nameErr := domain.ParseStatusName(in.Name)
	group, groupErr := domain.ParseStatusGroup(in.Group)
	pos, posErr := parseOptionalPosition(in.Position)
	if err := errors.Join(nameErr, groupErr, posErr); err != nil {
		return domain.Status{}, err
	}
	if in.Position == nil {
		statuses, err := s.projects.ListStatuses(ctx, project.ID)
		if err != nil {
			return domain.Status{}, err
		}
		pos = nextStatusPosition(statuses)
	}
	return s.workflow.CreateStatus(ctx, NewStatus{
		ProjectID: project.ID,
		Name:      name,
		Group:     group,
		Position:  pos,
	})
}

// UpdateStatus modifies a Project Status while preserving at least one
// Not Committed Status and one Completed Status.
func (s *WorkflowService) UpdateStatus(ctx context.Context, actor domain.Actor, in UpdateStatusInput) (domain.Status, error) {
	statusID, err := domain.ParseStatusID(in.StatusID)
	if err != nil {
		return domain.Status{}, err
	}
	project, err := s.projectForOwner(ctx, actor, in.ProjectID)
	if err != nil {
		return domain.Status{}, err
	}
	statuses, err := s.projects.ListStatuses(ctx, project.ID)
	if err != nil {
		return domain.Status{}, err
	}
	current, ok := findStatus(statuses, statusID)
	if !ok {
		return domain.Status{}, domain.ErrStatusNotFound
	}
	next, err := buildStatusUpdate(current, in)
	if err != nil {
		return domain.Status{}, err
	}
	if next.Group != current.Group && !domain.CanChangeStatusGroup(statuses, current.ID, next.Group) {
		return domain.Status{}, domain.ErrMinimumStatusGroupRequired
	}
	return s.workflow.UpdateStatus(ctx, next)
}

// DeleteStatus removes a Status after reassigning its Work Items to another
// Status in the same Project, while preserving required Status Groups.
func (s *WorkflowService) DeleteStatus(ctx context.Context, actor domain.Actor, rawProjectID, rawStatusID, rawReplacementID string) error {
	statusID, err := domain.ParseStatusID(rawStatusID)
	if err != nil {
		return err
	}
	replacementID, err := parseReplacementStatusRef(rawReplacementID)
	if err != nil {
		return err
	}
	project, err := s.projectForOwner(ctx, actor, rawProjectID)
	if err != nil {
		return err
	}
	statuses, err := s.projects.ListStatuses(ctx, project.ID)
	if err != nil {
		return err
	}
	if _, ok := findStatus(statuses, statusID); !ok {
		return domain.ErrStatusNotFound
	}
	if replacementID == statusID || !hasStatus(statuses, replacementID) {
		return domain.ErrInvalidReplacementStatus
	}
	if !domain.CanRemoveStatus(statuses, statusID) {
		return domain.ErrMinimumStatusGroupRequired
	}
	return s.workflow.DeleteStatus(ctx, project.ID, statusID, replacementID)
}

// CreateWorkItemType adds a Work Item Type and optional allowed Child types.
func (s *WorkflowService) CreateWorkItemType(ctx context.Context, actor domain.Actor, in CreateWorkItemTypeInput) (domain.WorkItemType, error) {
	project, err := s.projectForOwner(ctx, actor, in.ProjectID)
	if err != nil {
		return domain.WorkItemType{}, err
	}
	name, nameErr := domain.ParseWorkItemTypeName(in.Name)
	unit, unitErr := domain.ParseEstimateUnit(in.EstimateUnit)
	pos, posErr := parseOptionalPosition(in.Position)
	if err := errors.Join(nameErr, unitErr, posErr); err != nil {
		return domain.WorkItemType{}, err
	}
	existing, err := s.projects.ListWorkItemTypes(ctx, project.ID)
	if err != nil {
		return domain.WorkItemType{}, err
	}
	childIDs, err := parseAllowedChildTypes(in.AllowedChildTypeIDs, existing, "")
	if err != nil {
		return domain.WorkItemType{}, err
	}
	if in.Position == nil {
		pos = nextWorkItemTypePosition(existing)
	}
	return s.workflow.CreateWorkItemType(ctx, NewWorkItemType{
		ProjectID:           project.ID,
		Name:                name,
		EstimateUnit:        unit,
		Position:            pos,
		AllowedChildTypeIDs: childIDs,
	})
}

// UpdateWorkItemType modifies a Work Item Type, its estimate unit or allowed
// Child types, cleaning up incompatible Work Item estimates or Parent links.
func (s *WorkflowService) UpdateWorkItemType(ctx context.Context, actor domain.Actor, in UpdateWorkItemTypeInput) (domain.WorkItemType, error) {
	typeID, err := domain.ParseWorkItemTypeID(in.WorkItemTypeID)
	if err != nil {
		return domain.WorkItemType{}, err
	}
	project, err := s.projectForOwner(ctx, actor, in.ProjectID)
	if err != nil {
		return domain.WorkItemType{}, err
	}
	existing, err := s.projects.ListWorkItemTypes(ctx, project.ID)
	if err != nil {
		return domain.WorkItemType{}, err
	}
	current, ok := findWorkItemType(existing, typeID)
	if !ok {
		return domain.WorkItemType{}, domain.ErrWorkItemTypeNotFound
	}
	next, err := buildWorkItemTypeUpdate(current, existing, in)
	if err != nil {
		return domain.WorkItemType{}, err
	}
	return s.workflow.UpdateWorkItemType(ctx, next)
}

// DeleteWorkItemType removes a Work Item Type after moving its Work Items to a
// replacement type in the same Project (CONTEXT.md line 287).
func (s *WorkflowService) DeleteWorkItemType(ctx context.Context, actor domain.Actor, rawProjectID, rawTypeID, rawReplacementID string) error {
	typeID, err := domain.ParseWorkItemTypeID(rawTypeID)
	if err != nil {
		return err
	}
	replacementID, err := parseReplacementTypeRef(rawReplacementID)
	if err != nil {
		return err
	}
	project, err := s.projectForOwner(ctx, actor, rawProjectID)
	if err != nil {
		return err
	}
	existing, err := s.projects.ListWorkItemTypes(ctx, project.ID)
	if err != nil {
		return err
	}
	if _, ok := findWorkItemType(existing, typeID); !ok {
		return domain.ErrWorkItemTypeNotFound
	}
	replacement, ok := findWorkItemType(existing, replacementID)
	if !ok || replacementID == typeID {
		return domain.ErrInvalidReplacementType
	}
	return s.workflow.DeleteWorkItemType(ctx, project.ID, typeID, replacementID, replacement.EstimateUnit)
}

// ListTransitionRules returns the optional Transition Rules configured on a Project.
func (s *WorkflowService) ListTransitionRules(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.TransitionRule, error) {
	project, err := s.projectForViewer(ctx, actor, rawProjectID)
	if err != nil {
		return nil, err
	}
	return s.workflow.ListTransitionRules(ctx, project.ID)
}

// AddTransitionRule registers an allowed Status transition from rawFromID to rawToID.
func (s *WorkflowService) AddTransitionRule(ctx context.Context, actor domain.Actor, rawProjectID, rawFromID, rawToID string) (domain.TransitionRule, error) {
	fromID, fromErr := domain.ParseStatusRef(rawFromID)
	toID, toErr := domain.ParseStatusRef(rawToID)
	if fromErr != nil || toErr != nil || fromID == toID {
		return domain.TransitionRule{}, domain.ErrInvalidTransitionRule
	}
	project, err := s.projectForOwner(ctx, actor, rawProjectID)
	if err != nil {
		return domain.TransitionRule{}, err
	}
	statuses, err := s.projects.ListStatuses(ctx, project.ID)
	if err != nil {
		return domain.TransitionRule{}, err
	}
	if !hasStatus(statuses, fromID) || !hasStatus(statuses, toID) {
		return domain.TransitionRule{}, domain.ErrInvalidTransitionRule
	}
	return s.workflow.AddTransitionRule(ctx, project.ID, fromID, toID)
}

// RemoveTransitionRule deletes one Transition Rule from a Project.
func (s *WorkflowService) RemoveTransitionRule(ctx context.Context, actor domain.Actor, rawProjectID, rawFromID, rawToID string) error {
	fromID, fromErr := domain.ParseStatusID(rawFromID)
	toID, toErr := domain.ParseStatusID(rawToID)
	if fromErr != nil || toErr != nil {
		return domain.ErrTransitionRuleNotFound
	}
	project, err := s.projectForOwner(ctx, actor, rawProjectID)
	if err != nil {
		return err
	}
	return s.workflow.RemoveTransitionRule(ctx, project.ID, fromID, toID)
}

func (s *WorkflowService) projectForViewer(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
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
	project.WorkspaceArchived = access.Archived
	return project, nil
}

func (s *WorkflowService) projectForOwner(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	project, err := s.projectForViewer(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	if !project.ViewerRole.CanManageProject() {
		return domain.Project{}, domain.ErrForbidden
	}
	if project.IsReadOnly() {
		return domain.Project{}, domain.ErrProjectReadOnly
	}
	return project, nil
}

func buildStatusUpdate(current domain.Status, in UpdateStatusInput) (StatusUpdate, error) {
	next := StatusUpdate{
		ProjectID: current.ProjectID,
		ID:        current.ID,
		Name:      current.Name,
		Group:     current.Group,
		Position:  current.Position,
	}
	var nameErr, groupErr, posErr error
	if in.Name != nil {
		next.Name, nameErr = domain.ParseStatusName(*in.Name)
	}
	if in.Group != nil {
		next.Group, groupErr = domain.ParseStatusGroup(*in.Group)
	}
	if in.Position != nil {
		next.Position, posErr = domain.ParsePosition(*in.Position)
	}
	return next, errors.Join(nameErr, groupErr, posErr)
}

func buildWorkItemTypeUpdate(
	current domain.WorkItemType,
	existing []domain.WorkItemType,
	in UpdateWorkItemTypeInput,
) (WorkItemTypeUpdate, error) {
	next := WorkItemTypeUpdate{
		ProjectID:    current.ProjectID,
		ID:           current.ID,
		Name:         current.Name,
		EstimateUnit: current.EstimateUnit,
		Position:     current.Position,
	}
	var nameErr, unitErr, posErr, childErr error
	if in.Name != nil {
		next.Name, nameErr = domain.ParseWorkItemTypeName(*in.Name)
	}
	if in.EstimateUnit != nil {
		next.EstimateUnit, unitErr = domain.ParseEstimateUnit(*in.EstimateUnit)
		next.EstimateUnitChanged = next.EstimateUnit != current.EstimateUnit
	}
	if in.Position != nil {
		next.Position, posErr = domain.ParsePosition(*in.Position)
	}
	if in.AllowedChildTypeIDs != nil {
		next.UpdateHierarchy = true
		next.AllowedChildTypeIDs, childErr = parseAllowedChildTypes(*in.AllowedChildTypeIDs, existing, current.ID)
	}
	return next, errors.Join(nameErr, unitErr, posErr, childErr)
}

func parseAllowedChildTypes(raw []string, existing []domain.WorkItemType, selfID domain.WorkItemTypeID) ([]domain.WorkItemTypeID, error) {
	out := make([]domain.WorkItemTypeID, 0, len(raw))
	for _, s := range raw {
		id, err := domain.ParseWorkItemTypeRef(s)
		if err != nil || id == selfID {
			return nil, domain.ErrInvalidHierarchy
		}
		if _, ok := findWorkItemType(existing, id); !ok {
			return nil, domain.ErrInvalidHierarchy
		}
		if !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out, nil
}

func parseOptionalPosition(pos *int) (int, error) {
	if pos == nil {
		return 0, nil
	}
	return domain.ParsePosition(*pos)
}

func parseReplacementStatusRef(raw string) (domain.StatusID, error) {
	id, err := domain.ParseStatusRef(raw)
	if err != nil {
		return "", domain.ErrInvalidReplacementStatus
	}
	return id, nil
}

func parseReplacementTypeRef(raw string) (domain.WorkItemTypeID, error) {
	id, err := domain.ParseWorkItemTypeRef(raw)
	if err != nil {
		return "", domain.ErrInvalidReplacementType
	}
	return id, nil
}

func findStatus(statuses []domain.Status, id domain.StatusID) (domain.Status, bool) {
	for _, s := range statuses {
		if s.ID == id {
			return s, true
		}
	}
	return domain.Status{}, false
}

func nextStatusPosition(statuses []domain.Status) int {
	next := 0
	for _, s := range statuses {
		if s.Position >= next {
			next = s.Position + 1
		}
	}
	return next
}

func nextWorkItemTypePosition(types []domain.WorkItemType) int {
	next := 0
	for _, t := range types {
		if t.Position >= next {
			next = t.Position + 1
		}
	}
	return next
}
