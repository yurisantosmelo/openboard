package main

import (
	"fmt"
	"net/http"
	"testing"
)

type workItemBody struct {
	ID               string   `json:"id"`
	ProjectID        string   `json:"project_id"`
	WorkItemTypeID   string   `json:"work_item_type_id"`
	StatusID         string   `json:"status_id"`
	ParentID         *string  `json:"parent_id"`
	AssigneeID       *string  `json:"assignee_id"`
	AssigneeUsername string   `json:"assignee_username"`
	Title            string   `json:"title"`
	Description      string   `json:"description"`
	Priority         string   `json:"priority"`
	StoryPoints      *float64 `json:"story_points"`
	Hours            *float64 `json:"hours"`
	CurrentUserRole  string   `json:"current_user_role"`
}

type workProjectFixture struct {
	orgID    string
	wsID     string
	project  projectBody
	statuses map[string]string
	types    map[string]string
}

func setupWorkProjectFixture(t *testing.T, admin *apiClient, visibility string) workProjectFixture {
	t.Helper()
	orgID := signedInWithOrganization(t, admin)
	ws := decodeBody[workspaceBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces",
		fmt.Sprintf(`{"organization_id":%q,"name":"Engineering","visibility":%q}`, orgID, visibility), http.StatusCreated))
	project := decodeBody[projectBody](t, admin.expect(http.MethodPost, "/api/v1/projects",
		fmt.Sprintf(`{"workspace_id":%q,"name":"Core"}`, ws.ID), http.StatusCreated))

	statusesResp := decodeBody[struct {
		Items []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+project.ID+"/statuses", "", http.StatusOK))
	statuses := make(map[string]string, len(statusesResp.Items))
	for _, s := range statusesResp.Items {
		statuses[s.Name] = s.ID
	}

	typesResp := decodeBody[struct {
		Items []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+project.ID+"/work-item-types", "", http.StatusOK))
	types := make(map[string]string, len(typesResp.Items))
	for _, wt := range typesResp.Items {
		types[wt.Name] = wt.ID
	}

	return workProjectFixture{orgID: orgID, wsID: ws.ID, project: project, statuses: statuses, types: types}
}

func TestWorkItemsEstimatesAndFiltering(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	story := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Auth flow","priority":"high","story_points":5}`, fx.types["User Story"]),
		http.StatusCreated))
	if story.StatusID != fx.statuses["Backlog"] || story.StoryPoints == nil || *story.StoryPoints != 5 {
		t.Fatalf("unexpected story %+v", story)
	}

	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Bad","hours":2}`, fx.types["User Story"]), http.StatusUnprocessableEntity)
	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Bad","story_points":3}`, fx.types["Epic"]), http.StatusUnprocessableEntity)

	task := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"parent_id":%q,"title":"Add login test","hours":2.5}`, fx.types["Task"], story.ID),
		http.StatusCreated))
	if task.ParentID == nil || *task.ParentID != story.ID || task.Hours == nil || *task.Hours != 2.5 {
		t.Fatalf("unexpected task %+v", task)
	}

	page := decodeBody[struct {
		Items      []workItemBody `json:"items"`
		TotalItems int            `json:"total_items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+fx.project.ID+"/work-items?priority=high&work_item_type_id="+fx.types["User Story"], "", http.StatusOK))
	if page.TotalItems != 1 || page.Items[0].ID != story.ID {
		t.Fatalf("filtered list = %+v", page)
	}
}

func TestWorkItemsPatchTransitionAndDelete(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	story := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Auth flow","story_points":5}`, fx.types["User Story"]), http.StatusCreated))
	task := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"parent_id":%q,"title":"Add login test","hours":2.5}`, fx.types["Task"], story.ID), http.StatusCreated))

	patched := decodeBody[workItemBody](t, admin.expect(http.MethodPatch, "/api/v1/work-items/"+task.ID,
		`{"title":"Add E2E test","priority":"urgent","hours":null}`, http.StatusOK))
	if patched.Title != "Add E2E test" || patched.Priority != "urgent" || patched.Hours != nil {
		t.Fatalf("patched = %+v", patched)
	}
	moved := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/work-items/"+task.ID+"/transitions",
		fmt.Sprintf(`{"status_id":%q}`, fx.statuses["In Progress"]), http.StatusOK))
	if moved.StatusID != fx.statuses["In Progress"] {
		t.Fatalf("moved = %+v", moved)
	}
	admin.expect(http.MethodDelete, "/api/v1/work-items/"+story.ID, "", http.StatusNoContent)
	orphan := decodeBody[workItemBody](t, admin.expect(http.MethodGet, "/api/v1/work-items/"+task.ID, "", http.StatusOK))
	if orphan.ParentID != nil {
		t.Fatalf("expected child parent_id cleared after parent delete, got %+v", orphan)
	}
}

func TestWorkItemsHierarchyAndAuthorization(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "restricted")

	story := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Story"}`, fx.types["User Story"]), http.StatusCreated))
	task := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"parent_id":%q,"title":"Task"}`, fx.types["Task"], story.ID), http.StatusCreated))

	// Disallowed hierarchy (Task -> Story) and self-parent rejected.
	admin.expect(http.MethodPatch, "/api/v1/work-items/"+story.ID,
		fmt.Sprintf(`{"parent_id":%q}`, task.ID), http.StatusUnprocessableEntity)
	admin.expect(http.MethodPatch, "/api/v1/work-items/"+story.ID,
		fmt.Sprintf(`{"parent_id":%q}`, story.ID), http.StatusUnprocessableEntity)

	added := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+fx.orgID+"/memberships",
		`{"username":"viewer1","name":"Viewer One","role":"contributor"}`, http.StatusCreated))
	viewer := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(viewer, "viewer1", added.TemporaryPassword, "viewer long fine passphrase")

	// Outsider cannot see Work Item (404).
	viewer.expect(http.MethodGet, "/api/v1/work-items/"+story.ID, "", http.StatusNotFound)

	// Workspace Viewer can read but gets 403 on every write.
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+fx.wsID+"/memberships",
		`{"username":"viewer1","role":"viewer"}`, http.StatusCreated)
	viewer.expect(http.MethodGet, "/api/v1/work-items/"+story.ID, "", http.StatusOK)
	viewer.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"No"}`, fx.types["Task"]), http.StatusForbidden)
	viewer.expect(http.MethodPatch, "/api/v1/work-items/"+story.ID, `{"title":"No"}`, http.StatusForbidden)
	viewer.expect(http.MethodPost, "/api/v1/work-items/"+story.ID+"/transitions",
		fmt.Sprintf(`{"status_id":%q}`, fx.statuses["Done"]), http.StatusForbidden)
	viewer.expect(http.MethodDelete, "/api/v1/work-items/"+story.ID, "", http.StatusForbidden)
}

func TestWorkItemsAssigneeClearedOnAccessLossAndDeactivation(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	added := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+fx.orgID+"/memberships",
		`{"username":"clara","name":"Clara Dev","role":"contributor"}`, http.StatusCreated))
	claraID := added.UserID

	item := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Fix bug","assignee_id":%q}`, fx.types["Task"], claraID), http.StatusCreated))
	if item.AssigneeID == nil || *item.AssigneeID != claraID || item.AssigneeUsername != "clara" {
		t.Fatalf("expected clara assigned, got %+v", item)
	}

	// Switching Workspace from Open to Restricted removes Clara's access and clears Assignee.
	admin.expect(http.MethodPatch, "/api/v1/workspaces/"+fx.wsID, `{"visibility":"restricted"}`, http.StatusOK)
	afterRestrict := decodeBody[workItemBody](t, admin.expect(http.MethodGet, "/api/v1/work-items/"+item.ID, "", http.StatusOK))
	if afterRestrict.AssigneeID != nil {
		t.Fatalf("expected assignee cleared after restricting workspace, got %+v", afterRestrict)
	}
	// Assigning Clara while she cannot enter the Restricted Workspace is rejected.
	admin.expect(http.MethodPatch, "/api/v1/work-items/"+item.ID,
		fmt.Sprintf(`{"assignee_id":%q}`, claraID), http.StatusUnprocessableEntity)

	// Re-grant Workspace Membership, reassign Clara, then Deactivate Clara -> Assignee cleared.
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+fx.wsID+"/memberships",
		`{"username":"clara","role":"contributor"}`, http.StatusCreated)
	admin.expect(http.MethodPatch, "/api/v1/work-items/"+item.ID,
		fmt.Sprintf(`{"assignee_id":%q}`, claraID), http.StatusOK)
	admin.expect(http.MethodPost, "/api/v1/users/"+claraID+"/deactivate", "", http.StatusOK)
	afterDeactivate := decodeBody[workItemBody](t, admin.expect(http.MethodGet, "/api/v1/work-items/"+item.ID, "", http.StatusOK))
	if afterDeactivate.AssigneeID != nil {
		t.Fatalf("expected assignee cleared after user deactivation, got %+v", afterDeactivate)
	}
	admin.expect(http.MethodPatch, "/api/v1/work-items/"+item.ID,
		fmt.Sprintf(`{"assignee_id":%q}`, claraID), http.StatusUnprocessableEntity)
}
