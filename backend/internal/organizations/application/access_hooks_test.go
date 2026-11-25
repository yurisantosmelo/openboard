package application

import (
	"context"
	"errors"
	"testing"

	"github.com/elyosemite/openboard/backend/internal/organizations/domain"
)

type visibilityStubWorkspaces struct {
	fakeWorkspaces
	current domain.Workspace
	after   domain.Workspace
}

func (s *visibilityStubWorkspaces) Find(_ context.Context, _ domain.WorkspaceID, _ Scope) (domain.Workspace, error) {
	return s.current, nil
}

func (s *visibilityStubWorkspaces) Update(_ context.Context, _ WorkspaceChange) (domain.Workspace, error) {
	return s.after, nil
}

func TestMembershipAccessLostHooks(t *testing.T) {
	const orgID = "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	const wsID = "1b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	const targetUser = "2b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"

	var orgHookCalls int
	mSvc := NewMembershipService(&fakeMembershipRepo{role: domain.RoleOwner}, &fakeProvisioner{}).
		WithAccessLostHook(func(_ context.Context, _ domain.OrganizationID, _ domain.UserID) error {
			orgHookCalls++
			return nil
		})
	if err := mSvc.RemoveMembership(context.Background(), marinaActor, RemoveOrganizationMembershipInput{OrganizationID: orgID, UserID: targetUser}); err != nil {
		t.Fatalf("RemoveMembership: %v", err)
	}
	if _, err := mSvc.UpdateMembership(context.Background(), marinaActor, UpdateOrganizationMembershipInput{OrganizationID: orgID, UserID: targetUser, Role: "contributor"}); err != nil {
		t.Fatalf("UpdateMembership demote: %v", err)
	}
	if orgHookCalls != 2 {
		t.Fatalf("orgHookCalls = %d, want 2", orgHookCalls)
	}

	var wsMemberHookCalled bool
	wmSvc := NewWorkspaceMembershipService(&fakeWorkspaceMembershipRepo{
		ws: domain.Workspace{ID: wsID, OrganizationID: orgID, ViewerRole: domain.WorkspaceRoleOwner},
	}).WithAccessLostHook(func(_ context.Context, w domain.WorkspaceID) error {
		wsMemberHookCalled = string(w) == wsID
		return nil
	})
	if err := wmSvc.RemoveMembership(context.Background(), marinaActor, RemoveWorkspaceMembershipInput{WorkspaceID: wsID, UserID: targetUser}); err != nil {
		t.Fatalf("RemoveWorkspaceMembership: %v", err)
	}
	if !wsMemberHookCalled {
		t.Fatal("workspace membership hook was not called")
	}
}

func TestWorkspaceVisibilityRestrictedHook(t *testing.T) {
	const orgID = "0b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	const wsID = "1b5e3c1a-9f2d-4e6b-8a7c-1d2e3f4a5b6c"
	repo := &visibilityStubWorkspaces{
		current: domain.Workspace{ID: wsID, OrganizationID: orgID, Visibility: domain.VisibilityOpen, ViewerRole: domain.WorkspaceRoleOwner},
		after:   domain.Workspace{ID: wsID, OrganizationID: orgID, Visibility: domain.VisibilityRestricted},
	}

	var called bool
	wsSvc := NewWorkspaceService(repo).WithVisibilityRestrictedHook(func(_ context.Context, w domain.WorkspaceID) error {
		called = string(w) == wsID
		return nil
	})
	vis := "restricted"
	if _, err := wsSvc.UpdateWorkspace(context.Background(), marinaActor, UpdateWorkspaceInput{ID: wsID, Visibility: &vis}); err != nil {
		t.Fatalf("UpdateWorkspace restrict: %v", err)
	}
	if !called {
		t.Fatal("visibility restricted hook was not called")
	}

	hookErr := errors.New("cleanup failed")
	wsSvc.WithVisibilityRestrictedHook(func(context.Context, domain.WorkspaceID) error { return hookErr })
	if _, err := wsSvc.UpdateWorkspace(context.Background(), marinaActor, UpdateWorkspaceInput{ID: wsID, Visibility: &vis}); !errors.Is(err, hookErr) {
		t.Fatalf("hook err = %v, want %v", err, hookErr)
	}
}
