package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestWorkspaceMembershipsFlow(t *testing.T) {
	admin := newAPIClient(t)
	signInAndReplacePassword(admin, "admin", "admin", "a long and fine passphrase")

	acmeID := createOrg(t, admin, "Acme")
	globexID := createOrg(t, admin, "Globex")
	anaAdded := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+acmeID+"/memberships",
		`{"username":"ana","name":"Ana"}`, http.StatusCreated))
	brunoAdded := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+acmeID+"/memberships",
		`{"username":"bruno","name":"Bruno"}`, http.StatusCreated))
	admin.expect(http.MethodPost, "/api/v1/organizations/"+globexID+"/memberships",
		`{"username":"carla","name":"Carla"}`, http.StatusCreated)

	legalID := createRestrictedWorkspace(t, admin, acmeID, "Legal")
	base := "/api/v1/workspaces/" + legalID + "/memberships"

	// Users from another Organization cannot be added (ADR 0003).
	admin.expect(http.MethodPost, base, `{"username":"carla","role":"viewer"}`, http.StatusUnprocessableEntity)

	rec := admin.expect(http.MethodPost, base, `{"username":"ana","role":"viewer"}`, http.StatusCreated)
	if !strings.HasSuffix(rec.Header().Get("Location"), "/memberships/"+anaAdded.UserID) {
		t.Errorf("Location = %q", rec.Header().Get("Location"))
	}
	admin.expect(http.MethodPost, base, `{"username":"ana","role":"contributor"}`, http.StatusConflict)

	ana := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(ana, "ana", anaAdded.TemporaryPassword, "ana own strong passphrase")
	ana.expect(http.MethodGet, "/api/v1/workspaces/"+legalID, "", http.StatusOK)
	ana.expect(http.MethodGet, base, "", http.StatusForbidden)
	ana.expect(http.MethodPost, base, `{"username":"bruno"}`, http.StatusForbidden)
	ana.expect(http.MethodDelete, base+"/"+brunoAdded.UserID, "", http.StatusForbidden)

	// Promote Ana to Workspace Owner; she can list, add, update and remove others, and leave.
	admin.expect(http.MethodPatch, base+"/"+anaAdded.UserID, `{"role":"owner"}`, http.StatusOK)
	ana.expect(http.MethodPost, base, `{"username":"bruno"}`, http.StatusCreated)
	assertMembershipListTotal(t, ana, base, 3)
	ana.expect(http.MethodPatch, base+"/"+brunoAdded.UserID, `{"role":"viewer"}`, http.StatusOK)
	ana.expect(http.MethodDelete, base+"/"+brunoAdded.UserID, "", http.StatusNoContent)

	ana.expect(http.MethodDelete, base+"/"+anaAdded.UserID, "", http.StatusNoContent)
	ana.expect(http.MethodGet, "/api/v1/workspaces/"+legalID, "", http.StatusNotFound)
}

func createRestrictedWorkspace(t *testing.T, c *apiClient, orgID, name string) string {
	t.Helper()
	rec := c.expect(http.MethodPost, "/api/v1/workspaces",
		`{"organization_id":"`+orgID+`","name":"`+name+`","visibility":"restricted"}`, http.StatusCreated)
	var ws struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&ws); err != nil {
		t.Fatal(err)
	}
	return ws.ID
}
