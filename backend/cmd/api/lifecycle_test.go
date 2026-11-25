package main

import (
	"fmt"
	"net/http"
	"testing"
)

func TestWorkspaceArchiveMakesProjectsReadOnlyAndProtectsLastWorkspaceE2E(t *testing.T) {
	admin := newAPIClient(t)
	signInAndReplacePassword(admin, "admin", "admin", "a long and fine passphrase")
	org := decodeBody[struct {
		ID string `json:"id"`
	}](t, admin.expect(http.MethodPost, "/api/v1/organizations", `{"name":"Acme Lifecycle"}`, http.StatusCreated))

	wsList := decodeBody[struct {
		Items []workspaceBody `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/workspaces?organization_id="+org.ID, "", http.StatusOK))
	defaultWS := wsList.Items[0].ID

	// Last active Workspace cannot be archived or deleted (409).
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+defaultWS+"/archive", "", http.StatusConflict)
	admin.expect(http.MethodDelete, "/api/v1/workspaces/"+defaultWS, "", http.StatusConflict)

	ws2 := decodeBody[workspaceBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces",
		fmt.Sprintf(`{"organization_id":%q,"name":"Engineering","visibility":"open"}`, org.ID), http.StatusCreated))
	proj := decodeBody[projectBody](t, admin.expect(http.MethodPost, "/api/v1/projects",
		fmt.Sprintf(`{"workspace_id":%q,"name":"Core API"}`, ws2.ID), http.StatusCreated))

	// Archiving ws2 makes its Projects read-only and blocks Workspace/Project mutations.
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+ws2.ID+"/archive", "", http.StatusOK)
	gotProj := decodeBody[struct {
		WorkspaceArchived bool `json:"workspace_archived"`
		IsReadOnly        bool `json:"is_read_only"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+proj.ID, "", http.StatusOK))
	if !gotProj.WorkspaceArchived || !gotProj.IsReadOnly {
		t.Fatalf("expected project read-only when workspace archived, got %+v", gotProj)
	}
	admin.expect(http.MethodPatch, "/api/v1/projects/"+proj.ID, `{"name":"Blocked"}`, http.StatusConflict)
	admin.expect(http.MethodPatch, "/api/v1/workspaces/"+ws2.ID, `{"name":"Blocked"}`, http.StatusConflict)

	// Unarchiving ws2 restores write access.
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+ws2.ID+"/unarchive", "", http.StatusOK)
	admin.expect(http.MethodPatch, "/api/v1/projects/"+proj.ID, `{"name":"Core API v2"}`, http.StatusOK)
}

func TestPendingDeletionAndRestorePermissionsE2E(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	added := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+fx.orgID+"/memberships",
		`{"username":"orgowner","name":"Org Owner","role":"owner"}`, http.StatusCreated))
	owner := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(owner, "orgowner", added.TemporaryPassword, "orgowner-pass-1234")

	// Archive / unarchive Project directly.
	owner.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/archive", "", http.StatusOK)
	owner.expect(http.MethodPatch, "/api/v1/projects/"+fx.project.ID, `{"name":"No"}`, http.StatusConflict)
	owner.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/unarchive", "", http.StatusOK)

	// Delete Project -> invisible -> Org Owner lists pending_deletion and restores.
	owner.expect(http.MethodDelete, "/api/v1/projects/"+fx.project.ID, "", http.StatusNoContent)
	owner.expect(http.MethodGet, "/api/v1/projects/"+fx.project.ID, "", http.StatusNotFound)
	owner.expect(http.MethodGet, "/api/v1/projects?workspace_id="+fx.wsID+"&pending_deletion=true", "", http.StatusOK)
	owner.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/restore", "", http.StatusOK)
	owner.expect(http.MethodGet, "/api/v1/projects/"+fx.project.ID, "", http.StatusOK)

	// Delete Workspace -> invisible -> Org Owner restores.
	owner.expect(http.MethodDelete, "/api/v1/workspaces/"+fx.wsID, "", http.StatusNoContent)
	owner.expect(http.MethodGet, "/api/v1/workspaces/"+fx.wsID, "", http.StatusNotFound)
	owner.expect(http.MethodPost, "/api/v1/workspaces/"+fx.wsID+"/restore", "", http.StatusOK)
	owner.expect(http.MethodGet, "/api/v1/workspaces/"+fx.wsID, "", http.StatusOK)

	// Delete Organization -> invisible -> Org Owner cannot restore (403), Administrator can (200).
	owner.expect(http.MethodDelete, "/api/v1/organizations/"+fx.orgID, "", http.StatusNoContent)
	owner.expect(http.MethodGet, "/api/v1/organizations/"+fx.orgID, "", http.StatusNotFound)
	owner.expect(http.MethodPost, "/api/v1/organizations/"+fx.orgID+"/restore", "", http.StatusForbidden)
	admin.expect(http.MethodGet, "/api/v1/organizations?pending_deletion=true", "", http.StatusOK)
	admin.expect(http.MethodPost, "/api/v1/organizations/"+fx.orgID+"/restore", "", http.StatusOK)
	owner.expect(http.MethodGet, "/api/v1/organizations/"+fx.orgID, "", http.StatusOK)
}
