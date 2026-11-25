package application

import (
	"context"
	"errors"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

// LinkService runs Work Item Link use cases (Blocks, Duplicates, Relates To).
type LinkService struct {
	projects   ProjectRepository
	items      WorkItemRepository
	links      LinkRepository
	workspaces WorkspaceAccessChecker
}

// NewLinkService builds a LinkService from its dependencies.
func NewLinkService(
	projects ProjectRepository,
	items WorkItemRepository,
	links LinkRepository,
	workspaces WorkspaceAccessChecker,
) *LinkService {
	return &LinkService{projects: projects, items: items, links: links, workspaces: workspaces}
}

// ListLinks returns all Links connected to a Work Item the Actor can see.
func (s *LinkService) ListLinks(ctx context.Context, actor domain.Actor, rawWorkItemID string) ([]domain.Link, error) {
	item, _, err := s.workItemWithAccess(ctx, actor, rawWorkItemID)
	if err != nil {
		return nil, err
	}
	return s.links.ListForWorkItem(ctx, item.ID)
}

// CreateLink connects two Work Items in the same Project with a fixed Link kind.
func (s *LinkService) CreateLink(ctx context.Context, actor domain.Actor, rawWorkItemID, rawTargetID, rawKind string) (domain.Link, error) {
	targetID, targetErr := domain.ParseLinkTargetRef(rawTargetID)
	kind, kindErr := domain.ParseLinkKind(rawKind)
	if err := errors.Join(targetErr, kindErr); err != nil {
		return domain.Link{}, err
	}
	source, project, err := s.workItemWithAccess(ctx, actor, rawWorkItemID)
	if err != nil {
		return domain.Link{}, err
	}
	if !project.ViewerRole.CanWriteWorkItems() {
		return domain.Link{}, domain.ErrForbidden
	}
	srcID, tgtID, err := domain.NormalizeLinkPair(source.ID, targetID, kind)
	if err != nil {
		return domain.Link{}, err
	}
	target, err := s.items.Find(ctx, targetID)
	if errors.Is(err, domain.ErrWorkItemNotFound) || (err == nil && target.ProjectID != project.ID) {
		return domain.Link{}, domain.ErrInvalidLinkTarget
	}
	if err != nil {
		return domain.Link{}, err
	}
	return s.links.Create(ctx, project.ID, srcID, tgtID, kind)
}

// DeleteLink removes a Link attached to a Work Item.
func (s *LinkService) DeleteLink(ctx context.Context, actor domain.Actor, rawWorkItemID, rawLinkID string) error {
	linkID, err := domain.ParseLinkID(rawLinkID)
	if err != nil {
		return err
	}
	item, project, err := s.workItemWithAccess(ctx, actor, rawWorkItemID)
	if err != nil {
		return err
	}
	if !project.ViewerRole.CanWriteWorkItems() {
		return domain.ErrForbidden
	}
	return s.links.Delete(ctx, project.ID, item.ID, linkID)
}

func (s *LinkService) workItemWithAccess(ctx context.Context, actor domain.Actor, rawID string) (domain.WorkItem, domain.Project, error) {
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
	return item, project, nil
}
