package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOrganizationMembershipsFlow(t *testing.T) {
	admin := newAPIClient(t)
	signInAndReplacePassword(admin, "admin", "admin", "a long and fine passphrase")

	acmePath := "/api/v1/organizations/" + createOrg(t, admin, "Acme") + "/memberships"
	globexPath := "/api/v1/organizations/" + createOrg(t, admin, "Globex") + "/memberships"

	added := decodeAddedMembership(t, admin.expect(http.MethodPost, acmePath,
		`{"username":"  Ana.Silva ","name":"  Ana Silva  "}`, http.StatusCreated))
	assertAddedMembership(t, added, "ana.silva", "Ana Silva", "contributor", true)
	admin.expect(http.MethodPost, acmePath, `{"username":"ana.silva","name":"Ana Silva"}`, http.StatusConflict)

	linked := decodeAddedMembership(t, admin.expect(http.MethodPost, globexPath,
		`{"username":"ANA.SILVA","name":"Different Name","role":"owner"}`, http.StatusCreated))
	assertAddedMembership(t, linked, "ana.silva", "Ana Silva", "owner", false)
	if linked.UserID != added.UserID {
		t.Fatalf("linked user_id %q != %q", linked.UserID, added.UserID)
	}

	ana := &apiClient{t: t, router: admin.router}
	ana.expect(http.MethodPost, "/api/v1/sessions",
		`{"username":"ana.silva","password":"`+added.TemporaryPassword+`"}`, http.StatusCreated)
	ana.expect(http.MethodGet, globexPath, "", http.StatusForbidden)
	ana.expect(http.MethodPut, "/api/v1/users/me/password",
		`{"current_password":"`+added.TemporaryPassword+`","new_password":"ana own strong passphrase"}`, http.StatusNoContent)

	ana.expect(http.MethodGet, acmePath, "", http.StatusForbidden)
	ana.expect(http.MethodPost, acmePath, `{"username":"bruno","name":"Bruno"}`, http.StatusForbidden)

	ana.expect(http.MethodPost, globexPath, `{"username":"bruno","name":"Bruno"}`, http.StatusCreated)
	assertMembershipListTotal(t, ana, globexPath, 3)

	unauthenticated := &apiClient{t: t, router: admin.router}
	unauthenticated.expect(http.MethodGet, acmePath, "", http.StatusUnauthorized)
	ana.expect(http.MethodGet, "/api/v1/organizations/00000000-0000-0000-0000-000000000000/memberships", "", http.StatusNotFound)
	ana.expect(http.MethodDelete, globexPath, "", http.StatusMethodNotAllowed)
}

type addedMembershipJSON struct {
	UserID            string `json:"user_id"`
	Username          string `json:"username"`
	Name              string `json:"name"`
	Role              string `json:"role"`
	TemporaryPassword string `json:"temporary_password"`
}

func signInAndReplacePassword(c *apiClient, username, current, next string) {
	c.t.Helper()
	c.expect(http.MethodPost, "/api/v1/sessions", `{"username":"`+username+`","password":"`+current+`"}`, http.StatusCreated)
	c.expect(http.MethodPut, "/api/v1/users/me/password",
		`{"current_password":"`+current+`","new_password":"`+next+`"}`, http.StatusNoContent)
}

func decodeAddedMembership(t *testing.T, rec *httptest.ResponseRecorder) addedMembershipJSON {
	t.Helper()
	var m addedMembershipJSON
	if err := json.NewDecoder(rec.Body).Decode(&m); err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(rec.Header().Get("Location"), "/memberships/"+m.UserID) {
		t.Errorf("Location = %q, want suffix /memberships/%s", rec.Header().Get("Location"), m.UserID)
	}
	return m
}

func assertAddedMembership(t *testing.T, got addedMembershipJSON, username, name, role string, wantTemp bool) {
	t.Helper()
	if got.Username != username || got.Name != name || got.Role != role {
		t.Fatalf("got %+v, want username=%q name=%q role=%q", got, username, name, role)
	}
	if (got.TemporaryPassword != "") != wantTemp {
		t.Fatalf("temporary_password present=%v, want %v", got.TemporaryPassword != "", wantTemp)
	}
}

func assertMembershipListTotal(t *testing.T, c *apiClient, path string, want int) {
	t.Helper()
	var list struct {
		Items      []struct{ Username string } `json:"items"`
		TotalItems int                         `json:"total_items"`
	}
	rec := c.expect(http.MethodGet, path, "", http.StatusOK)
	if err := json.NewDecoder(rec.Body).Decode(&list); err != nil {
		t.Fatal(err)
	}
	if list.TotalItems != want || len(list.Items) != want {
		t.Errorf("list = %+v, want %d memberships", list, want)
	}
}

func createOrg(t *testing.T, c *apiClient, name string) string {
	t.Helper()
	rec := c.expect(http.MethodPost, "/api/v1/organizations", `{"name":"`+name+`"}`, http.StatusCreated)
	var org struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&org); err != nil {
		t.Fatal(err)
	}
	return org.ID
}

func TestUpdateAndRemoveOrganizationMembershipsFlow(t *testing.T) {
	admin := newAPIClient(t)
	signInAndReplacePassword(admin, "admin", "admin", "a long and fine passphrase")
	adminID := currentUserID(t, admin)

	orgID := createOrg(t, admin, "Acme")
	base := "/api/v1/organizations/" + orgID + "/memberships"

	// Admin is the sole Organization Owner: cannot be demoted or removed.
	admin.expect(http.MethodPatch, base+"/"+adminID, `{"role":"contributor"}`, http.StatusConflict)
	admin.expect(http.MethodDelete, base+"/"+adminID, "", http.StatusConflict)

	anaAdded := decodeAddedMembership(t, admin.expect(http.MethodPost, base, `{"username":"ana","name":"Ana"}`, http.StatusCreated))
	brunoAdded := decodeAddedMembership(t, admin.expect(http.MethodPost, base, `{"username":"bruno","name":"Bruno"}`, http.StatusCreated))

	// Promote Ana to Organization Owner, then Admin can step down to Contributor.
	admin.expect(http.MethodPatch, base+"/"+anaAdded.UserID, `{"role":"owner"}`, http.StatusOK)
	admin.expect(http.MethodPatch, base+"/"+adminID, `{"role":"contributor"}`, http.StatusOK)

	// Bruno (Contributor) cannot change roles or remove Ana, but can leave the Organization.
	bruno := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(bruno, "bruno", brunoAdded.TemporaryPassword, "bruno own strong passphrase")
	bruno.expect(http.MethodPatch, base+"/"+anaAdded.UserID, `{"role":"contributor"}`, http.StatusForbidden)
	bruno.expect(http.MethodDelete, base+"/"+anaAdded.UserID, "", http.StatusForbidden)
	bruno.expect(http.MethodDelete, base+"/"+brunoAdded.UserID, "", http.StatusNoContent)
	bruno.expect(http.MethodGet, "/api/v1/organizations/"+orgID, "", http.StatusNotFound)

	// Ana (Owner) removes Admin's Membership; Ana remains the last Owner and cannot leave.
	ana := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(ana, "ana", anaAdded.TemporaryPassword, "ana own strong passphrase")
	ana.expect(http.MethodDelete, base+"/"+adminID, "", http.StatusNoContent)
	ana.expect(http.MethodDelete, base+"/"+anaAdded.UserID, "", http.StatusConflict)
	ana.expect(http.MethodGet, base+"/"+anaAdded.UserID, "", http.StatusMethodNotAllowed)
}

func currentUserID(t *testing.T, c *apiClient) string {
	t.Helper()
	rec := c.expect(http.MethodGet, "/api/v1/users/me", "", http.StatusOK)
	var me struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&me); err != nil {
		t.Fatal(err)
	}
	return me.ID
}
