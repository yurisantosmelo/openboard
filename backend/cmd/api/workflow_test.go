package main

import (
	"fmt"
	"net/http"
	"testing"
)

type statusBody struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Group    string `json:"status_group"`
	Position int    `json:"position"`
}

type workItemTypeBody struct {
	ID                  string   `json:"id"`
	Name                string   `json:"name"`
	EstimateUnit        string   `json:"estimate_unit"`
	AllowedChildTypeIDs []string `json:"allowed_child_type_ids"`
}

func TestWorkflowStatusesCustomizationE2E(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	// Create a new Status and place a Work Item in it.
	qa := decodeBody[statusBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/statuses",
		`{"name":"QA","status_group":"started"}`, http.StatusCreated))
	item := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"status_id":%q,"title":"Verify login"}`, fx.types["Task"], qa.ID), http.StatusCreated))

	// Rename Status.
	renamed := decodeBody[statusBody](t, admin.expect(http.MethodPatch, "/api/v1/projects/"+fx.project.ID+"/statuses/"+qa.ID,
		`{"name":"In Review"}`, http.StatusOK))
	if renamed.Name != "In Review" {
		t.Fatalf("renamed = %+v", renamed)
	}

	// Cannot delete sole Completed Status (Done).
	admin.expect(http.MethodDelete, "/api/v1/projects/"+fx.project.ID+"/statuses/"+fx.statuses["Done"]+"?replacement_status_id="+fx.statuses["Backlog"],
		"", http.StatusUnprocessableEntity)

	// Deleting In Review moves its Work Item to Backlog.
	admin.expect(http.MethodDelete, "/api/v1/projects/"+fx.project.ID+"/statuses/"+qa.ID+"?replacement_status_id="+fx.statuses["Backlog"],
		"", http.StatusNoContent)
	after := decodeBody[workItemBody](t, admin.expect(http.MethodGet, "/api/v1/work-items/"+item.ID, "", http.StatusOK))
	if after.StatusID != fx.statuses["Backlog"] {
		t.Fatalf("expected item reassigned to Backlog, got %+v", after)
	}
}

func TestWorkflowTypesAndTransitionRulesE2E(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	// Add custom Work Item Type "Spike" with hours & Subtask child, create Work Item, then delete Spike into Epic (none).
	spike := decodeBody[workItemTypeBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-item-types",
		fmt.Sprintf(`{"name":"Spike","estimate_unit":"hours","allowed_child_type_ids":[%q]}`, fx.types["Subtask"]), http.StatusCreated))
	item := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Research","hours":4}`, spike.ID), http.StatusCreated))
	admin.expect(http.MethodDelete, "/api/v1/projects/"+fx.project.ID+"/work-item-types/"+spike.ID+"?replacement_type_id="+fx.types["Epic"],
		"", http.StatusNoContent)
	moved := decodeBody[workItemBody](t, admin.expect(http.MethodGet, "/api/v1/work-items/"+item.ID, "", http.StatusOK))
	if moved.WorkItemTypeID != fx.types["Epic"] || moved.Hours != nil {
		t.Fatalf("expected item moved to Epic without hours, got %+v", moved)
	}

	// Add Transition Rule Backlog -> To Do; Backlog -> Done is now blocked, Backlog -> To Do succeeds.
	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/transition-rules",
		fmt.Sprintf(`{"from_status_id":%q,"to_status_id":%q}`, fx.statuses["Backlog"], fx.statuses["To Do"]), http.StatusCreated)
	admin.expect(http.MethodPost, "/api/v1/work-items/"+item.ID+"/transitions",
		fmt.Sprintf(`{"status_id":%q}`, fx.statuses["Done"]), http.StatusUnprocessableEntity)
	admin.expect(http.MethodPost, "/api/v1/work-items/"+item.ID+"/transitions",
		fmt.Sprintf(`{"status_id":%q}`, fx.statuses["To Do"]), http.StatusOK)

	// Removing the Transition Rule restores free movement from Backlog.
	admin.expect(http.MethodDelete, "/api/v1/projects/"+fx.project.ID+"/transition-rules/"+fx.statuses["Backlog"]+"/"+fx.statuses["To Do"],
		"", http.StatusNoContent)
	admin.expect(http.MethodPost, "/api/v1/work-items/"+item.ID+"/transitions",
		fmt.Sprintf(`{"status_id":%q}`, fx.statuses["Backlog"]), http.StatusOK)
	admin.expect(http.MethodPost, "/api/v1/work-items/"+item.ID+"/transitions",
		fmt.Sprintf(`{"status_id":%q}`, fx.statuses["Done"]), http.StatusOK)
}

func TestWorkflowCustomizationRequiresWorkspaceOwner(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	added := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+fx.orgID+"/memberships",
		`{"username":"dev1","name":"Dev One","role":"contributor"}`, http.StatusCreated))
	dev := &apiClient{t: t, router: admin.router}
	signInAndReplacePassword(dev, "dev1", added.TemporaryPassword, "dev1 long fine passphrase")

	dev.expect(http.MethodGet, "/api/v1/projects/"+fx.project.ID+"/transition-rules", "", http.StatusOK)
	dev.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/statuses", `{"name":"QA","status_group":"started"}`, http.StatusForbidden)
	dev.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-item-types", `{"name":"Spike","estimate_unit":"none"}`, http.StatusForbidden)
	dev.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/transition-rules",
		fmt.Sprintf(`{"from_status_id":%q,"to_status_id":%q}`, fx.statuses["Backlog"], fx.statuses["Done"]), http.StatusForbidden)
}
