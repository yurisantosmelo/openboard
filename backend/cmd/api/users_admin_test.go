package main

import (
	"net/http"
	"testing"
)

type apiUser struct {
	ID                 string  `json:"id"`
	Username           string  `json:"username"`
	Name               string  `json:"name"`
	IsAdministrator    bool    `json:"is_administrator"`
	MustChangePassword bool    `json:"must_change_password"`
	DeactivatedAt      *string `json:"deactivated_at"`
	TemporaryPassword  string  `json:"temporary_password"`
}

func TestAdministratorManagesUsersEndToEnd(t *testing.T) {
	admin := newAPIClient(t)
	signInAndReplacePassword(admin, "admin", "admin", "a long and fine passphrase")
	acmeID := createOrg(t, admin, "Acme")
	globexID := createOrg(t, admin, "Globex")
	legal := decodeBody[workspaceBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces",
		`{"organization_id":"`+acmeID+`","name":"Legal"}`, http.StatusCreated))

	added := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+acmeID+"/memberships",
		`{"username":"marina","name":"Marina Silva","role":"contributor"}`, http.StatusCreated))
	marina := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(marina, "marina", added.TemporaryPassword, "marina long fine passphrase")

	// Non-Administrator cannot list or administer Users.
	marina.expect(http.MethodGet, "/api/v1/users", "", http.StatusForbidden)
	marina.expect(http.MethodPost, "/api/v1/users/"+added.UserID+"/deactivate", "", http.StatusForbidden)

	// Administrator lists Users and sees both admin and marina.
	page := decodeBody[struct {
		Items      []apiUser `json:"items"`
		TotalItems int       `json:"total_items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/users", "", http.StatusOK))
	if page.TotalItems != 2 {
		t.Fatalf("GET /api/v1/users total_items = %d, want 2", page.TotalItems)
	}

	// Administrator cannot deactivate themselves.
	adminMe := decodeBody[apiUser](t, admin.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusOK))
	admin.expect(http.MethodPost, "/api/v1/users/"+adminMe.ID+"/deactivate", "", http.StatusConflict)

	// Issuing a Temporary Password revokes Marina's session and forces a password change.
	reset := decodeBody[apiUser](t, admin.expect(http.MethodPost, "/api/v1/users/"+added.UserID+"/temporary-password", "", http.StatusOK))
	if reset.TemporaryPassword == "" || !reset.MustChangePassword {
		t.Fatalf("unexpected temporary password response: %+v", reset)
	}
	marina.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusUnauthorized)
	marina.expect(http.MethodPost, "/api/v1/sessions", `{"username":"marina","password":"`+reset.TemporaryPassword+`"}`, http.StatusCreated)
	marina.expect(http.MethodGet, "/api/v1/organizations", "", http.StatusForbidden)
	marina.expect(http.MethodPut, "/api/v1/users/me/password",
		`{"current_password":"`+reset.TemporaryPassword+`","new_password":"marina second fine passphrase"}`, http.StatusNoContent)

	// Deactivating Marina ends her session, blocks sign-in, blocks Temporary Password and blocks new Memberships.
	deactivated := decodeBody[apiUser](t, admin.expect(http.MethodPost, "/api/v1/users/"+added.UserID+"/deactivate", "", http.StatusOK))
	if deactivated.DeactivatedAt == nil {
		t.Fatal("expected deactivated_at to be set")
	}
	marina.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusUnauthorized)
	marina.expect(http.MethodPost, "/api/v1/sessions", `{"username":"marina","password":"marina second fine passphrase"}`, http.StatusUnauthorized)
	admin.expect(http.MethodPost, "/api/v1/users/"+added.UserID+"/temporary-password", "", http.StatusConflict)
	admin.expect(http.MethodPost, "/api/v1/organizations/"+globexID+"/memberships", `{"username":"marina","name":"Marina Silva"}`, http.StatusConflict)
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+legal.ID+"/memberships", `{"username":"marina","role":"viewer"}`, http.StatusConflict)

	// Reactivating Marina restores sign-in and allows new Memberships again.
	reactivated := decodeBody[apiUser](t, admin.expect(http.MethodPost, "/api/v1/users/"+added.UserID+"/reactivate", "", http.StatusOK))
	if reactivated.DeactivatedAt != nil {
		t.Fatal("expected deactivated_at to be cleared")
	}
	marina.expect(http.MethodPost, "/api/v1/sessions", `{"username":"marina","password":"marina second fine passphrase"}`, http.StatusCreated)
	admin.expect(http.MethodPost, "/api/v1/organizations/"+globexID+"/memberships", `{"username":"marina","name":"Marina Silva"}`, http.StatusCreated)
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+legal.ID+"/memberships", `{"username":"marina","role":"viewer"}`, http.StatusCreated)
}

func TestDeactivatingLastOrganizationOwnerIsBlocked(t *testing.T) {
	admin := newAPIClient(t)
	signInAndReplacePassword(admin, "admin", "admin", "a long and fine passphrase")
	acmeID := createOrg(t, admin, "Acme")
	solo := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+acmeID+"/memberships",
		`{"username":"sofia","name":"Sofia Costa","role":"owner"}`, http.StatusCreated))

	// Remove admin's own membership in Acme so Sofia is the sole Organization Owner.
	adminMe := decodeBody[apiUser](t, admin.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusOK))
	admin.expect(http.MethodDelete, "/api/v1/organizations/"+acmeID+"/memberships/"+adminMe.ID, "", http.StatusNoContent)

	admin.expect(http.MethodPost, "/api/v1/users/"+solo.UserID+"/deactivate", "", http.StatusConflict)
}
