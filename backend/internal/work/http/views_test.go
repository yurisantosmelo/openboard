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

type stubViewService struct {
	listFn   func(context.Context, domain.Actor, string) ([]domain.View, error)
	getFn    func(context.Context, domain.Actor, string, string) (domain.View, error)
	createFn func(context.Context, domain.Actor, application.CreateViewInput) (domain.View, error)
	updateFn func(context.Context, domain.Actor, application.UpdateViewInput) (domain.View, error)
	deleteFn func(context.Context, domain.Actor, string, string) error
}

func (s *stubViewService) ListViews(ctx context.Context, a domain.Actor, p string) ([]domain.View, error) {
	return s.listFn(ctx, a, p)
}
func (s *stubViewService) GetView(ctx context.Context, a domain.Actor, p, id string) (domain.View, error) {
	return s.getFn(ctx, a, p, id)
}
func (s *stubViewService) CreateView(ctx context.Context, a domain.Actor, in application.CreateViewInput) (domain.View, error) {
	return s.createFn(ctx, a, in)
}
func (s *stubViewService) UpdateView(ctx context.Context, a domain.Actor, in application.UpdateViewInput) (domain.View, error) {
	return s.updateFn(ctx, a, in)
}
func (s *stubViewService) DeleteView(ctx context.Context, a domain.Actor, p, id string) error {
	return s.deleteFn(ctx, a, p, id)
}

func TestViewHandlerEndpoints(t *testing.T) {
	sample := domain.View{
		ID: "v1", ProjectID: "p1", Name: "Sprint Board", Layout: domain.ViewLayoutBoard,
		Visibility: domain.ViewVisibilityPersonal, Filters: domain.ViewFilters{Priority: "high"},
		CreatedBy: "u1", CreatedAt: t0, UpdatedAt: t0,
	}
	svc := &stubViewService{
		listFn: func(context.Context, domain.Actor, string) ([]domain.View, error) { return []domain.View{sample}, nil },
		getFn:  func(context.Context, domain.Actor, string, string) (domain.View, error) { return sample, nil },
		createFn: func(context.Context, domain.Actor, application.CreateViewInput) (domain.View, error) {
			return sample, nil
		},
		updateFn: func(context.Context, domain.Actor, application.UpdateViewInput) (domain.View, error) {
			return sample, nil
		},
		deleteFn: func(context.Context, domain.Actor, string, string) error { return nil },
	}
	mux := http.NewServeMux()
	NewViewHandler(svc, fakeAuth(false), slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)

	cases := []struct {
		method, path, body string
		want               int
	}{
		{http.MethodGet, "/api/v1/projects/p1/views", "", http.StatusOK},
		{http.MethodGet, "/api/v1/projects/p1/views/v1", "", http.StatusOK},
		{http.MethodPost, "/api/v1/projects/p1/views", `{"name":"Sprint Board","layout":"board"}`, http.StatusCreated},
		{http.MethodPatch, "/api/v1/projects/p1/views/v1", `{"visibility":"shared"}`, http.StatusOK},
		{http.MethodDelete, "/api/v1/projects/p1/views/v1", "", http.StatusNoContent},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		if tc.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Fatalf("%s %s: got %d want %d body=%s", tc.method, tc.path, rec.Code, tc.want, rec.Body.String())
		}
	}
}

func TestViewHandlerErrorMappings(t *testing.T) {
	mux := http.NewServeMux()
	svc := &stubViewService{
		createFn: func(_ context.Context, _ domain.Actor, in application.CreateViewInput) (domain.View, error) {
			switch in.Name {
			case "dup":
				return domain.View{}, domain.ErrViewNameInUse
			case "badlayout":
				return domain.View{}, domain.ErrInvalidViewLayout
			case "badfilters":
				return domain.View{}, domain.ErrInvalidViewFilters
			default:
				return domain.View{}, domain.ErrForbidden
			}
		},
		getFn: func(context.Context, domain.Actor, string, string) (domain.View, error) {
			return domain.View{}, domain.ErrViewNotFound
		},
	}
	NewViewHandler(svc, fakeAuth(false), slog.New(slog.NewTextHandler(io.Discard, nil))).Register(mux)

	cases := []struct {
		method, path, body string
		want               int
	}{
		{http.MethodPost, "/api/v1/projects/p1/views", `{"name":"dup","layout":"board"}`, http.StatusConflict},
		{http.MethodPost, "/api/v1/projects/p1/views", `{"name":"badlayout","layout":"x"}`, http.StatusUnprocessableEntity},
		{http.MethodPost, "/api/v1/projects/p1/views", `{"name":"badfilters","layout":"board"}`, http.StatusUnprocessableEntity},
		{http.MethodPost, "/api/v1/projects/p1/views", `{"name":"viewer","layout":"board"}`, http.StatusForbidden},
		{http.MethodGet, "/api/v1/projects/p1/views/missing", "", http.StatusNotFound},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		if tc.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Fatalf("%s %s: got %d want %d", tc.method, tc.path, rec.Code, tc.want)
		}
	}
}
