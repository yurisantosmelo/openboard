package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

const (
	link1UUID = domain.LinkID("88888888-8888-8888-8888-888888888881")
	era1UUID  = domain.EraID("99999999-9999-9999-9999-999999999991")
	era2UUID  = domain.EraID("99999999-9999-9999-9999-999999999992")
)

type fakeLinkRepo struct {
	items   []domain.Link
	created domain.Link
	deleted domain.LinkID
	err     error
}

func (f *fakeLinkRepo) ListForWorkItem(_ context.Context, _ domain.WorkItemID) ([]domain.Link, error) {
	return f.items, f.err
}

func (f *fakeLinkRepo) Create(_ context.Context, projectID domain.ProjectID, src, tgt domain.WorkItemID, kind domain.LinkKind) (domain.Link, error) {
	if f.err != nil {
		return domain.Link{}, f.err
	}
	f.created = domain.Link{ID: link1UUID, ProjectID: projectID, SourceWorkItemID: src, TargetWorkItemID: tgt, Kind: kind}
	return f.created, nil
}

func (f *fakeLinkRepo) Delete(_ context.Context, _ domain.ProjectID, _ domain.WorkItemID, linkID domain.LinkID) error {
	f.deleted = linkID
	return f.err
}

type fakeEraRepo struct {
	eras       []domain.Era
	closedNext *domain.EraID
	deletedID  domain.EraID
	err        error
}

func (f *fakeEraRepo) List(_ context.Context, _ domain.ProjectID) ([]domain.Era, error) {
	return f.eras, f.err
}

func (f *fakeEraRepo) Find(_ context.Context, _ domain.ProjectID, id domain.EraID) (domain.Era, error) {
	if f.err != nil {
		return domain.Era{}, f.err
	}
	for _, e := range f.eras {
		if e.ID == id {
			return e, nil
		}
	}
	return domain.Era{}, domain.ErrEraNotFound
}

func (f *fakeEraRepo) Create(_ context.Context, in NewEra) (domain.Era, error) {
	if f.err != nil {
		return domain.Era{}, f.err
	}
	return domain.Era{ID: era1UUID, ProjectID: in.ProjectID, Name: in.Name, Goal: in.Goal, StartDate: in.StartDate, EndDate: in.EndDate, State: domain.EraStatePlanned}, nil
}

func (f *fakeEraRepo) Update(_ context.Context, in EraUpdate) (domain.Era, error) {
	if f.err != nil {
		return domain.Era{}, f.err
	}
	return domain.Era{ID: in.ID, ProjectID: in.ProjectID, Name: in.Name, Goal: in.Goal, StartDate: in.StartDate, EndDate: in.EndDate, State: domain.EraStatePlanned}, nil
}

func (f *fakeEraRepo) Start(_ context.Context, projectID domain.ProjectID, id domain.EraID) (domain.Era, error) {
	if f.err != nil {
		return domain.Era{}, f.err
	}
	return domain.Era{ID: id, ProjectID: projectID, State: domain.EraStateActive}, nil
}

func (f *fakeEraRepo) Close(_ context.Context, projectID domain.ProjectID, id domain.EraID, nextID *domain.EraID, at time.Time) (domain.Era, error) {
	f.closedNext = nextID
	if f.err != nil {
		return domain.Era{}, f.err
	}
	return domain.Era{ID: id, ProjectID: projectID, State: domain.EraStateCompleted, ClosedAt: &at}, nil
}

func (f *fakeEraRepo) Delete(_ context.Context, _ domain.ProjectID, id domain.EraID) error {
	f.deletedID = id
	return f.err
}

func TestLinkServiceCRUDAndValidation(t *testing.T) {
	_, projects, items, ws, _ := newTestWorkItemHarness(domain.RoleContributor)
	repo := &fakeLinkRepo{}
	svc := NewLinkService(projects, items, repo, ws)

	link, err := svc.CreateLink(context.Background(), contribActor, string(workItem2UUID), string(workItem1UUID), "relates_to")
	if err != nil || link.SourceWorkItemID != workItem1UUID || link.TargetWorkItemID != workItem2UUID {
		t.Fatalf("CreateLink relates_to = %+v, %v", link, err)
	}
	if _, err := svc.CreateLink(context.Background(), contribActor, string(workItem1UUID), string(workItem1UUID), "blocks"); !errors.Is(err, domain.ErrSelfLink) {
		t.Fatalf("self link err = %v", err)
	}
	if err := svc.DeleteLink(context.Background(), contribActor, string(workItem1UUID), string(link1UUID)); err != nil || repo.deleted != link1UUID {
		t.Fatalf("DeleteLink err = %v", err)
	}

	ws.access.Role = domain.RoleViewer
	if _, err := svc.ListLinks(context.Background(), contribActor, string(workItem1UUID)); err != nil {
		t.Fatalf("viewer ListLinks err = %v", err)
	}
	if _, err := svc.CreateLink(context.Background(), contribActor, string(workItem1UUID), string(workItem2UUID), "blocks"); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("viewer CreateLink err = %v", err)
	}
}

func TestEraServiceLifecycle(t *testing.T) {
	_, projects, _, ws, _ := newTestWorkItemHarness(domain.RoleContributor)
	era1 := domain.Era{
		ID: era1UUID, ProjectID: projectUUID, Name: "Era 1", State: domain.EraStatePlanned,
		StartDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC),
	}
	era2 := domain.Era{
		ID: era2UUID, ProjectID: projectUUID, Name: "Era 2", State: domain.EraStatePlanned,
		StartDate: time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 11, 28, 0, 0, 0, 0, time.UTC),
	}
	repo := &fakeEraRepo{eras: []domain.Era{era1, era2}}
	svc := NewEraService(projects, repo, ws)

	if _, err := svc.CreateEra(context.Background(), contribActor, CreateEraInput{
		ProjectID: string(projectUUID), Name: "Overlap", StartDate: "2026-11-10", EndDate: "2026-11-20",
	}); !errors.Is(err, domain.ErrEraOverlap) {
		t.Fatalf("overlap err = %v", err)
	}
	created, err := svc.CreateEra(context.Background(), contribActor, CreateEraInput{
		ProjectID: string(projectUUID), Name: "Era 3", Goal: "Ship", StartDate: "2026-12-01", EndDate: "2026-12-14",
	})
	if err != nil || created.State != domain.EraStatePlanned {
		t.Fatalf("CreateEra = %+v, %v", created, err)
	}

	started, err := svc.StartEra(context.Background(), contribActor, string(projectUUID), string(era1UUID))
	if err != nil || started.State != domain.EraStateActive {
		t.Fatalf("StartEra = %+v, %v", started, err)
	}
	repo.eras[0].State = domain.EraStateActive
	if _, err := svc.StartEra(context.Background(), contribActor, string(projectUUID), string(era2UUID)); !errors.Is(err, domain.ErrActiveEraExists) {
		t.Fatalf("second active era err = %v", err)
	}

	nextRaw := string(era2UUID)
	closed, err := svc.CloseEra(context.Background(), contribActor, string(projectUUID), string(era1UUID), &nextRaw)
	if err != nil || closed.State != domain.EraStateCompleted || *repo.closedNext != era2UUID {
		t.Fatalf("CloseEra = %+v, next=%v, err=%v", closed, repo.closedNext, err)
	}
}

func TestEraServiceGuards(t *testing.T) {
	_, projects, _, ws, _ := newTestWorkItemHarness(domain.RoleContributor)
	doneEra := domain.Era{
		ID: era1UUID, ProjectID: projectUUID, Name: "Era 1", State: domain.EraStateCompleted,
		StartDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC),
	}
	repo := &fakeEraRepo{eras: []domain.Era{doneEra}}
	svc := NewEraService(projects, repo, ws)

	newName := "Renamed"
	if _, err := svc.UpdateEra(context.Background(), contribActor, UpdateEraInput{ProjectID: string(projectUUID), EraID: string(era1UUID), Name: &newName}); !errors.Is(err, domain.ErrEraCompleted) {
		t.Fatalf("edit completed err = %v", err)
	}
	if err := svc.DeleteEra(context.Background(), contribActor, string(projectUUID), string(era1UUID)); !errors.Is(err, domain.ErrEraNotPlanned) {
		t.Fatalf("delete completed err = %v", err)
	}

	ws.access.Role = domain.RoleViewer
	if _, err := svc.ListEras(context.Background(), contribActor, string(projectUUID)); err != nil {
		t.Fatalf("viewer ListEras err = %v", err)
	}
	if _, err := svc.CreateEra(context.Background(), contribActor, CreateEraInput{
		ProjectID: string(projectUUID), Name: "X", StartDate: "2026-12-01", EndDate: "2026-12-02",
	}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("viewer CreateEra err = %v", err)
	}
}
