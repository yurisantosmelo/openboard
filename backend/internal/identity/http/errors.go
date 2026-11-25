package identityhttp

import (
	"errors"
	"net/http"
	"strings"

	"github.com/elyosemite/openboard/backend/internal/identity/domain"
	"github.com/elyosemite/openboard/backend/internal/platform/httpx"
)

// mapError turns identity domain errors into problem responses; anything else
// passes through and becomes a 500.
func mapError(err error) error {
	switch {
	case errors.Is(err, domain.ErrInvalidCredentials):
		return &httpx.Error{Status: http.StatusUnauthorized, Slug: "invalid-credentials", Title: "Invalid username or password"}
	case isTooManyAttempts(err):
		return &httpx.Error{
			Status: http.StatusTooManyRequests, Slug: "too-many-attempts",
			Title: "Too many failed sign-in attempts", Detail: "Try again in a few minutes.",
		}
	case errors.Is(err, domain.ErrUnauthenticated):
		return &httpx.Error{Status: http.StatusUnauthorized, Slug: "unauthenticated", Title: "Not signed in"}
	case errors.Is(err, domain.ErrWrongCurrentPassword):
		return httpx.ErrValidation(httpx.FieldError{
			Field: "current_password", Code: "incorrect", Message: "current password is incorrect",
		})
	case errors.Is(err, domain.ErrWeakPassword):
		return httpx.ErrValidation(httpx.FieldError{Field: "new_password", Code: "weak", Message: weakReason(err)})
	case errors.Is(err, domain.ErrForbidden):
		return &httpx.Error{Status: http.StatusForbidden, Slug: "forbidden", Title: "Not allowed"}
	case errors.Is(err, domain.ErrUserNotFound):
		return httpx.ErrNotFound()
	case errors.Is(err, domain.ErrCannotDeactivateSelf):
		return &httpx.Error{Status: http.StatusConflict, Slug: "cannot-deactivate-self", Title: "You cannot deactivate yourself"}
	case errors.Is(err, domain.ErrLastOrganizationOwner):
		return &httpx.Error{Status: http.StatusConflict, Slug: "last-organization-owner", Title: "User is the last Organization Owner of an Organization"}
	case errors.Is(err, domain.ErrUserDeactivated):
		return &httpx.Error{Status: http.StatusConflict, Slug: "user-deactivated", Title: "User is Deactivated"}
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
