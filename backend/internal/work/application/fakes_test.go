package application

import (
	"context"
	"errors"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const (
	orgUUID     = domain.OrganizationID("11111111-1111-1111-1111-111111111111")
	wsUUID      = domain.WorkspaceID("22222222-2222-2222-2222-222222222222")
	projectUUID = domain.ProjectID("33333333-3333-3333-3333-333333333333")
)

var (
	errBoom      = errors.New("boom")
	ownerActor   = domain.Actor{UserID: "u-owner"}
	contribActor = domain.Actor{UserID: "u-contrib"}
)

type fakeWorkspaces struct {
	access domain.WorkspaceAccess
	err    error
}

func (f *fakeWorkspaces) Access(_ context.Context, _ domain.Actor, _ domain.WorkspaceID) (domain.WorkspaceAccess, error) {
	return f.access, f.err
}

type fakeProjects struct {
	created   NewProject
	project   domain.Project
	items     []domain.Project
	total     int
	statuses  []domain.Status
	types     []domain.WorkItemType
	createErr error
	findErr   error
	listErr   error
	renameErr error
	statusErr error
	typeErr   error
	renamed   string
	lastPage  PageRequest
}

func (f *fakeProjects) Create(_ context.Context, p NewProject) (domain.Project, error) {
	f.created = p
	if f.createErr != nil {
		return domain.Project{}, f.createErr
	}
	return f.project, nil
}

func (f *fakeProjects) Find(_ context.Context, _ domain.ProjectID) (domain.Project, error) {
	if f.findErr != nil {
		return domain.Project{}, f.findErr
	}
	return f.project, nil
}

func (f *fakeProjects) ListByWorkspace(_ context.Context, _ domain.WorkspaceID, page PageRequest) ([]domain.Project, int, error) {
	f.lastPage = page
	if f.listErr != nil {
		return nil, 0, f.listErr
	}
	out := append([]domain.Project(nil), f.items...)
	return out, f.total, nil
}

func (f *fakeProjects) Rename(_ context.Context, _ domain.ProjectID, name string) (domain.Project, error) {
	f.renamed = name
	if f.renameErr != nil {
		return domain.Project{}, f.renameErr
	}
	p := f.project
	p.Name = name
	return p, nil
}

func (f *fakeProjects) ListStatuses(_ context.Context, _ domain.ProjectID) ([]domain.Status, error) {
	return f.statuses, f.statusErr
}

func (f *fakeProjects) ListWorkItemTypes(_ context.Context, _ domain.ProjectID) ([]domain.WorkItemType, error) {
	return f.types, f.typeErr
}
