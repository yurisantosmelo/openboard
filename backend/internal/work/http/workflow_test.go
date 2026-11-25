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

type fakeWorkflowService struct {
	err             error
	statuses        []domain.Status
	status          domain.Status
	types           []domain.WorkItemType
	wt              domain.WorkItemType
	rules           []domain.TransitionRule
	rule            domain.TransitionRule
	lastReplacement string
	lastRuleArgs    [2]string
}

func (f *fakeWorkflowService) ListStatuses(_ context.Context, _ domain.Actor, _ string) ([]domain.Status, error) {
	return f.statuses, f.err
}

func (f *fakeWorkflowService) CreateStatus(_ context.Context, _ domain.Actor, _ application.CreateStatusInput) (domain.Status, error) {
	return f.status, f.err
}

func (f *fakeWorkflowService) UpdateStatus(_ context.Context, _ domain.Actor, _ application.UpdateStatusInput) (domain.Status, error) {
	return f.status, f.err
}

func (f *fakeWorkflowService) DeleteStatus(_ context.Context, _ domain.Actor, _, _, replacement string) error {
	f.lastReplacement = replacement
	return f.err
}

func (f *fakeWorkflowService) ListWorkItemTypes(_ context.Context, _ domain.Actor, _ string) ([]domain.WorkItemType, error) {
	return f.types, f.err
}

func (f *fakeWorkflowService) CreateWorkItemType(_ context.Context, _ domain.Actor, _ application.CreateWorkItemTypeInput) (domain.WorkItemType, error) {
	return f.wt, f.err
}

func (f *fakeWorkflowService) UpdateWorkItemType(_ context.Context, _ domain.Actor, _ application.UpdateWorkItemTypeInput) (domain.WorkItemType, error) {
	return f.wt, f.err
}

func (f *fakeWorkflowService) DeleteWorkItemType(_ context.Context, _ domain.Actor, _, _, replacement string) error {
	f.lastReplacement = replacement
	return f.err
}

func (f *fakeWorkflowService) ListTransitionRules(_ context.Context, _ domain.Actor, _ string) ([]domain.TransitionRule, error) {
	return f.rules, f.err
}

func (f *fakeWorkflowService) AddTransitionRule(_ context.Context, _ domain.Actor, _, from, to string) (domain.TransitionRule, error) {
	f.lastRuleArgs = [2]string{from, to}
	return f.rule, f.err
}

func (f *fakeWorkflowService) RemoveTransitionRule(_ context.Context, _ domain.Actor, _, from, to string) error {
	f.lastRuleArgs = [2]string{from, to}
	return f.err
}

func serveWorkflow(svc WorkflowService, auth Auth, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	NewWorkflowHandler(svc, auth, slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

func TestWorkflowStatusHandlers(t *testing.T) {
	s := domain.Status{ID: "s1", ProjectID: "p1", Name: "Backlog", Group: domain.StatusGroupNotCommitted, Position: 0, CreatedAt: t0}
	svc := &fakeWorkflowService{statuses: []domain.Status{s}, status: s}

	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodGet, "/api/v1/projects/p1/statuses", ""); rec.Code != http.StatusOK {
		t.Fatalf("list statuses = %d", rec.Code)
	}
	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodPost, "/api/v1/projects/p1/statuses", `{"name":"QA","status_group":"started"}`); rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d", rec.Code)
	}
	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodPatch, "/api/v1/projects/p1/statuses/s1", `{"name":"Review"}`); rec.Code != http.StatusOK {
		t.Fatalf("patch status = %d", rec.Code)
	}
	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodDelete, "/api/v1/projects/p1/statuses/s1?replacement_status_id=s2", ""); rec.Code != http.StatusNoContent || svc.lastReplacement != "s2" {
		t.Fatalf("delete status = %d repl=%q", rec.Code, svc.lastReplacement)
	}
}

func TestWorkflowTypeHandlers(t *testing.T) {
	wt := domain.WorkItemType{ID: "t1", ProjectID: "p1", Name: "Epic", EstimateUnit: domain.EstimateUnitNone, Position: 0, CreatedAt: t0}
	svc := &fakeWorkflowService{types: []domain.WorkItemType{wt}, wt: wt}

	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodGet, "/api/v1/projects/p1/work-item-types", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"allowed_child_type_ids":[]`) {
		t.Fatalf("list types = %d %s", rec.Code, rec.Body.String())
	}
	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodPost, "/api/v1/projects/p1/work-item-types", `{"name":"Spike","estimate_unit":"hours"}`); rec.Code != http.StatusCreated {
		t.Fatalf("create type = %d", rec.Code)
	}
	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodPatch, "/api/v1/projects/p1/work-item-types/t1", `{"name":"Initiative"}`); rec.Code != http.StatusOK {
		t.Fatalf("patch type = %d", rec.Code)
	}
	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodDelete, "/api/v1/projects/p1/work-item-types/t1?replacement_type_id=t2", ""); rec.Code != http.StatusNoContent || svc.lastReplacement != "t2" {
		t.Fatalf("delete type = %d repl=%q", rec.Code, svc.lastReplacement)
	}
}

func TestWorkflowTransitionRuleHandlers(t *testing.T) {
	rule := domain.TransitionRule{ProjectID: "p1", FromStatusID: "s1", ToStatusID: "s2", CreatedAt: t0}
	svc := &fakeWorkflowService{rules: []domain.TransitionRule{rule}, rule: rule}

	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodGet, "/api/v1/projects/p1/transition-rules", ""); rec.Code != http.StatusOK {
		t.Fatalf("list rules = %d", rec.Code)
	}
	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodPost, "/api/v1/projects/p1/transition-rules", `{"from_status_id":"s1","to_status_id":"s2"}`); rec.Code != http.StatusCreated {
		t.Fatalf("add rule = %d", rec.Code)
	}
	if rec := serveWorkflow(svc, fakeAuth(false), http.MethodDelete, "/api/v1/projects/p1/transition-rules/s1/s2", ""); rec.Code != http.StatusNoContent || svc.lastRuleArgs != [2]string{"s1", "s2"} {
		t.Fatalf("delete rule = %d args=%+v", rec.Code, svc.lastRuleArgs)
	}
}

func TestWorkflowHandlerErrors(t *testing.T) {
	cases := map[string]struct {
		method, path, body string
		err                error
		status             int
		slug               string
	}{
		"status 404":     {http.MethodGet, "/api/v1/projects/p1/statuses", "", domain.ErrNotFound, http.StatusNotFound, "not-found"},
		"status bad":     {http.MethodPost, "/api/v1/projects/p1/statuses", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"status taken":   {http.MethodPost, "/api/v1/projects/p1/statuses", `{"name":"Done","status_group":"completed"}`, domain.ErrStatusNameInUse, http.StatusConflict, "status-name-taken"},
		"status min":     {http.MethodDelete, "/api/v1/projects/p1/statuses/s1", "", domain.ErrMinimumStatusGroupRequired, http.StatusUnprocessableEntity, "validation-error"},
		"type bad":       {http.MethodPatch, "/api/v1/projects/p1/work-item-types/t1", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"type taken":     {http.MethodPost, "/api/v1/projects/p1/work-item-types", `{"name":"Task","estimate_unit":"hours"}`, domain.ErrWorkItemTypeNameInUse, http.StatusConflict, "work-item-type-name-taken"},
		"type 404":       {http.MethodDelete, "/api/v1/projects/p1/work-item-types/t1", "", domain.ErrWorkItemTypeNotFound, http.StatusNotFound, "not-found"},
		"rule bad":       {http.MethodPost, "/api/v1/projects/p1/transition-rules", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"rule exists":    {http.MethodPost, "/api/v1/projects/p1/transition-rules", `{"from_status_id":"s1","to_status_id":"s2"}`, domain.ErrTransitionRuleExists, http.StatusConflict, "transition-rule-exists"},
		"rule not found": {http.MethodDelete, "/api/v1/projects/p1/transition-rules/s1/s2", "", domain.ErrTransitionRuleNotFound, http.StatusNotFound, "not-found"},
		"rule blocked":   {http.MethodPost, "/api/v1/projects/p1/transition-rules", `{"from_status_id":"s1","to_status_id":"s2"}`, domain.ErrTransitionNotAllowed, http.StatusUnprocessableEntity, "validation-error"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveWorkflow(&fakeWorkflowService{err: tc.err}, fakeAuth(false), tc.method, tc.path, tc.body)
			p := problemOf(t, rec)
			if rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Errorf("status %d type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
		})
	}
}
