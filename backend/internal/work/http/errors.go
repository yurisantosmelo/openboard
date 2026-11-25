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

var workFieldErrors = []fieldRule{
	{domain.ErrInvalidWorkspaceRef, httpx.FieldError{Field: "workspace_id", Code: "invalid", Message: domain.ErrInvalidWorkspaceRef.Error()}},
	{domain.ErrWorkspaceNotFound, httpx.FieldError{Field: "workspace_id", Code: "not_found", Message: domain.ErrWorkspaceNotFound.Error()}},
	{domain.ErrInvalidName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidName.Error()}},
	{domain.ErrInvalidTitle, httpx.FieldError{Field: "title", Code: "invalid", Message: domain.ErrInvalidTitle.Error()}},
	{domain.ErrInvalidPriority, httpx.FieldError{Field: "priority", Code: "invalid", Message: domain.ErrInvalidPriority.Error()}},
	{domain.ErrInvalidEstimate, httpx.FieldError{Field: "estimate", Code: "invalid", Message: domain.ErrInvalidEstimate.Error()}},
	{domain.ErrInvalidWorkItemType, httpx.FieldError{Field: "work_item_type_id", Code: "invalid", Message: domain.ErrInvalidWorkItemType.Error()}},
	{domain.ErrInvalidStatus, httpx.FieldError{Field: "status_id", Code: "invalid", Message: domain.ErrInvalidStatus.Error()}},
	{domain.ErrInvalidParent, httpx.FieldError{Field: "parent_id", Code: "invalid", Message: domain.ErrInvalidParent.Error()}},
	{domain.ErrParentCycle, httpx.FieldError{Field: "parent_id", Code: "cycle", Message: domain.ErrParentCycle.Error()}},
	{domain.ErrInvalidAssignee, httpx.FieldError{Field: "assignee_id", Code: "invalid", Message: domain.ErrInvalidAssignee.Error()}},
}

func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrForbidden):
		return &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}
	case errors.Is(err, domain.ErrNotFound), errors.Is(err, domain.ErrWorkItemNotFound):
		return httpx.ErrNotFound()
	case errors.Is(err, domain.ErrProjectNameInUse):
		return &httpx.Error{Status: http.StatusConflict, Slug: "project-name-taken", Title: "Project name already in use"}
	}
	var fields []httpx.FieldError
	for _, rule := range workFieldErrors {
		if errors.Is(err, rule.err) {
			fields = append(fields, rule.field)
		}
	}
	if len(fields) > 0 {
		return httpx.ErrValidation(fields...)
	}
	return err
}
