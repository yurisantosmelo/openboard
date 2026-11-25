package workhttp

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/elyosemite/openboard/backend/internal/work/application"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

type fakeLinkService struct {
	links []domain.Link
	link  domain.Link
	err   error
}

func (f *fakeLinkService) ListLinks(_ context.Context, _ domain.Actor, _ string) ([]domain.Link, error) {
	return f.links, f.err
}

func (f *fakeLinkService) CreateLink(_ context.Context, _ domain.Actor, _, _, _ string) (domain.Link, error) {
	return f.link, f.err
}

func (f *fakeLinkService) DeleteLink(_ context.Context, _ domain.Actor, _, _ string) error {
	return f.err
}

type fakeEraService struct {
	eras []domain.Era
	era  domain.Era
	err  error
}

func (f *fakeEraService) ListEras(_ context.Context, _ domain.Actor, _ string) ([]domain.Era, error) {
	return f.eras, f.err
}

func (f *fakeEraService) CreateEra(_ context.Context, _ domain.Actor, _ application.CreateEraInput) (domain.Era, error) {
	return f.era, f.err
}

func (f *fakeEraService) UpdateEra(_ context.Context, _ domain.Actor, _ application.UpdateEraInput) (domain.Era, error) {
	return f.era, f.err
}

func (f *fakeEraService) StartEra(_ context.Context, _ domain.Actor, _, _ string) (domain.Era, error) {
	return f.era, f.err
}

func (f *fakeEraService) CloseEra(_ context.Context, _ domain.Actor, _, _ string, _ *string) (domain.Era, error) {
	return f.era, f.err
}

func (f *fakeEraService) DeleteEra(_ context.Context, _ domain.Actor, _, _ string) error {
	return f.err
}

func serveLinksAndEras(links LinkService, eras EraService, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	NewLinkHandler(links, fakeAuth(false), logger).Register(mux)
	NewEraHandler(eras, fakeAuth(false), logger).Register(mux)
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

func TestLinkHandlers(t *testing.T) {
	link := domain.Link{ID: "l1", ProjectID: "p1", SourceWorkItemID: "w1", SourceTitle: "A", TargetWorkItemID: "w2", TargetTitle: "B", Kind: domain.LinkKindBlocks, CreatedAt: t0}
	svc := &fakeLinkService{links: []domain.Link{link}, link: link}

	if rec := serveLinksAndEras(svc, &fakeEraService{}, http.MethodGet, "/api/v1/work-items/w1/links", ""); rec.Code != http.StatusOK {
		t.Fatalf("list links = %d", rec.Code)
	}
	if rec := serveLinksAndEras(svc, &fakeEraService{}, http.MethodPost, "/api/v1/work-items/w1/links", `{"target_work_item_id":"w2","kind":"blocks"}`); rec.Code != http.StatusCreated {
		t.Fatalf("create link = %d", rec.Code)
	}
	if rec := serveLinksAndEras(svc, &fakeEraService{}, http.MethodDelete, "/api/v1/work-items/w1/links/l1", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete link = %d", rec.Code)
	}
}

func TestEraHandlers(t *testing.T) {
	era := domain.Era{
		ID: "e1", ProjectID: "p1", Name: "Era 1", Goal: "Ship",
		StartDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC),
		EndDate:   time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC),
		State:     domain.EraStatePlanned, CreatedAt: t0, UpdatedAt: t0,
	}
	svc := &fakeEraService{eras: []domain.Era{era}, era: era}

	if rec := serveLinksAndEras(&fakeLinkService{}, svc, http.MethodGet, "/api/v1/projects/p1/eras", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"start_date":"2026-11-01"`) {
		t.Fatalf("list eras = %d %s", rec.Code, rec.Body.String())
	}
	if rec := serveLinksAndEras(&fakeLinkService{}, svc, http.MethodPost, "/api/v1/projects/p1/eras", `{"name":"Era 1","start_date":"2026-11-01","end_date":"2026-11-14"}`); rec.Code != http.StatusCreated {
		t.Fatalf("create era = %d", rec.Code)
	}
	if rec := serveLinksAndEras(&fakeLinkService{}, svc, http.MethodPatch, "/api/v1/projects/p1/eras/e1", `{"name":"Era 1b"}`); rec.Code != http.StatusOK {
		t.Fatalf("update era = %d", rec.Code)
	}
	if rec := serveLinksAndEras(&fakeLinkService{}, svc, http.MethodPost, "/api/v1/projects/p1/eras/e1/start", ""); rec.Code != http.StatusOK {
		t.Fatalf("start era = %d", rec.Code)
	}
	if rec := serveLinksAndEras(&fakeLinkService{}, svc, http.MethodPost, "/api/v1/projects/p1/eras/e1/close", `{"next_era_id":null}`); rec.Code != http.StatusOK {
		t.Fatalf("close era = %d", rec.Code)
	}
	if rec := serveLinksAndEras(&fakeLinkService{}, svc, http.MethodDelete, "/api/v1/projects/p1/eras/e1", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete era = %d", rec.Code)
	}
}

func TestLinksAndErasHandlerErrors(t *testing.T) {
	cases := map[string]struct {
		method, path, body string
		err                error
		status             int
		slug               string
	}{
		"link bad":    {http.MethodPost, "/api/v1/work-items/w1/links", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"link exists": {http.MethodPost, "/api/v1/work-items/w1/links", `{"target_work_item_id":"w2","kind":"blocks"}`, domain.ErrLinkExists, http.StatusConflict, "link-exists"},
		"link 404":    {http.MethodDelete, "/api/v1/work-items/w1/links/l1", "", domain.ErrLinkNotFound, http.StatusNotFound, "not-found"},
		"era bad":     {http.MethodPost, "/api/v1/projects/p1/eras", `{`, nil, http.StatusBadRequest, "malformed-request"},
		"era overlap": {http.MethodPost, "/api/v1/projects/p1/eras", `{"name":"E","start_date":"2026-11-01","end_date":"2026-11-14"}`, domain.ErrEraOverlap, http.StatusConflict, "era-overlap"},
		"era active":  {http.MethodPost, "/api/v1/projects/p1/eras/e1/start", "", domain.ErrActiveEraExists, http.StatusConflict, "active-era-exists"},
		"era close":   {http.MethodPost, "/api/v1/projects/p1/eras/e1/close", `{"next_era_id":"bad"}`, domain.ErrInvalidNextEra, http.StatusUnprocessableEntity, "validation-error"},
		"era 404":     {http.MethodDelete, "/api/v1/projects/p1/eras/e1", "", domain.ErrEraNotFound, http.StatusNotFound, "not-found"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rec := serveLinksAndEras(&fakeLinkService{err: tc.err}, &fakeEraService{err: tc.err}, tc.method, tc.path, tc.body)
			p := problemOf(t, rec)
			if rec.Code != tc.status || !strings.HasSuffix(p.Type, "/"+tc.slug) {
				t.Errorf("status %d type %q; want %d %s", rec.Code, p.Type, tc.status, tc.slug)
			}
		})
	}
}
