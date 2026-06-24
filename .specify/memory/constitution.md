<!--
  Sync Impact Report
  ==================
  Version change: 2.0.0 → 2.1.0
  Bump rationale (2.1.0): MINOR — clarifies that "offline-first"
    is NOT "offline-only" and adds an Optional External
    Enrichment allowance: non-essential derived values the local
    sensors cannot faithfully compute (e.g., the NWS-sourced
    sky-condition icon) MAY be fetched from a trusted public API,
    provided they degrade gracefully to a stale/greyed state,
    never block core ingestion/serving, are cached, and are
    mocked in tests. No principles removed; backward-compatible
    relaxation of the offline constraint.
  ----
  Prior version change: 1.0.0 → 2.0.0
  Bump rationale: MAJOR — backward-incompatible redefinition of
    the platform. The project pivoted from a cloud/Azure,
    enterprise-security design to a self-hosted, local-first,
    LAN-only architecture. Principles and sections removed:
    Azure hosting, Microsoft Secure Futures Initiative (SFI)
    compliance, zero-trust architecture, Terraform/IaC, remote
    Terraform state, staging/production environment parity,
    and staging cleanup. The data path is now a pull-based
    poller of the Ecowitt GW2000B local API across a one-way
    main→IoT VLAN boundary, with Home Assistant fed via MQTT.
  Added sections:
    - Interoperability (Home Assistant)
  Rewritten sections:
    - Performance Standards (local polling + kiosk hardware)
    - Platform Constraints (self-hosted Docker, pull-only)
    - Security (LAN-trust model, VLAN boundary integrity)
    - DevOps (single-host Compose, backups, restart policy)
  Removed sections:
    - Security — SFI compliance, zero-trust architecture
    - DevOps — Infrastructure as Code, remote Terraform state,
      environment parity, staging cleanup
  Templates requiring updates:
    - .specify/templates/plan-template.md        ✅ no changes needed
    - .specify/templates/spec-template.md         ✅ no changes needed
    - .specify/templates/tasks-template.md        ✅ no changes needed
    - .specify/templates/checklist-template.md    ✅ no changes needed
    - .specify/templates/constitution-template.md ✅ source template (unchanged)
  Follow-up TODOs: none
-->

# Ecowitt Dashboard Constitution

## Core Principles

### I. Simplicity

- Every solution MUST prefer the most straightforward approach
  that satisfies the requirement.
- New abstractions, layers, or indirection MUST be justified by
  a concrete, present-day need — not a hypothetical future one.
- When two designs solve the same problem, the one with fewer
  moving parts MUST be chosen unless measurable evidence
  demonstrates the simpler option is insufficient.

**Rationale**: Ecowitt Dashboard is a personal weather
telemetry and graphing application. Unnecessary complexity
increases maintenance burden without proportional benefit.

### II. YAGNI (You Aren't Gonna Need It)

- Features, configuration options, and extension points MUST NOT
  be built until they are explicitly required by a current user
  story or specification.
- Speculative generalization (e.g., plugin systems, multi-tenant
  support, provider abstractions) is prohibited unless a
  specification demands it.
- Code that exists without a covering requirement MUST be
  removed or justified in a plan document.

**Rationale**: Premature features create dead code, widen the
test surface, and obscure the intent of the codebase.

### III. Single Responsibility Principle

- Every function, class, and module MUST have one reason to
  change. If a unit does two things, split it.
- Helper functions that combine "get the data" and "decide
  what to do with it" MUST be separated so each half is
  independently testable.
- When a function is hard to test, that is a design signal —
  extract the untestable part into a unit that CAN be tested.

**Rationale**: SRP keeps units small, testable, and
composable. Violations surface as untestable branches,
mock complexity, and tests that break for unrelated reasons.

### IV. Testing/Test-Driven Development (NON-NEGOTIABLE)

- All new functionality MUST follow the Red-Green-Refactor
  cycle: write a failing test, implement the minimum code to
  pass, then refactor.
- Tests MUST be written and confirmed to fail before any
  production code is written for that behaviour.
- Every user story MUST have at least one acceptance-level test
  that can be executed independently.
- Acceptance tests must be written in an adversarial manner testing edge cases and boundary conditions as if the tester is an user tha has no knowledge of the application. The tests must try to break the app.
- Refactoring MUST NOT change externally observable behaviour;
  the existing test suite MUST continue to pass.
- **Code Coverage**: Unit tests and acceptance tests MUST
  achieve 100% code coverage. No production code may exist
  without a corresponding test that exercises it. Coverage
  MUST be measured and enforced in the CI gate.
- **Arrange-Act-Assert (AAA)**: All tests MUST follow the
  Arrange-Act-Assert pattern. Each test method MUST contain
  exactly three clearly separated sections marked with
  `// Arrange`, `// Act`, and `// Assert` comments. The
  Arrange section sets up preconditions and inputs. The Act
  section invokes the behaviour under test. The Assert section
  verifies the expected outcome. Sections MAY be omitted only
  when they would be genuinely empty (e.g., no arrangement
  needed for a static method with no dependencies), but the
  remaining sections MUST still be commented.
- **Test Data Separation (NON-NEGOTIABLE)**: Automated tests
  (unit, integration, CI) MUST use mock or synthetic data
  exclusively — never live data. Manual user testing and local
  development review MUST use live data from the real Ecowitt
  GW2000B gateway (via its local API on the IoT VLAN). Test
  suites MUST NOT depend on network connectivity, the gateway,
  the MQTT broker, or Home Assistant being reachable. Live-data
  local stacks are for manual verification only and MUST NOT be
  invoked by CI pipelines.
- **Bug Fix Regression Tests (NON-NEGOTIABLE)**: Every bug fix
  MUST start with the creation of one or more failing tests
  (unit and integration). This builds our regression suite.
- **5-Minute Debug Limit (NON-NEGOTIABLE)**: When debugging an
  issue (production incident, failing test, broken deploy,
  unexplained behaviour), the agent MUST stop after 5 minutes
  of unsuccessful investigation and brief the user with: (a)
  what was checked, (b) what is known vs. unknown, and (c) the
  candidate hypotheses. No "one more search", no "let me just
  check", no follow-up rabbit holes. Brief and wait for
  guidance.

**Rationale**: TDD produces verifiable, regression-resistant
code and ensures every feature is exercised by automated tests.
Mandating 100% coverage eliminates untested paths and prevents
silent regressions.

## Development Workflow

- **Branching**: Each feature or fix MUST be developed on a
  dedicated branch named `[###-feature-name]`. Direct commits
  to `main` are prohibited.
- **Commits**: Commits MUST be atomic and describe the "what"
  and "why". One logical change per commit.
- **Code Review**: All changes MUST be reviewed (self-review
  acceptable for a solo project) against this constitution's
  principles before merge.
- **Pull Request Merges**: Pull requests MUST be merged with a
  merge commit (`--merge`) to preserve full history. Squash
  merges are prohibited.
- **CI Gate**: The full test suite MUST pass before any branch
  is merged. No test failures are permitted in the main branch.
- **Documentation**: User-facing behaviour changes MUST be
  reflected in relevant docs or specs before merge.
- **Display Timezone (NON-NEGOTIABLE)**: All telemetry MUST be
  stored in UTC and displayed in `America/New_York` (Eastern).
  Every user-facing date or time — including Chart.js axis
  ticks and tooltips — MUST be rendered with an explicit
  `America/New_York` timezone. Relying on browser locale
  defaults is prohibited.
- **Local Type-Checking Parity (NON-NEGOTIABLE)**: For every
  language in the project that has a static type checker
  (e.g., TypeScript's `tsc`, C#'s compiler, Python's `mypy`),
  the project MUST provide a local command that runs the same
  type-checking step that CI enforces. Type errors MUST be
  catchable locally before pushing — developers MUST NOT have
  to wait for CI to discover type-checking failures.
  Specifically:
  - Every project component MUST include a script or command
    (e.g., `npm run typecheck`, `dotnet build`, `mypy .`) that
    performs the same static analysis as the CI build step.
  - Test runners that skip type checking (e.g., Vitest with
    esbuild, pytest) do NOT satisfy this requirement — the
    actual type checker must be invokable separately.
  - The local type-check command MUST be documented in the
    component's package.json scripts, Makefile, or equivalent
    task runner.

  **Rationale**: Test runners often use fast transpilers
  (esbuild, Babel) that strip types without checking them. If
  CI runs a strict type checker but local development only runs
  tests, type errors become invisible until push — wasting CI
  cycles and developer time.

## Performance Standards

- **Telemetry Ingestion**: The system MUST poll the Ecowitt
  gateway's local API and persist readings without data loss
  under normal operating conditions. A missed or failed poll
  MUST be retried and MUST NOT crash the ingestion service.
- **Poll Cadence**: The ingestion poll interval MUST be
  configurable and default to a value (30–60 s) that captures
  meaningful weather change without overloading the gateway.
- **Graph Rendering**: Charts and graphs MUST render within 2
  seconds for up to 30 days of historical data on the kitchen
  kiosk (a 2014-era Surface Pro 3 running Ubuntu), which is the
  slowest target device.
- **Kiosk Lightweighting**: The default dashboard view MUST cap
  its initial query window (e.g., 24–48 h) and lazy-load longer
  ranges, so the always-on kiosk stays responsive on aging
  hardware.
- **Storage Efficiency**: Reading storage MUST use a format
  (SQLite) that supports efficient time-range queries without
  full-table scans for common access patterns.
- **Responsiveness**: The dashboard MUST remain responsive (UI
  updates within 500 ms) while background polling is active.

## Platform Constraints

- **Self-Hosted, Local-First**: All components MUST run
  on-premises as Docker containers on the household mini-PC,
  alongside the existing Home Assistant stack. There is NO
  cloud dependency for normal operation; the system MUST keep
  collecting and serving its sensor data with no internet
  connectivity (see Offline-First, Not Offline-Only).
- **Offline-First, Not Offline-Only**: "Local-first" guarantees
  that sensor **ingestion and serving** require no internet —
  the poller→store→API→UI core MUST keep collecting and serving
  with zero connectivity. It does NOT forbid *optional* outbound
  enrichment. Where a useful value cannot be faithfully computed
  from the local sensors, the system MAY fetch it from a trusted
  public API as a non-essential overlay.
- **Optional External Enrichment**: Such enrichment (e.g., the
  sky-condition icon from the NWS current-conditions API) MUST:
  (a) degrade gracefully — on timeout / unreachable / stale it
  shows a stale (greyed) or neutral state, never an error or a
  fabricated value; (b) never block persistence or core serving;
  (c) be cached and respectful of the upstream's rate/policy;
  (d) sit behind an injectable client so tests use mocked
  responses only (no live network in CI). Enrichment MUST NOT
  become a core dependency of the dashboard.
- **No Public Cloud Hosting**: Server-side components MUST NOT
  require a public cloud subscription (Azure, AWS, GCP) to run.
  Optional remote access (e.g., Tailscale) is permitted but
  MUST NOT be required for core functionality.
- **Containerization**: Every long-running component (ingestion
  poller, API, static frontend, MQTT publisher) MUST be
  packaged as a Docker container, reproducible from a
  Dockerfile in the repository, and orchestrated via a single
  Docker Compose file. Bare-metal or manual installation is
  prohibited.
- **Data Acquisition (Pull-Only Across the Network Boundary)**:
  The Ecowitt GW2000B gateway resides on an isolated IoT VLAN
  (192.168.30.0/24). The firewall permits connection
  initiation from the main network (192.168.10.0/24) into the
  IoT VLAN but NOT the reverse. Therefore ingestion MUST poll
  the gateway's local HTTP API (e.g., `get_livedata_info`) from
  the main network. Push-based ingestion (gateway →
  application) is architecturally impossible under this
  boundary and MUST NOT be designed for.
- **Single Cross-VLAN Consumer**: The ingestion service MUST be
  the ONLY component that crosses the main→IoT boundary,
  preserving a single auditable firewall pinhole (main host →
  gateway:80). Other consumers (e.g., Home Assistant) MUST
  receive data on the main network, never by reaching into the
  IoT VLAN.
- **Web Application**: A web application MUST be provided as the
  client interface for weather telemetry and graphs, usable
  from the kitchen kiosk and household phones over the LAN.
- **Client–Server Contract**: The web client MUST communicate
  with the server through a versioned API contract. Direct
  database access from the client is prohibited.

**Rationale**: The data source and all consumers live on the
home LAN, so a self-hosted Docker stack on the existing mini-PC
is the simplest sufficient design. The one-way VLAN firewall
dictates a pull-based collector and a single cross-boundary
consumer.

## Security

- **LAN-Trust Model**: The application operates on a trusted
  home LAN. Authentication MAY be omitted for LAN access, or
  reduced to a single shared secret; heavyweight identity
  systems (OAuth/OIDC, MSAL/Entra, per-request token issuance)
  MUST NOT be introduced unless a concrete requirement demands
  them.
- **Network Boundary Integrity (NON-NEGOTIABLE)**: The
  main→IoT firewall rule MUST remain one-way. The design MUST
  NOT require the gateway (IoT VLAN) to initiate connections
  into the main network. The single permitted pinhole is the
  ingestion host reaching the gateway on its local API port; no
  other main→IoT access may be introduced without explicit
  justification.
- **Secrets Management**: Gateway addresses, MQTT credentials,
  and any API keys MUST NOT be committed to source control.
  They MUST be supplied via environment variables or a
  gitignored local config file (e.g., `.env.local`) and
  documented in an example template.
- **Input Validation**: The ingestion service MUST validate and
  sanitise data parsed from the gateway API before persisting
  it; malformed or partial responses MUST be rejected without
  corrupting the store or crashing the service.
- **Optional Remote Access**: If remote access is enabled, it
  MUST use an identity-based overlay (e.g., Tailscale) rather
  than port-forwarding or exposing the dashboard to the public
  internet. The overlay's device authorization is the trust
  boundary.
- **Outbound Enrichment Calls**: Outbound requests to trusted
  public APIs (e.g., NWS `api.weather.gov`) for optional
  enrichment are permitted from the main network over HTTPS.
  They MUST send no secrets, MUST set a contact `User-Agent` per
  the upstream's policy, MUST time out and fail safe to a
  stale/neutral state, and MUST NOT be required for core
  function.
- **Transport**: Plain HTTP is acceptable on the LAN. If a
  secure context is needed (e.g., PWA installability or remote
  access), TLS MUST be provided via the remote-access overlay
  or a local reverse proxy, not by exposing unencrypted
  endpoints beyond the LAN.

**Rationale**: This is a single-household, LAN-only weather
display with no sensitive data and no public exposure. Security
effort is focused where real risk exists — preserving the IoT
VLAN boundary and keeping secrets out of source control — rather
than on enterprise identity machinery that adds complexity
without benefit.

## Interoperability (Home Assistant)

- **Home Assistant Feed**: The application MUST be able to
  publish current weather readings to Home Assistant.
- **MQTT Fan-Out**: Because the gateway's native push is
  blocked by the VLAN boundary, Home Assistant MUST be fed via
  MQTT on the main network: the ingestion service publishes
  readings to an MQTT broker (Mosquitto, alongside Home
  Assistant) and Home Assistant subscribes. Home Assistant MUST
  NOT be required to reach into the IoT VLAN.
- **MQTT Discovery**: Published topics SHOULD use Home
  Assistant MQTT discovery so entities are created
  automatically with correct names and units.
- **Decoupling**: MQTT publishing MUST be an independent output
  path. Failure to publish to MQTT MUST NOT block persistence
  to the application's own store, and vice versa.
- **Source of Truth**: The application owns its own historical
  store (SQLite) independent of Home Assistant's recorder;
  Home Assistant consumption MUST NOT be a dependency of the
  dashboard's history.

**Rationale**: A single cross-VLAN poller stores data and
re-publishes it on the main network, so Home Assistant gets
full-fidelity readings without breaching the IoT boundary, and
neither system depends on the other for availability.

## DevOps

- **Reproducible Stack**: The entire stack MUST be reproducible
  from the repository via a single `docker compose up`. Given
  the same commit and configuration, bringing the stack up on a
  fresh host MUST produce an identical result. The only
  operator-supplied inputs MUST be environment-specific values
  (gateway IP, MQTT credentials) via a gitignored config file
  or environment variables.
- **CI Pipeline**: A CI pipeline MUST build and test every
  change that reaches the main branch and MUST enforce the full
  test suite gate (Principle IV) before merge.
- **CI Coverage Gate (NON-NEGOTIABLE)**: CI MUST enforce 100%
  combined code coverage (unit + integration) as a hard gate
  and MUST fail the build if coverage falls below 100%. This
  gate MUST NOT be bypassed, made informational, or reduced to
  a warning under any circumstance. Lowering the threshold
  requires a constitution amendment (MAJOR version bump).
- **CI Test Coverage (NON-NEGOTIABLE)**: All tests across all
  components (ingestion poller, API, dashboard, MQTT publisher,
  etc.) MUST be executed during branch CI on every push. No
  test suite may exist in the repository without a
  corresponding CI job that executes it.
- **Container Images**: Component images MUST be built from
  Dockerfiles in the repository and referenced by immutable,
  explicit tags in the Compose file. `latest` tags are
  prohibited for deployed services so rollback to a previous
  image is always possible.
- **Resilience**: Long-running containers MUST declare a
  restart policy (`restart: unless-stopped`) so the stack
  recovers automatically after host reboots or power loss.
- **Data Backup (NON-NEGOTIABLE)**: The SQLite database is the
  system of record and MUST be backed up on a schedule to a
  location off the host (e.g., NAS or cloud drive). The backup
  and restore procedure MUST be documented and periodically
  verified.
- **Local Deployment Automation**: The Docker Compose stack
  MUST include scripted setup that builds, configures, and
  starts all services with minimal manual interaction. The
  operator MUST only need to provide environment-specific
  values (gateway IP, MQTT credentials) via a configuration
  file or environment variables; all other steps MUST be
  automated.
- **CI Zero Warnings**: All errors and warnings reported by
  GitHub Actions during push and pull request workflows MUST be
  analyzed and resolved. Each CI run MUST complete with zero
  warnings and zero errors. Persistent warnings that cannot be
  fixed MUST be suppressed with an inline justification comment
  explaining why.
- **Dependency Hygiene**: Open Dependabot pull requests and
  security alerts MUST be triaged during every work session.
  When CI is green, dependency update PRs MUST be merged as
  part of routine cleanup rather than left to accumulate.
- **GitHub Issue Discipline (NON-NEGOTIABLE)**:
  - **Traceability**: Every User Story issue in GitHub MUST
    be a sub-issue of its parent Feature issue. Clean
    traceability from Feature → User Story MUST be
    maintained at all times via GitHub's sub-issue
    relationships. Issues MUST NOT exist without proper
    parent linkage.
  - **Synchronization**: Every Feature and User Story
    defined in speckit documents (spec.md, plan.md) MUST
    have a corresponding GitHub issue. GitHub issues MUST
    be kept in sync with speckit documents — when an
    issue is added, updated, or completed, the corresponding
    speckit document MUST be updated accordingly. GitHub
    issues are the source of truth; speckit documents reflect
    that truth so GitHub Copilot can function effectively.
  - **Task Tracking**: Tasks defined in tasks.md do not
    require individual GitHub issues. Tasks MUST be
    reflected as checklist items in their parent User Story
    issue body. Task completion is tracked in both tasks.md
    and the User Story issue checklist.

**Rationale**: A single-host Docker Compose stack is fully
reproducible from the repository, so heavyweight cloud IaC and
staging/production parity are unnecessary. The real operational
risks for a local deployment — losing the history file and
unattended downtime after a reboot — are addressed by mandated
backups and restart policies.

## Governance

- This constitution supersedes all other development practices.
  When a conflict arises, the constitution is authoritative.
- **Amendments**: Any change to this constitution MUST be
  documented with a version bump, rationale, and updated date.
  Amendments follow semantic versioning:
  - MAJOR: Principle removal or backward-incompatible redefinition.
  - MINOR: New principle or section added, or material expansion.
  - PATCH: Clarifications, wording fixes, non-semantic refinements.
- **Compliance Review**: Every plan and implementation MUST
  include a Constitution Check gate verifying alignment with
  these principles.
- **Complexity Justification**: Any deviation from Simplicity or
  YAGNI MUST be documented in the plan's Complexity Tracking
  table with a rejected simpler alternative.

**Version**: 2.0.0 | **Ratified**: 2026-06-20 | **Last Amended**: 2026-06-20
