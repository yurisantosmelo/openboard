package application

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// CreateEraInput is the raw request to create a Planned Era in a Project.
type CreateEraInput struct {
	ProjectID string
	Name      string
	Goal      string
	StartDate string
	EndDate   string
}

// UpdateEraInput is the raw request to update a Planned or Active Era.
type UpdateEraInput struct {
	ProjectID string
	EraID     string
	Name      *string
	Goal      *string
	StartDate *string
	EndDate   *string
}

// EraService runs Project Era lifecycle use cases (Planned -> Active -> Completed).
type EraService struct {
	projects   ProjectRepository
	eras       EraRepository
	workspaces WorkspaceAccessChecker
	now        func() time.Time
}

// NewEraService builds an EraService from its dependencies.
func NewEraService(
	projects ProjectRepository,
	eras EraRepository,
	workspaces WorkspaceAccessChecker,
) *EraService {
	return &EraService{projects: projects, eras: eras, workspaces: workspaces, now: time.Now}
}

// ListEras returns all Eras of a Project the Actor can see, ordered by start date.
func (s *EraService) ListEras(ctx context.Context, actor domain.Actor, rawProjectID string) ([]domain.Era, error) {
	project, err := s.projectForViewer(ctx, actor, rawProjectID)
	if err != nil {
		return nil, err
	}
	return s.eras.List(ctx, project.ID)
}

// CreateEra adds a Planned Era whose date range does not overlap any existing Era.
func (s *EraService) CreateEra(ctx context.Context, actor domain.Actor, in CreateEraInput) (domain.Era, error) {
	project, err := s.projectForWriter(ctx, actor, in.ProjectID)
	if err != nil {
		return domain.Era{}, err
	}
	name, nameErr := domain.ParseEraName(in.Name)
	start, end, dateErr := domain.ParseEraDates(in.StartDate, in.EndDate)
	if err := errors.Join(nameErr, dateErr); err != nil {
		return domain.Era{}, err
	}
	existing, err := s.eras.List(ctx, project.ID)
	if err != nil {
		return domain.Era{}, err
	}
	if domain.HasOverlappingEra(existing, "", start, end) {
		return domain.Era{}, domain.ErrEraOverlap
	}
	return s.eras.Create(ctx, NewEra{
		ProjectID: project.ID,
		Name:      name,
		Goal:      strings.TrimSpace(in.Goal),
		StartDate: start,
		EndDate:   end,
	})
}

// UpdateEra edits a Planned or Active Era while preserving non-overlapping dates.
func (s *EraService) UpdateEra(ctx context.Context, actor domain.Actor, in UpdateEraInput) (domain.Era, error) {
	eraID, err := domain.ParseEraID(in.EraID)
	if err != nil {
		return domain.Era{}, err
	}
	project, err := s.projectForWriter(ctx, actor, in.ProjectID)
	if err != nil {
		return domain.Era{}, err
	}
	existing, err := s.eras.List(ctx, project.ID)
	if err != nil {
		return domain.Era{}, err
	}
	current, ok := findEra(existing, eraID)
	if !ok {
		return domain.Era{}, domain.ErrEraNotFound
	}
	if current.State == domain.EraStateCompleted {
		return domain.Era{}, domain.ErrEraCompleted
	}
	next, err := buildEraUpdate(current, in)
	if err != nil {
		return domain.Era{}, err
	}
	if domain.HasOverlappingEra(existing, current.ID, next.StartDate, next.EndDate) {
		return domain.Era{}, domain.ErrEraOverlap
	}
	return s.eras.Update(ctx, next)
}

// StartEra moves a Planned Era to Active when no other Era is Active.
func (s *EraService) StartEra(ctx context.Context, actor domain.Actor, rawProjectID, rawEraID string) (domain.Era, error) {
	eraID, err := domain.ParseEraID(rawEraID)
	if err != nil {
		return domain.Era{}, err
	}
	project, err := s.projectForWriter(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Era{}, err
	}
	existing, err := s.eras.List(ctx, project.ID)
	if err != nil {
		return domain.Era{}, err
	}
	current, ok := findEra(existing, eraID)
	if !ok {
		return domain.Era{}, domain.ErrEraNotFound
	}
	if current.State != domain.EraStatePlanned {
		return domain.Era{}, domain.ErrEraNotPlanned
	}
	if domain.HasActiveEra(existing) {
		return domain.Era{}, domain.ErrActiveEraExists
	}
	return s.eras.Start(ctx, project.ID, current.ID)
}

// CloseEra closes an Active Era, keeping completed Work Items in it and moving
// unfinished Work Items either to a Planned next Era or out of Eras altogether,
// without changing any Work Item's Status (CONTEXT.md line 310).
func (s *EraService) CloseEra(ctx context.Context, actor domain.Actor, rawProjectID, rawEraID string, rawNextEraID *string) (domain.Era, error) {
	eraID, err := domain.ParseEraID(rawEraID)
	if err != nil {
		return domain.Era{}, err
	}
	nextEraID, err := parseOptionalNextEraRef(rawNextEraID)
	if err != nil {
		return domain.Era{}, err
	}
	project, err := s.projectForWriter(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Era{}, err
	}
	existing, err := s.eras.List(ctx, project.ID)
	if err != nil {
		return domain.Era{}, err
	}
	current, ok := findEra(existing, eraID)
	if !ok {
		return domain.Era{}, domain.ErrEraNotFound
	}
	if current.State != domain.EraStateActive {
		return domain.Era{}, domain.ErrEraNotActive
	}
	if err := validateNextEra(existing, current.ID, nextEraID); err != nil {
		return domain.Era{}, err
	}
	return s.eras.Close(ctx, project.ID, current.ID, nextEraID, s.now().UTC())
}

// DeleteEra removes a Planned Era; Active and Completed Eras cannot be deleted.
func (s *EraService) DeleteEra(ctx context.Context, actor domain.Actor, rawProjectID, rawEraID string) error {
	eraID, err := domain.ParseEraID(rawEraID)
	if err != nil {
		return err
	}
	project, err := s.projectForWriter(ctx, actor, rawProjectID)
	if err != nil {
		return err
	}
	current, err := s.eras.Find(ctx, project.ID, eraID)
	if err != nil {
		return err
	}
	if current.State != domain.EraStatePlanned {
		return domain.ErrEraNotPlanned
	}
	return s.eras.Delete(ctx, project.ID, current.ID)
}

func (s *EraService) projectForViewer(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
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

func (s *EraService) projectForWriter(ctx context.Context, actor domain.Actor, rawProjectID string) (domain.Project, error) {
	project, err := s.projectForViewer(ctx, actor, rawProjectID)
	if err != nil {
		return domain.Project{}, err
	}
	if !project.ViewerRole.CanWriteWorkItems() {
		return domain.Project{}, domain.ErrForbidden
	}
	if project.IsReadOnly() {
		return domain.Project{}, domain.ErrProjectReadOnly
	}
	return project, nil
}

func buildEraUpdate(current domain.Era, in UpdateEraInput) (EraUpdate, error) {
	next := EraUpdate{
		ProjectID: current.ProjectID,
		ID:        current.ID,
		Name:      current.Name,
		Goal:      current.Goal,
		StartDate: current.StartDate,
		EndDate:   current.EndDate,
	}
	var nameErr, dateErr error
	if in.Name != nil {
		next.Name, nameErr = domain.ParseEraName(*in.Name)
	}
	if in.Goal != nil {
		next.Goal = strings.TrimSpace(*in.Goal)
	}
	if in.StartDate != nil || in.EndDate != nil {
		rawStart := current.StartDate.Format(time.DateOnly)
		rawEnd := current.EndDate.Format(time.DateOnly)
		if in.StartDate != nil {
			rawStart = *in.StartDate
		}
		if in.EndDate != nil {
			rawEnd = *in.EndDate
		}
		next.StartDate, next.EndDate, dateErr = domain.ParseEraDates(rawStart, rawEnd)
	}
	return next, errors.Join(nameErr, dateErr)
}

func parseOptionalNextEraRef(raw *string) (*domain.EraID, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	id, err := domain.ParseNextEraRef(*raw)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func validateNextEra(existing []domain.Era, currentID domain.EraID, nextID *domain.EraID) error {
	if nextID == nil {
		return nil
	}
	if *nextID == currentID {
		return domain.ErrInvalidNextEra
	}
	dest, ok := findEra(existing, *nextID)
	if !ok || dest.State != domain.EraStatePlanned {
		return domain.ErrInvalidNextEra
	}
	return nil
}

func findEra(eras []domain.Era, id domain.EraID) (domain.Era, bool) {
	for _, e := range eras {
		if e.ID == id {
			return e, true
		}
	}
	return domain.Era{}, false
}
