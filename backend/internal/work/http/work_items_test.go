package workhttp

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

type fakeWorkItemService struct {
	err           error
	item          domain.WorkItem
	items         []domain.WorkItem
	total         int
	lastProjectID string
	lastFilter    application.ListWorkItemsFilter
	lastPage      application.PageRequest
	createIn      application.CreateWorkItemInput
	updateIn      application.UpdateWorkItemInput
	lastID        string
	lastStatusID  string
	deletedID     string
}

func (f *fakeWorkItemService) CreateWorkItem(_ context.Context, _ domain.Actor, in application.CreateWorkItemInput) (domain.WorkItem, error) {
	f.createIn = in
	return f.item, f.err
}

func (f *fakeWorkItemService) ListWorkItems(_ context.Context, _ domain.Actor, projectID string, filter application.ListWorkItemsFilter, page application.PageRequest) ([]domain.WorkItem, int, error) {
	f.lastProjectID, f.lastFilter, f.lastPage = projectID, filter, page
	return f.items, f.total, f.err
}

func (f *fakeWorkItemService) GetWorkItem(_ context.Context, _ domain.Actor, id string) (domain.WorkItem, error) {
	f.lastID = id
	return f.item, f.err
}

func (f *fakeWorkItemService) UpdateWorkItem(_ context.Context, _ domain.Actor, in application.UpdateWorkItemInput) (domain.WorkItem, error) {
	f.updateIn = in
	return f.item, f.err
}

func (f *fakeWorkItemService) TransitionWorkItem(_ context.Context, _ domain.Actor, id, statusID string) (domain.WorkItem, error) {
	f.lastID, f.lastStatusID = id, statusID
	return f.item, f.err
}

func (f *fakeWorkItemService) DeleteWorkItem(_ context.Context, _ domain.Actor, id string) error {
	f.deletedID = id
	return f.err
}

func serveWorkItems(svc WorkItemService, auth Auth, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	NewWorkItemHandler(svc, auth, slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

var sampleWorkItem = domain.WorkItem{
	ID: "wi1", OrganizationID: "o1", ProjectID: "p1", WorkItemTypeID: "t1", StatusID: "s1",
	Title: "Ship work items", Description: "Details", Priority: domain.PriorityHigh,
	CreatedBy: "u1", CreatedAt: t0, UpdatedAt: t0, ViewerRole: domain.RoleContributor,
}

func TestWorkItemListAndCreateHandlers(t *testing.T) {
	svc := &fakeWorkItemService{item: sampleWorkItem, items: []domain.WorkItem{sampleWorkItem}, total: 1}

	rec := serveWorkItems(svc, fakeAuth(false), http.MethodGet,
		"/api/v1/projects/p1/work-items?status_id=s1&work_item_type_id=t1&priority=high&assignee_id=u1&page=1&page_size=20", "")
	if rec.Code != http.StatusOK || svc.lastProjectID != "p1" || svc.lastFilter.Priority != "high" {
		t.Fatalf("list = %d filter=%+v", rec.Code, svc.lastFilter)
	}

	rec = serveWorkItems(svc, fakeAuth(false), http.MethodPost, "/api/v1/projects/p1/work-items",
		`{"work_item_type_id":"t1","title":"Ship work items","priority":"high","story_points":5}`)
	if rec.Code != http.StatusCreated || rec.Header().Get("Location") != "/api/v1/work-items/wi1" || svc.createIn.ProjectID != "p1" {
		t.Fatalf("create = %d loc=%q in=%+v", rec.Code, rec.Header().Get("Location"), svc.createIn)
	}
}

func TestWorkItemGetAndUpdateHandlers(t *testing.T) {
	svc := &fakeWorkItemService{item: sampleWorkItem}

	rec := serveWorkItems(svc, fakeAuth(false), http.MethodGet, "/api/v1/work-items/wi1", "")
	if rec.Code != http.StatusOK || svc.lastID != "wi1" {
		t.Fatalf("get = %d id=%q", rec.Code, svc.lastID)
	}

	rec = serveWorkItems(svc, fakeAuth(false), http.MethodPatch, "/api/v1/work-items/wi1",
		`{"title":"Updated","parent_id":null,"assignee_id":"u2","story_points":8}`)
	if rec.Code != http.StatusOK || !svc.updateIn.ParentID.Set || svc.updateIn.ParentID.Value != nil {
		t.Fatalf("patch parent = %d in=%+v", rec.Code, svc.updateIn)
	}
	if !svc.updateIn.AssigneeID.Set || *svc.updateIn.AssigneeID.Value != "u2" {
		t.Fatalf("patch assignee in=%+v", svc.updateIn)
	}
}

func TestWorkItemTransitionAndDeleteHandlers(t *testing.T) {
	svc := &fakeWorkItemService{item: sampleWorkItem}

	rec := serveWorkItems(svc, fakeAuth(false), http.MethodPost, "/api/v1/work-items/wi1/transitions", `{"status_id":"s2"}`)
	if rec.Code != http.StatusOK || svc.lastStatusID != "s2" {
		t.Fatalf("transition = %d status=%q", rec.Code, svc.lastStatusID)
	}

	rec = serveWorkItems(svc, fakeAuth(false), http.MethodDelete, "/api/v1/work-items/wi1", "")
	if rec.Code != http.StatusNoContent || svc.deletedID != "wi1" {
		t.Fatalf("delete = %d id=%q", rec.Code, svc.deletedID)
	}
}

func TestWorkItemHandlerErrors(t *testing.T) {
	cases := map[string]struct {
		method, path, body string
		err                error
		status             int
		slug               string
	}{
		"bad page":     {http.MethodGet, "/api/v1/projects/p1/work-items?page=0", "", nil, http.StatusUnprocessableEntity, "validation-error"},
		"list 404":     {http.MethodGet, "/api/v1/projects/p1/work-items", "", domain.ErrNotFound, http.StatusNotFound, "not-found"},
		"bad create":   {http.MethodPost, "/api/v1/projects/p1/work-items", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"bad patch":    {http.MethodPatch, "/api/v1/work-items/wi1", `{"story_points":"bad"}`, nil, http.StatusBadRequest, "malformed-request"},
		"bad trans":    {http.MethodPost, "/api/v1/work-items/wi1/transitions", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"not found":    {http.MethodGet, "/api/v1/work-items/wi1", "", domain.ErrWorkItemNotFound, http.StatusNotFound, "not-found"},
		"cycle":        {http.MethodPatch, "/api/v1/work-items/wi1", `{"parent_id":"wi2"}`, domain.ErrParentCycle, http.StatusUnprocessableEntity, "validation-error"},
		"bad estimate": {http.MethodPost, "/api/v1/projects/p1/work-items", `{"title":"x"}`, domain.ErrInvalidEstimate, http.StatusUnprocessableEntity, "validation-error"},
		"bad status":   {http.MethodPost, "/api/v1/work-items/wi1/transitions", `{"status_id":"s9"}`, domain.ErrInvalidStatus, http.StatusUnprocessableEntity, "validation-error"},
		"delete 403":   {http.MethodDelete, "/api/v1/work-items/wi1", "", domain.ErrForbidden, http.StatusForbidden, "forbidden"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkItems(&fakeWorkItemService{err: tc.err}, fakeAuth(false), tc.method, tc.path, tc.body)
			p := problemOf(t, rec)
			if rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Errorf("status %d type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
		})
	}
}
