package main

import (
	"fmt"
	"net/http"
	"testing"
)

type viewBody struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Layout     string            `json:"layout"`
	Visibility string            `json:"visibility"`
	Filters    map[string]string `json:"filters"`
	CreatedBy  string            `json:"created_by"`
}

func addWorkspaceUser(t *testing.T, admin *apiClient, orgID, wsID, username, role string) *apiClient {
	t.Helper()
	added := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+orgID+"/memberships",
		fmt.Sprintf(`{"username":%q,"name":%q,"role":"contributor"}`, username, username), http.StatusCreated))
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+wsID+"/memberships",
		fmt.Sprintf(`{"username":%q,"role":%q}`, username, role), http.StatusCreated)
	client := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(client, username, added.TemporaryPassword, username+" long valid passphrase")
	return client
}

func TestProjectViewsLifecycleE2E(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "restricted")
	creator := addWorkspaceUser(t, admin, fx.orgID, fx.wsID, "viewcreator", "contributor")
	peer := addWorkspaceUser(t, admin, fx.orgID, fx.wsID, "viewpeer", "contributor")
	viewer := addWorkspaceUser(t, admin, fx.orgID, fx.wsID, "viewreader", "viewer")

	viewsPath := "/api/v1/projects/" + fx.project.ID + "/views"

	// Viewer cannot create a View.
	viewer.expect(http.MethodPost, viewsPath, `{"name":"Blocked","layout":"board"}`, http.StatusForbidden)

	// Contributor creates a Personal View.
	created := decodeBody[viewBody](t, creator.expect(http.MethodPost, viewsPath,
		fmt.Sprintf(`{"name":"High Priority","layout":"table","filters":{"priority":"high","status_id":%q}}`, fx.statuses["Backlog"]),
		http.StatusCreated))
	if created.Visibility != "personal" || created.Layout != "table" || created.Filters["priority"] != "high" {
		t.Fatalf("unexpected created view: %+v", created)
	}

	// Personal View is invisible even to Administrator/Workspace Owner.
	admin.expect(http.MethodGet, viewsPath+"/"+created.ID, "", http.StatusNotFound)

	// Creator shares the View.
	shared := decodeBody[viewBody](t, creator.expect(http.MethodPatch, viewsPath+"/"+created.ID,
		`{"visibility":"shared","layout":"timeline"}`, http.StatusOK))
	if shared.Visibility != "shared" || shared.Layout != "timeline" {
		t.Fatalf("unexpected shared view: %+v", shared)
	}

	// Viewer sees it; peer Contributor cannot edit it; Admin (acting as Owner) can edit and delete it.
	viewer.expect(http.MethodGet, viewsPath+"/"+created.ID, "", http.StatusOK)
	peer.expect(http.MethodPatch, viewsPath+"/"+created.ID, `{"name":"Nope"}`, http.StatusForbidden)
	admin.expect(http.MethodPatch, viewsPath+"/"+created.ID, `{"visibility":"personal"}`, http.StatusForbidden)
	admin.expect(http.MethodPatch, viewsPath+"/"+created.ID, `{"name":"Team Timeline"}`, http.StatusOK)
	admin.expect(http.MethodDelete, viewsPath+"/"+created.ID, "", http.StatusNoContent)
}
