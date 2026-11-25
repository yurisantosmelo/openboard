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
	{domain.ErrInvalidStatusName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidStatusName.Error()}},
	{domain.ErrInvalidStatusGroup, httpx.FieldError{Field: "status_group", Code: "invalid", Message: domain.ErrInvalidStatusGroup.Error()}},
	{domain.ErrInvalidPosition, httpx.FieldError{Field: "position", Code: "invalid", Message: domain.ErrInvalidPosition.Error()}},
	{domain.ErrMinimumStatusGroupRequired, httpx.FieldError{Field: "status_group", Code: "minimum_required", Message: domain.ErrMinimumStatusGroupRequired.Error()}},
	{domain.ErrInvalidReplacementStatus, httpx.FieldError{Field: "replacement_status_id", Code: "invalid", Message: domain.ErrInvalidReplacementStatus.Error()}},
	{domain.ErrInvalidWorkItemTypeName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidWorkItemTypeName.Error()}},
	{domain.ErrInvalidEstimateUnit, httpx.FieldError{Field: "estimate_unit", Code: "invalid", Message: domain.ErrInvalidEstimateUnit.Error()}},
	{domain.ErrInvalidReplacementType, httpx.FieldError{Field: "replacement_type_id", Code: "invalid", Message: domain.ErrInvalidReplacementType.Error()}},
	{domain.ErrInvalidHierarchy, httpx.FieldError{Field: "allowed_child_type_ids", Code: "invalid", Message: domain.ErrInvalidHierarchy.Error()}},
	{domain.ErrInvalidTransitionRule, httpx.FieldError{Field: "transition_rule", Code: "invalid", Message: domain.ErrInvalidTransitionRule.Error()}},
	{domain.ErrTransitionNotAllowed, httpx.FieldError{Field: "status_id", Code: "transition_not_allowed", Message: domain.ErrTransitionNotAllowed.Error()}},
	{domain.ErrInvalidLinkKind, httpx.FieldError{Field: "kind", Code: "invalid", Message: domain.ErrInvalidLinkKind.Error()}},
	{domain.ErrInvalidLinkTarget, httpx.FieldError{Field: "target_work_item_id", Code: "invalid", Message: domain.ErrInvalidLinkTarget.Error()}},
	{domain.ErrSelfLink, httpx.FieldError{Field: "target_work_item_id", Code: "self_link", Message: domain.ErrSelfLink.Error()}},
	{domain.ErrInvalidEraName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidEraName.Error()}},
	{domain.ErrInvalidEraDates, httpx.FieldError{Field: "dates", Code: "invalid", Message: domain.ErrInvalidEraDates.Error()}},
	{domain.ErrInvalidNextEra, httpx.FieldError{Field: "next_era_id", Code: "invalid", Message: domain.ErrInvalidNextEra.Error()}},
	{domain.ErrInvalidEra, httpx.FieldError{Field: "era_id", Code: "invalid", Message: domain.ErrInvalidEra.Error()}},
	{domain.ErrInvalidViewName, httpx.FieldError{Field: "name", Code: "invalid", Message: domain.ErrInvalidViewName.Error()}},
	{domain.ErrInvalidViewLayout, httpx.FieldError{Field: "layout", Code: "invalid", Message: domain.ErrInvalidViewLayout.Error()}},
	{domain.ErrInvalidViewVisibility, httpx.FieldError{Field: "visibility", Code: "invalid", Message: domain.ErrInvalidViewVisibility.Error()}},
	{domain.ErrInvalidViewFilters, httpx.FieldError{Field: "filters", Code: "invalid", Message: domain.ErrInvalidViewFilters.Error()}},
}

var conflictErrors = []struct {
	err   error
	slug  string
	title string
}{
	{domain.ErrProjectNameInUse, "project-name-taken", "Project name already in use"},
	{domain.ErrStatusNameInUse, "status-name-taken", "Status name already in use"},
	{domain.ErrWorkItemTypeNameInUse, "work-item-type-name-taken", "Work Item Type name already in use"},
	{domain.ErrTransitionRuleExists, "transition-rule-exists", "Transition Rule already exists"},
	{domain.ErrLinkExists, "link-exists", "Link already exists"},
	{domain.ErrEraNameInUse, "era-name-taken", "Era name already in use"},
	{domain.ErrEraOverlap, "era-overlap", "Era dates overlap an existing Era"},
	{domain.ErrActiveEraExists, "active-era-exists", "Project already has an Active Era"},
	{domain.ErrEraNotPlanned, "era-not-planned", "Only a Planned Era can be started or deleted"},
	{domain.ErrEraNotActive, "era-not-active", "Only an Active Era can be closed"},
	{domain.ErrEraCompleted, "era-completed", "Completed Eras cannot be modified"},
	{domain.ErrViewNameInUse, "view-name-taken", "View name already in use"},
}

var notFoundErrors = []error{
	domain.ErrNotFound,
	domain.ErrWorkItemNotFound,
	domain.ErrStatusNotFound,
	domain.ErrWorkItemTypeNotFound,
	domain.ErrTransitionRuleNotFound,
	domain.ErrLinkNotFound,
	domain.ErrEraNotFound,
	domain.ErrViewNotFound,
}

func mapError(err error) error {
	if errors.Is(err, domain.ErrForbidden) {
		return &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}
	}
	for _, nf := range notFoundErrors {
		if errors.Is(err, nf) {
			return httpx.ErrNotFound()
		}
	}
	for _, c := range conflictErrors {
		if errors.Is(err, c.err) {
			return &httpx.Error{Status: http.StatusConflict, Slug: c.slug, Title: c.title}
		}
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
