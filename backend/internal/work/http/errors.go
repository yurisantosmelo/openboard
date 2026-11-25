package workhttp

import (
	"errors"
	"net/http"

	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
	"github.com/elyosemite/openboard/backend/internal/work/domain"
)

type fieldRule struct {
	err   error
	field httpx.FieldError
}

var projectFieldErrors = []fieldRule{
	{domain.ErrInvalidWorkspaceRef, httpx.FieldError{Field: "workspace_id", Code: "invalid", Message: domain.ErrInvalidWorkspaceRef.Error()}},
	{domain.ErrWorkspaceNotFound, httpx.FieldError{Field: "workspace_id", Code: "not_found", Message: domain.ErrWorkspaceNotFound.Error()}},
	{domain.ErrInvalidName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidName.Error()}},
}

func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrForbidden):
		return &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}
	case errors.Is(err, domain.ErrNotFound):
		return httpx.ErrNotFound()
	case errors.Is(err, domain.ErrProjectNameInUse):
		return &httpx.Error{Status: http.StatusConflict, Slug: "project-name-taken", Title: "Project name already in use"}
	}
	var fields []httpx.FieldError
	for _, rule := range projectFieldErrors {
		if errors.Is(err, rule.err) {
			fields = append(fields, rule.field)
		}
	}
	if len(fields) > 0 {
		return httpx.ErrValidation(fields...)
	}
	return err
}
