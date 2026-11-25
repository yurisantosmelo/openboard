package main

import (
	"net/http"
	"testing"
)

type projectBody struct {
	ID              string `json:"id"`
	OrganizationID  string `json:"organization_id"`
	WorkspaceID     string `json:"workspace_id"`
	Name            string `json:"name"`
	CurrentUserRole string `json:"current_user_role"`
}

func TestProjectsLifecycle(t *testing.T) {
	admin := newAPIClient(t)
	orgID := signedInWithOrganization(t, admin)
	ws := decodeBody[workspaceBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces",
		`{"organization_id":"`+orgID+`","name":"Engineering","visibility":"restricted"}`, http.StatusCreated))

	project := decodeBody[projectBody](t, admin.expect(http.MethodPost, "/api/v1/projects",
		`{"workspace_id":"`+ws.ID+`","name":"Core Platform"}`, http.StatusCreated))
	if project.WorkspaceID != ws.ID || project.OrganizationID != orgID || project.CurrentUserRole != "owner" {
		t.Fatalf("unexpected project %+v", project)
	}
	admin.expect(http.MethodPost, "/api/v1/projects",
		`{"workspace_id":"`+ws.ID+`","name":"CORE PLATFORM"}`, http.StatusConflict)

	renamed := decodeBody[projectBody](t, admin.expect(http.MethodPatch, "/api/v1/projects/"+project.ID,
		`{"name":"Platform v2"}`, http.StatusOK))
	if renamed.Name != "Platform v2" {
		t.Fatalf("renamed = %+v", renamed)
	}
	page := decodeBody[struct {
		Items      []projectBody `json:"items"`
		TotalItems int           `json:"total_items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects?workspace_id="+ws.ID, "", http.StatusOK))
	if page.TotalItems != 1 || page.Items[0].Name != "Platform v2" {
		t.Fatalf("list = %+v", page)
	}
}

func TestNewProjectSeedsDefaultWorkflow(t *testing.T) {
	admin := newAPIClient(t)
	orgID := signedInWithOrganization(t, admin)
	ws := decodeBody[workspaceBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces",
		`{"organization_id":"`+orgID+`","name":"Engineering","visibility":"open"}`, http.StatusCreated))
	project := decodeBody[projectBody](t, admin.expect(http.MethodPost, "/api/v1/projects",
		`{"workspace_id":"`+ws.ID+`","name":"Core Platform"}`, http.StatusCreated))

	statuses := decodeBody[struct {
		Items []struct {
			Name  string `json:"name"`
			Group string `json:"status_group"`
		} `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+project.ID+"/statuses", "", http.StatusOK))
	if len(statuses.Items) != 4 || statuses.Items[0].Name != "Backlog" || statuses.Items[3].Name != "Done" {
		t.Fatalf("unexpected default statuses %+v", statuses.Items)
	}

	types := decodeBody[struct {
		Items []struct {
			Name         string   `json:"name"`
			EstimateUnit string   `json:"estimate_unit"`
			Children     []string `json:"allowed_child_type_ids"`
		} `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+project.ID+"/work-item-types", "", http.StatusOK))
	if len(types.Items) != 6 || types.Items[0].Name != "Epic" || len(types.Items[0].Children) != 1 {
		t.Fatalf("unexpected default work item types %+v", types.Items)
	}
}

func TestProjectVisibilityAndRoleAuthorization(t *testing.T) {
	admin := newAPIClient(t)
	orgID := signedInWithOrganization(t, admin)
	ws := decodeBody[workspaceBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces",
		`{"organization_id":"`+orgID+`","name":"Secret","visibility":"restricted"}`, http.StatusCreated))
	project := decodeBody[projectBody](t, admin.expect(http.MethodPost, "/api/v1/projects",
		`{"workspace_id":"`+ws.ID+`","name":"Alpha"}`, http.StatusCreated))

	added := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+orgID+"/memberships",
		`{"username":"clara","name":"Clara Dias","role":"contributor"}`, http.StatusCreated))
	clara := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(clara, "clara", added.TemporaryPassword, "clara long fine passphrase")

	// Outside Restricted Workspace: Project is hidden as 404 (ADR 0003).
	clara.expect(http.MethodGet, "/api/v1/projects/"+project.ID, "", http.StatusNotFound)
	clara.expect(http.MethodGet, "/api/v1/projects/"+project.ID+"/statuses", "", http.StatusNotFound)
	clara.expect(http.MethodGet, "/api/v1/projects?workspace_id="+ws.ID, "", http.StatusUnprocessableEntity)

	// As Workspace Contributor: can read Project & workflow, cannot create or rename.
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+ws.ID+"/memberships",
		`{"username":"clara","role":"contributor"}`, http.StatusCreated)
	clara.expect(http.MethodGet, "/api/v1/projects/"+project.ID, "", http.StatusOK)
	clara.expect(http.MethodGet, "/api/v1/projects/"+project.ID+"/statuses", "", http.StatusOK)
	clara.expect(http.MethodGet, "/api/v1/projects/"+project.ID+"/work-item-types", "", http.StatusOK)
	clara.expect(http.MethodPost, "/api/v1/projects", `{"workspace_id":"`+ws.ID+`","name":"Beta"}`, http.StatusForbidden)
	clara.expect(http.MethodPatch, "/api/v1/projects/"+project.ID, `{"name":"Beta"}`, http.StatusForbidden)
}
