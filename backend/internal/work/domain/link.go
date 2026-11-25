package domain

import (
	"errors"
	"strings"
	"time"
)

var (
	// ErrLinkNotFound reports a Link that does not exist on the Work Item.
	ErrLinkNotFound = errors.New("link not found")
	// ErrLinkExists reports an identical Link already present between the two Work Items.
	ErrLinkExists = errors.New("this link already exists between these work items")
	// ErrInvalidLinkKind reports a Link kind outside blocks, duplicates or relates_to.
	ErrInvalidLinkKind = errors.New("link kind must be blocks, duplicates or relates_to")
	// ErrInvalidLinkTarget reports a target Work Item that is malformed or outside the Project.
	ErrInvalidLinkTarget = errors.New("target work item must belong to the same project")
	// ErrSelfLink reports an attempt to link a Work Item to itself.
	ErrSelfLink = errors.New("a work item cannot be linked to itself")
)

// LinkID identifies a Link between two Work Items.
type LinkID string

// LinkKind is the fixed kind of non-hierarchical Link between two Work Items (CONTEXT.md).
type LinkKind string

// Fixed Link kinds.
const (
	LinkKindBlocks     LinkKind = "blocks"
	LinkKindDuplicates LinkKind = "duplicates"
	LinkKindRelatesTo  LinkKind = "relates_to"
)

// Link is a non-hierarchical relation between two Work Items of the same Project.
type Link struct {
	ID               LinkID
	ProjectID        ProjectID
	SourceWorkItemID WorkItemID
	SourceTitle      string
	TargetWorkItemID WorkItemID
	TargetTitle      string
	Kind             LinkKind
	CreatedAt        time.Time
}

// ParseLinkID normalizes a Link path ID; non-UUID values name no Link.
func ParseLinkID(raw string) (LinkID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrLinkNotFound
	}
	return LinkID(id), nil
}

// ParseLinkTargetRef parses a target Work Item UUID reference from input.
func ParseLinkTargetRef(raw string) (WorkItemID, error) {
	id, ok := parseUUID(raw)
	if !ok {
		return "", ErrInvalidLinkTarget
	}
	return WorkItemID(id), nil
}

// ParseLinkKind validates a Link kind against the three fixed kinds.
func ParseLinkKind(raw string) (LinkKind, error) {
	switch LinkKind(strings.ToLower(strings.TrimSpace(raw))) {
	case LinkKindBlocks:
		return LinkKindBlocks, nil
	case LinkKindDuplicates:
		return LinkKindDuplicates, nil
	case LinkKindRelatesTo:
		return LinkKindRelatesTo, nil
	default:
		return "", ErrInvalidLinkKind
	}
}

// NormalizeLinkPair rejects self-links and orders Relates To pairs canonically
// so symmetric links cannot be duplicated in reverse order.
func NormalizeLinkPair(source, target WorkItemID, kind LinkKind) (WorkItemID, WorkItemID, error) {
	if source == target {
		return "", "", ErrSelfLink
	}
	if kind == LinkKindRelatesTo && source > target {
		return target, source, nil
	}
	return source, target, nil
}
