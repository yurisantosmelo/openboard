package main

import (
	"fmt"
	"net/http"
	"testing"
)

type teamBody struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	Name        string `json:"name"`
}

type teamAssignmentBody struct {
	TeamID   string `json:"team_id"`
	UserID   string `json:"user_id"`
	Username string `json:"username"`
}

func TestTeamsAssignmentsAndProjectTeamsE2E(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	added := decodeAddedMembership(t, admin.expect(http.MethodPost, "/api/v1/organizations/"+fx.orgID+"/memberships",
		`{"username":"teamdev","name":"Team Dev","role":"contributor"}`, http.StatusCreated))
	devID := added.UserID

	team := decodeBody[teamBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces/"+fx.wsID+"/teams",
		`{"name":"Backend Squad"}`, http.StatusCreated))
	admin.expect(http.MethodPost, "/api/v1/workspaces/"+fx.wsID+"/teams/"+team.ID+"/assignments",
		fmt.Sprintf(`{"user_id":%q}`, devID), http.StatusCreated)
	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/teams",
		fmt.Sprintf(`{"team_id":%q}`, team.ID), http.StatusCreated)

	// Restricting the Workspace removes teamdev's access -> Team Assignment pruned on read.
	admin.expect(http.MethodPatch, "/api/v1/workspaces/"+fx.wsID, `{"visibility":"restricted"}`, http.StatusOK)
	afterRestrict := decodeBody[struct {
		Items []teamAssignmentBody `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/workspaces/"+fx.wsID+"/teams/"+team.ID+"/assignments", "", http.StatusOK))
	if len(afterRestrict.Items) != 0 {
		t.Fatalf("expected Team Assignment pruned on access loss, got %+v", afterRestrict.Items)
	}

	// Deleting Team removes Project Team without deleting the Project.
	admin.expect(http.MethodDelete, "/api/v1/workspaces/"+fx.wsID+"/teams/"+team.ID, "", http.StatusNoContent)
	admin.expect(http.MethodGet, "/api/v1/projects/"+fx.project.ID, "", http.StatusOK)
}

func TestMoveProjectClearsTeamsAndBlocksCrossOrgE2E(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")
	team := decodeBody[teamBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces/"+fx.wsID+"/teams",
		`{"name":"Core Team"}`, http.StatusCreated))
	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/teams",
		fmt.Sprintf(`{"team_id":%q}`, team.ID), http.StatusCreated)
	story := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Keep me"}`, fx.types["User Story"]), http.StatusCreated))

	// Create a second Workspace in the same Organization and one in another Organization.
	ws2 := decodeBody[workspaceBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces",
		fmt.Sprintf(`{"organization_id":%q,"name":"Platform","visibility":"open"}`, fx.orgID), http.StatusCreated))
	org2 := decodeBody[struct {
		ID string `json:"id"`
	}](t, admin.expect(http.MethodPost, "/api/v1/organizations", `{"name":"Other Org"}`, http.StatusCreated))
	wsOtherOrg := decodeBody[workspaceBody](t, admin.expect(http.MethodPost, "/api/v1/workspaces",
		fmt.Sprintf(`{"organization_id":%q,"name":"Other WS","visibility":"open"}`, org2.ID), http.StatusCreated))

	// Cross-organization move is rejected (422).
	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/move",
		fmt.Sprintf(`{"workspace_id":%q}`, wsOtherOrg.ID), http.StatusUnprocessableEntity)

	// Same-organization move succeeds, clears Project Teams, and keeps Work Items.
	moved := decodeBody[projectBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/move",
		fmt.Sprintf(`{"workspace_id":%q}`, ws2.ID), http.StatusOK))
	if moved.WorkspaceID != ws2.ID {
		t.Fatalf("expected moved WorkspaceID=%s, got %s", ws2.ID, moved.WorkspaceID)
	}
	teamsAfter := decodeBody[struct {
		Items []teamBody `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+fx.project.ID+"/teams", "", http.StatusOK))
	if len(teamsAfter.Items) != 0 {
		t.Fatalf("expected Project Teams cleared after move, got %+v", teamsAfter.Items)
	}
	admin.expect(http.MethodGet, "/api/v1/work-items/"+story.ID, "", http.StatusOK)
}
