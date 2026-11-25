package main

import (
	"fmt"
	"net/http"
	"testing"
)

type linkBody struct {
	ID               string `json:"id"`
	SourceWorkItemID string `json:"source_work_item_id"`
	TargetWorkItemID string `json:"target_work_item_id"`
	Kind             string `json:"kind"`
}

type eraBody struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Goal      string  `json:"goal"`
	StartDate string  `json:"start_date"`
	EndDate   string  `json:"end_date"`
	State     string  `json:"state"`
	ClosedAt  *string `json:"closed_at"`
}

func TestWorkItemLinksE2E(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	storyA := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Story A"}`, fx.types["User Story"]), http.StatusCreated))
	storyB := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"title":"Story B"}`, fx.types["User Story"]), http.StatusCreated))

	// Blocks link + reverse Relates To deduplication + self-link rejection.
	blocks := decodeBody[linkBody](t, admin.expect(http.MethodPost, "/api/v1/work-items/"+storyA.ID+"/links",
		fmt.Sprintf(`{"target_work_item_id":%q,"kind":"blocks"}`, storyB.ID), http.StatusCreated))
	admin.expect(http.MethodPost, "/api/v1/work-items/"+storyA.ID+"/links",
		fmt.Sprintf(`{"target_work_item_id":%q,"kind":"relates_to"}`, storyB.ID), http.StatusCreated)
	admin.expect(http.MethodPost, "/api/v1/work-items/"+storyB.ID+"/links",
		fmt.Sprintf(`{"target_work_item_id":%q,"kind":"relates_to"}`, storyA.ID), http.StatusConflict)
	admin.expect(http.MethodPost, "/api/v1/work-items/"+storyA.ID+"/links",
		fmt.Sprintf(`{"target_work_item_id":%q,"kind":"blocks"}`, storyA.ID), http.StatusUnprocessableEntity)

	// Delete one link, then delete storyA -> remaining link disappears automatically.
	admin.expect(http.MethodDelete, "/api/v1/work-items/"+storyB.ID+"/links/"+blocks.ID, "", http.StatusNoContent)
	admin.expect(http.MethodDelete, "/api/v1/work-items/"+storyA.ID, "", http.StatusNoContent)
	remaining := decodeBody[struct {
		Items []linkBody `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/work-items/"+storyB.ID+"/links", "", http.StatusOK))
	if len(remaining.Items) != 0 {
		t.Fatalf("expected all links deleted with storyA, got %+v", remaining.Items)
	}
}

func TestProjectErasLifecycleE2E(t *testing.T) {
	admin := newAPIClient(t)
	fx := setupWorkProjectFixture(t, admin, "open")

	era1 := decodeBody[eraBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/eras",
		`{"name":"Era 1","goal":"Launch","start_date":"2026-11-01","end_date":"2026-11-14"}`, http.StatusCreated))
	era2 := decodeBody[eraBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/eras",
		`{"name":"Era 2","goal":"Scale","start_date":"2026-11-15","end_date":"2026-11-28"}`, http.StatusCreated))
	// Overlapping Era rejected.
	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/eras",
		`{"name":"Overlap","start_date":"2026-11-10","end_date":"2026-11-20"}`, http.StatusConflict)

	// Start Era 1; starting Era 2 simultaneously rejected.
	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/eras/"+era1.ID+"/start", "", http.StatusOK)
	admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/eras/"+era2.ID+"/start", "", http.StatusConflict)

	doneItem := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"status_id":%q,"era_id":%q,"title":"Done work"}`, fx.types["Task"], fx.statuses["Done"], era1.ID), http.StatusCreated))
	wipItem := decodeBody[workItemBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/work-items",
		fmt.Sprintf(`{"work_item_type_id":%q,"status_id":%q,"era_id":%q,"title":"WIP work"}`, fx.types["Task"], fx.statuses["In Progress"], era1.ID), http.StatusCreated))

	// Close Era 1 into Era 2: doneItem stays in Era 1, wipItem moves to Era 2 keeping Status.
	closed := decodeBody[eraBody](t, admin.expect(http.MethodPost, "/api/v1/projects/"+fx.project.ID+"/eras/"+era1.ID+"/close",
		fmt.Sprintf(`{"next_era_id":%q}`, era2.ID), http.StatusOK))
	if closed.State != "completed" || closed.ClosedAt == nil {
		t.Fatalf("closed = %+v", closed)
	}
	inEra1 := decodeBody[struct {
		Items []workItemBody `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+fx.project.ID+"/work-items?era_id="+era1.ID, "", http.StatusOK))
	inEra2 := decodeBody[struct {
		Items []workItemBody `json:"items"`
	}](t, admin.expect(http.MethodGet, "/api/v1/projects/"+fx.project.ID+"/work-items?era_id="+era2.ID, "", http.StatusOK))
	if len(inEra1.Items) != 1 || inEra1.Items[0].ID != doneItem.ID || len(inEra2.Items) != 1 || inEra2.Items[0].ID != wipItem.ID || inEra2.Items[0].StatusID != fx.statuses["In Progress"] {
		t.Fatalf("unexpected era close split: era1=%+v era2=%+v", inEra1.Items, inEra2.Items)
	}

	// Completed Era cannot be edited or assigned new Work Items.
	admin.expect(http.MethodPatch, "/api/v1/projects/"+fx.project.ID+"/eras/"+era1.ID, `{"name":"Nope"}`, http.StatusConflict)
	admin.expect(http.MethodPatch, "/api/v1/work-items/"+wipItem.ID, fmt.Sprintf(`{"era_id":%q}`, era1.ID), http.StatusUnprocessableEntity)
}
