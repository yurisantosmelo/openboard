# OpenBoard: instructions for Claude

Full product and architecture context: `docs/product-vision.md`. Read the relevant section before each task.

- Use the domain glossary terms in `CONTEXT.md` (code, API, tests, conversations).
- Document roles: `README.md` is the project's public showcase; this `CLAUDE.md` holds recurring rules; architectural decisions live in ADRs (`docs/adrs/`, in EventCatalog); `CONTEXT.md` is only a glossary. Do not duplicate content between them.
- All repository documentation is written in English only.

## How we work

- Deliver in **small increments**: one slice at a time that compiles, has tests and can be reviewed on its own. Do not get ahead with modules or features that were not requested.
- Before coding anything non-trivial, propose a short plan and wait for approval.
- Simplicity before abstraction: only introduce a layer, library or service when there is a concrete need.
- Relevant architectural decisions become an ADR in `docs/adrs/NNNN-title/index.mdx` (EventCatalog ADR format, ADR 0008), with `summary` and `owners: [maintainers]`; `pnpm lint` in `docs/` validates them.

## Code quality (mandatory for all code written or changed)

- Cyclomatic complexity **≤ 10** per function.
- Cognitive complexity **≤ 15** per function.
- Nesting **≤ 3** levels.
- New code coverage **≥ 80%**.
- Tests **always passing**. Never disable, skip or loosen tests or rules to make them pass.
- Analysis with **local SonarQube** through the `sonarqube-local` MCP (defined in `.mcp.json`, server `http://localhost:9000`). Using SonarQube Cloud or any hosted SonarQube account or server is **forbidden**, including the `sonarqube` MCP from other projects. If the local MCP is unavailable, tell the user instead of considering the work done.
- Before implementing anything, make sure the local server is up with `task sonar:up` (`docker-compose.sonar.yml`; it only returns when the API answers `UP` and does nothing if already healthy). The MCP aborts if it connects while SonarQube is still starting; if it is not connected, run `task sonar:up` and ask the user to run `/mcp`.

## Backend (Go)

- Modular Monolith: each module in `internal/<module>/` with domain / application / infrastructure / http layers. A module does not import another module's infrastructure.
- Business rules do not depend on PostgreSQL or HTTP.
- Always: propagated `context.Context`, centralized error handling, structured logs (`log/slog`), configuration through environment variables.
- Every migration is made with **Liquibase** (never a Go migration tool or loose SQL applied by hand). Migrations are applied by the CD pipeline.
- Authorization is always validated on the backend.
- The Organization is the tenant (ADR 0003): all domain data belongs to one Organization and never crosses into another; a Workspace only restricts visibility within it.
- Tools: `gofmt`, `go vet`, `golangci-lint`, `gocyclo -over 10`, `gocognit -over 15`.

## Database

- For the database, follow the instructions in Database.md.

## Frontend (React + TypeScript)

- Organized by feature (`src/features/<feature>/`), with shadcn/ui components in `src/components/ui/`.
- Separate presentation, state and API communication.
- Build every screen only with **shadcn/ui** components (`src/components/ui/`), Tailwind CSS and **Lucide** icons (`lucide-react`) (ADR 0012). Do not create custom UI primitives — only compose existing shadcn/ui components when no single component covers the need.
- Tools: ESLint, TypeScript in `strict` mode, Prettier.

## Before considering a task done

1. Backend: `gofmt`, `go vet`, `golangci-lint`, `gocyclo`, `gocognit` and `go test -cover ./...` without errors.
2. Frontend: Prettier, ESLint, `tsc --noEmit` and tests with coverage without errors.
3. Local SonarQube analysis (MCP) with no new issues and the limits above met.
4. Do not push without an explicit request.

## Commits

- Make **small commits**: one commit per logical step (a slice that compiles and passes the tests), never one giant commit at the end of the task.
- Every commit message is generated with the **`caveman-commit`** skill (Conventional Commits, in English).

## How API endpoints must be written

Follow api.md.

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown in `.scratch/` (outside Git). See `.claude/agent-skills/issue-tracker.md`.

### Triage labels

Five roles with the default names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` and `wontfix`. See `.claude/agent-skills/triage-labels.md`.

### Domain docs

Single context: `CONTEXT.md` at the root and ADRs in `docs/adrs/`. See `.claude/agent-skills/domain.md`.
