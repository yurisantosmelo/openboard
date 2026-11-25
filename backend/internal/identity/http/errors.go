package identityhttp

import (
	"errors"
	"net/http"
	"strings"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
)

var staticErrors = []struct {
	target  error
	problem *httpx.Error
}{
	{domain.ErrInvalidCredentials, &httpx.Error{Status: http.StatusUnauthorized, Slug: "invalid-credentials", Title: "Invalid username or password"}},
	{domain.ErrTooManyAttempts, &httpx.Error{
		Status: http.StatusTooManyRequests, Slug: "too-many-attempts",
		Title: "Too many failed sign-in attempts", Detail: "Try again in a few minutes.",
	}},
	{domain.ErrUnauthenticated, &httpx.Error{Status: http.StatusUnauthorized, Slug: "unauthenticated", Title: "Not signed in"}},
	{domain.ErrForbidden, &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}},
	{domain.ErrUserNotFound, httpx.ErrNotFound()},
	{domain.ErrCannotDeactivateSelf, &httpx.Error{Status: http.StatusConflict, Slug: "cannot-deactivate-self", Title: "You cannot deactivate yourself"}},
	{domain.ErrLastOrganizationOwner, &httpx.Error{Status: http.StatusConflict, Slug: "last-organization-owner", Title: "User is the last Organization Owner of an Organization"}},
	{domain.ErrUserDeactivated, &httpx.Error{Status: http.StatusConflict, Slug: "user-deactivated", Title: "User is Deactivated"}},
}

// mapError turns identity domain errors into problem responses; anything else
// passes through and becomes a 500.
func mapError(err error) error {
	for _, entry := range staticErrors {
		if errors.Is(err, entry.target) {
			return entry.problem
		}
	}
	switch {
	case errors.Is(err, domain.ErrWrongCurrentPassword):
		return httpx.ErrValidation(httpx.FieldError{
			Field: "current_password", Code: "incorrect", Message: "current password is incorrect",
		})
	case errors.Is(err, domain.ErrWeakPassword):
		return httpx.ErrValidation(httpx.FieldError{Field: "new_password", Code: "weak", Message: weakReason(err)})
	}
	return err
}

func isTooManyAttempts(err error) bool { return errors.Is(err, domain.ErrTooManyAttempts) }

// weakReason keeps only the broken rule, such as "use at least 12 characters".
func weakReason(err error) string {
	return strings.TrimPrefix(err.Error(), domain.ErrWeakPassword.Error()+": ")
}

func errPasswordChangeRequired() *httpx.Error {
	return &httpx.Error{
		Status: http.StatusForbidden,
		Slug:   "password-change-required",
		Title:  "Password change required",
		Detail: "Change the Temporary Password before using the API.",
	}
}
