package domain

// StatusSpec defines a Status to seed when a Project is created.
type StatusSpec struct {
	Name     string
	Group    StatusGroup
	Position int
}

// WorkItemTypeSpec defines a Work Item Type to seed when a Project is created.
type WorkItemTypeSpec struct {
	Name         string
	EstimateUnit EstimateUnit
	Position     int
}

// HierarchyRule names one allowed Parent-to-Child pair of initial Work Item Types.
type HierarchyRule struct {
	ParentName string
	ChildName  string
}

// DefaultStatuses returns the four initial Statuses of a new Project (CONTEXT.md, ADR 0010).
func DefaultStatuses() []StatusSpec {
	return []StatusSpec{
		{Name: "Backlog", Group: StatusGroupNotCommitted, Position: 0},
		{Name: "To Do", Group: StatusGroupPlanned, Position: 1},
		{Name: "In Progress", Group: StatusGroupStarted, Position: 2},
		{Name: "Done", Group: StatusGroupCompleted, Position: 3},
	}
}

// DefaultWorkItemTypes returns the six initial Work Item Types of a new Project
// with their estimate units (CONTEXT.md, ADR 0010).
func DefaultWorkItemTypes() []WorkItemTypeSpec {
	return []WorkItemTypeSpec{
		{Name: "Epic", EstimateUnit: EstimateUnitNone, Position: 0},
		{Name: "Feature", EstimateUnit: EstimateUnitNone, Position: 1},
		{Name: "User Story", EstimateUnit: EstimateUnitStoryPoints, Position: 2},
		{Name: "Task", EstimateUnit: EstimateUnitHours, Position: 3},
		{Name: "Bug", EstimateUnit: EstimateUnitStoryPoints, Position: 4},
		{Name: "Subtask", EstimateUnit: EstimateUnitHours, Position: 5},
	}
}

// DefaultHierarchy returns the initial Parent-to-Child Work Item Type rules of a
// new Project (CONTEXT.md: Epic -> Feature -> User Story -> Task|Bug -> Subtask).
func DefaultHierarchy() []HierarchyRule {
	return []HierarchyRule{
		{ParentName: "Epic", ChildName: "Feature"},
		{ParentName: "Feature", ChildName: "User Story"},
		{ParentName: "User Story", ChildName: "Task"},
		{ParentName: "User Story", ChildName: "Bug"},
		{ParentName: "Task", ChildName: "Subtask"},
		{ParentName: "Bug", ChildName: "Subtask"},
	}
}
