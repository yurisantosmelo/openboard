package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const unknownID = "00000000-0000-0000-0000-000000000000"

type workspaceBody struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Visibility      string `json:"visibility"`
	CurrentUserRole string `json:"current_user_role"`
}

func decodeBody[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var body T
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	return body
}

// signedInWithOrganization signs in as the first Administrator and creates an
// Organization, returning its ID.
func signedInWithOrganization(t *testing.T, c *apiClient) string {
	t.Helper()
	c.expect(http.MethodPost, "/api/v1/sessions", `{"username":"admin","password":"admin"}`, http.StatusCreated)
	c.expect(http.MethodPut, "/api/v1/users/me/password",
		`{"current_password":"admin","new_password":"a long and fine passphrase"}`, http.StatusNoContent)

	org := decodeBody[struct {
		ID              string `json:"id"`
		CurrentUserRole string `json:"current_user_role"`
	}](t, c.expect(http.MethodPost, "/api/v1/organizations", `{"name":"Acme"}`, http.StatusCreated))
	if org.CurrentUserRole != "owner" {
		t.Errorf("current_user_role = %q, want owner", org.CurrentUserRole)
	}
	return org.ID
}

func TestWorkspacesRequireSession(t *testing.T) {
	c := newAPIClient(t)
	c.expect(http.MethodGet, "/api/v1/workspaces?organization_id="+unknownID, "", http.StatusUnauthorized)
	c.expect(http.MethodGet, "/api/v1/workspaces/"+unknownID, "", http.StatusUnauthorized)
}

func TestAdministratorCreatesWorkspace(t *testing.T) {
	c := newAPIClient(t)
	orgID := signedInWithOrganization(t, c)

	rec := c.expect(http.MethodPost, "/api/v1/workspaces", `{"organization_id":"`+orgID+`","name":" Legal "}`, http.StatusCreated)
	location := rec.Header().Get("Location")
	legal := decodeBody[workspaceBody](t, rec)
	if legal.Name != "Legal" || legal.Visibility != "restricted" || !strings.HasSuffix(location, "/"+legal.ID) {
		t.Errorf("workspace %+v, Location %q", legal, location)
	}

	c.expect(http.MethodPost, "/api/v1/workspaces", `{"organization_id":"`+orgID+`","name":"LEGAL"}`, http.StatusConflict)
	c.expect(http.MethodPost, "/api/v1/workspaces", `{"organization_id":"`+unknownID+`","name":"Legal"}`, http.StatusUnprocessableEntity)
	c.expect(http.MethodPost, "/api/v1/workspaces", `{"organization_id":"`+orgID+`","name":"HR","visibility":"private"}`, http.StatusUnprocessableEntity)

	c.expect(http.MethodGet, location, "", http.StatusOK)
	c.expect(http.MethodGet, "/api/v1/workspaces/"+unknownID, "", http.StatusNotFound)
	c.expect(http.MethodGet, "/api/v1/workspaces/legal", "", http.StatusNotFound)
}

func TestAdministratorListsWorkspaces(t *testing.T) {
	c := newAPIClient(t)
	orgID := signedInWithOrganization(t, c)
	c.expect(http.MethodPost, "/api/v1/workspaces", `{"organization_id":"`+orgID+`","name":"Legal"}`, http.StatusCreated)

	page := decodeBody[struct {
		Items      []workspaceBody `json:"items"`
		TotalItems int             `json:"total_items"`
	}](t, c.expect(http.MethodGet, "/api/v1/workspaces?organization_id="+orgID, "", http.StatusOK))
	if page.TotalItems != 2 || page.Items[0].Name != "Default" || page.Items[1].Name != "Legal" {
		t.Errorf("list %+v, want Default and Legal", page)
	}

	c.expect(http.MethodGet, "/api/v1/workspaces", "", http.StatusUnprocessableEntity)
	c.expect(http.MethodGet, "/api/v1/workspaces?organization_id="+unknownID, "", http.StatusUnprocessableEntity)
	c.expect(http.MethodDelete, "/api/v1/workspaces", "", http.StatusMethodNotAllowed)
}

func TestAdministratorUpdatesDefaultWorkspace(t *testing.T) {
	c := newAPIClient(t)
	orgID := signedInWithOrganization(t, c)
	c.expect(http.MethodPost, "/api/v1/workspaces", `{"organization_id":"`+orgID+`","name":"Legal"}`, http.StatusCreated)
	page := decodeBody[struct {
		Items []workspaceBody `json:"items"`
	}](t, c.expect(http.MethodGet, "/api/v1/workspaces?organization_id="+orgID, "", http.StatusOK))
	path := "/api/v1/workspaces/" + page.Items[0].ID

	ws := decodeBody[workspaceBody](t, c.expect(http.MethodPatch, path, `{"name":" Everyone ","visibility":"restricted"}`, http.StatusOK))
	if ws.Name != "Everyone" || ws.Visibility != "restricted" || ws.CurrentUserRole != "owner" {
		t.Errorf("workspace %+v", ws)
	}

	c.expect(http.MethodPatch, path, `{"name":"legal"}`, http.StatusConflict)
	c.expect(http.MethodPatch, path, `{"visibility":""}`, http.StatusUnprocessableEntity)
	c.expect(http.MethodPatch, "/api/v1/workspaces/"+unknownID, `{"name":"HR"}`, http.StatusNotFound)
}
