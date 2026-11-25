package application

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

type fakeViewRepo struct {
	views map[domain.ViewID]domain.View
	seq   int
}

func newFakeViewRepo() *fakeViewRepo {
	return &fakeViewRepo{views: make(map[domain.ViewID]domain.View)}
}

func (r *fakeViewRepo) ListVisible(_ context.Context, projectID domain.ProjectID, viewerID domain.UserID) ([]domain.View, error) {
	out := make([]domain.View, 0)
	for _, v := range r.views {
		if v.ProjectID == projectID && (v.Visibility == domain.ViewVisibilityShared || v.CreatedBy == viewerID) {
			out = append(out, v)
		}
	}
	return out, nil
}

func (r *fakeViewRepo) Find(_ context.Context, projectID domain.ProjectID, id domain.ViewID) (domain.View, error) {
	v, ok := r.views[id]
	if !ok || v.ProjectID != projectID {
		return domain.View{}, domain.ErrViewNotFound
	}
	return v, nil
}

func (r *fakeViewRepo) Create(_ context.Context, in NewView) (domain.View, error) {
	for _, existing := range r.views {
		if existing.ProjectID == in.ProjectID &&
			existing.Visibility == domain.ViewVisibilityPersonal &&
			existing.CreatedBy == in.CreatedBy &&
			strings.EqualFold(existing.Name, in.Name) {
			return domain.View{}, domain.ErrViewNameInUse
		}
	}
	r.seq++
	id := domain.ViewID(fmt.Sprintf("aaaaaaaa-aaaa-4aaa-8aaa-%012d", r.seq))
	now := time.Now().UTC()
	v := domain.View{
		ID:         id,
		ProjectID:  in.ProjectID,
		Name:       in.Name,
		Layout:     in.Layout,
		Visibility: domain.ViewVisibilityPersonal,
		Filters:    in.Filters,
		CreatedBy:  in.CreatedBy,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	r.views[id] = v
	return v, nil
}

func (r *fakeViewRepo) Update(_ context.Context, in ViewUpdate) (domain.View, error) {
	v, ok := r.views[in.ID]
	if !ok || v.ProjectID != in.ProjectID {
		return domain.View{}, domain.ErrViewNotFound
	}
	v.Name = in.Name
	v.Layout = in.Layout
	v.Visibility = in.Visibility
	v.Filters = in.Filters
	v.UpdatedAt = time.Now().UTC()
	r.views[v.ID] = v
	return v, nil
}

func (r *fakeViewRepo) Delete(_ context.Context, projectID domain.ProjectID, id domain.ViewID) error {
	v, ok := r.views[id]
	if !ok || v.ProjectID != projectID {
		return domain.ErrViewNotFound
	}
	delete(r.views, id)
	return nil
}

type roleMapAccess struct {
	roles map[domain.UserID]domain.Role
}

func (a roleMapAccess) Access(_ context.Context, actor domain.Actor, ws domain.WorkspaceID) (domain.WorkspaceAccess, error) {
	role, ok := a.roles[actor.UserID]
	if !ok {
		return domain.WorkspaceAccess{}, domain.ErrWorkspaceNotFound
	}
	return domain.WorkspaceAccess{WorkspaceID: ws, Role: role}, nil
}

func seedViewService() (*ViewService, map[string]domain.Actor) {
	_, projects, _, _, _ := newTestWorkItemHarness(domain.RoleContributor)
	actors := map[string]domain.Actor{
		"creator":  {UserID: "u-creator"},
		"peer":     {UserID: "u-peer"},
		"owner":    {UserID: "u-owner"},
		"viewer":   {UserID: "u-viewer"},
		"outsider": {UserID: "u-outsider"},
	}
	access := roleMapAccess{roles: map[domain.UserID]domain.Role{
		actors["creator"].UserID: domain.RoleContributor,
		actors["peer"].UserID:    domain.RoleContributor,
		actors["owner"].UserID:   domain.RoleOwner,
		actors["viewer"].UserID:  domain.RoleViewer,
	}}
	return NewViewService(projects, newFakeViewRepo(), access), actors
}

func TestViewServiceCreateAndVisibility(t *testing.T) {
	ctx := context.Background()
	svc, actors := seedViewService()

	if _, err := svc.CreateView(ctx, actors["viewer"], CreateViewInput{
		ProjectID: string(projectUUID), Name: "Blocked", Layout: "board",
	}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for Viewer create, got %v", err)
	}
	if _, err := svc.ListViews(ctx, actors["outsider"], string(projectUUID)); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for outsider, got %v", err)
	}

	created, err := svc.CreateView(ctx, actors["creator"], CreateViewInput{
		ProjectID: string(projectUUID),
		Name:      "Sprint Focus",
		Layout:    "board",
		Filters:   domain.ViewFilters{Priority: "high"},
	})
	if err != nil || created.Visibility != domain.ViewVisibilityPersonal {
		t.Fatalf("CreateView: got (%+v, %v)", created, err)
	}
	if _, err := svc.GetView(ctx, actors["owner"], string(projectUUID), string(created.ID)); !errors.Is(err, domain.ErrViewNotFound) {
		t.Fatalf("Personal View must stay invisible to Owner, got %v", err)
	}
	if _, err := svc.GetView(ctx, actors["creator"], string(projectUUID), string(created.ID)); err != nil {
		t.Fatalf("Creator GetView: %v", err)
	}
}

func mustCreateSharedView(t *testing.T, svc *ViewService, creator domain.Actor) domain.View {
	t.Helper()
	ctx := context.Background()
	created, err := svc.CreateView(ctx, creator, CreateViewInput{
		ProjectID: string(projectUUID), Name: "Sprint Focus", Layout: "board",
	})
	if err != nil {
		t.Fatalf("CreateView: %v", err)
	}
	sharedVis := "shared"
	shared, err := svc.UpdateView(ctx, creator, UpdateViewInput{
		ProjectID: string(projectUUID), ViewID: string(created.ID), Visibility: &sharedVis,
	})
	if err != nil {
		t.Fatalf("share View: %v", err)
	}
	return shared
}

func TestViewServiceSharedOwnershipAndDelete(t *testing.T) {
	ctx := context.Background()
	svc, actors := seedViewService()
	shared := mustCreateSharedView(t, svc, actors["creator"])

	list, err := svc.ListViews(ctx, actors["viewer"], string(projectUUID))
	if err != nil || len(list) != 1 {
		t.Fatalf("Viewer ListViews: got (%d, %v)", len(list), err)
	}

	newName := "Team Table"
	if _, err := svc.UpdateView(ctx, actors["peer"], UpdateViewInput{
		ProjectID: string(projectUUID), ViewID: string(shared.ID), Name: &newName,
	}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for peer Contributor, got %v", err)
	}

	tableLayout := "table"
	updated, err := svc.UpdateView(ctx, actors["owner"], UpdateViewInput{
		ProjectID: string(projectUUID),
		ViewID:    string(shared.ID),
		Name:      &newName,
		Layout:    &tableLayout,
		Filters:   &domain.ViewFilters{Priority: "urgent"},
	})
	if err != nil || updated.Name != "Team Table" || updated.Layout != domain.ViewLayoutTable {
		t.Fatalf("Owner UpdateView: got (%+v, %v)", updated, err)
	}

	personalVis := "personal"
	if _, err := svc.UpdateView(ctx, actors["owner"], UpdateViewInput{
		ProjectID: string(projectUUID), ViewID: string(shared.ID), Visibility: &personalVis,
	}); !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("non-creator Owner must not make Shared View personal, got %v", err)
	}
	if err := svc.DeleteView(ctx, actors["owner"], string(projectUUID), string(shared.ID)); err != nil {
		t.Fatalf("Owner DeleteView: %v", err)
	}
}
