# Synqora

`Synqora` is a planned end-to-end Oracle-to-PostgreSQL migration and replication platform.

It is designed to support:

- one-time migrations
- migration plus CDC until cutover
- continuous replication and synchronization
- on-premises, cloud, and hybrid deployments

The goal is to build more than a schema-conversion tool. `Synqora` is intended to act as a migration operating system with orchestration, conversion intelligence, data movement, validation, and cutover control in one framework.

The current preferred deployment direction is:

- `SaaS-hosted control plane`
- `customer-managed Synqora Agents`
- `web-first collaboration with CLI support`

## Active Implementation Stack

Synqora is now moving to the long-term product stack:

- `Go control plane`
  - [apps/api-go](/Users/saiendla/Desktop/OracletoPGMigration/apps/api-go)
  - owns tenancy, session/auth boundary, projects, database connection metadata, workflow queueing, and API contracts
- `React + TypeScript web app`
  - [apps/web-react](/Users/saiendla/Desktop/OracletoPGMigration/apps/web-react)
  - owns the enterprise web UI, project workflow, source connection onboarding, and lifecycle readiness gates
- `Python migration engine`
  - [apps/engine-python](/Users/saiendla/Desktop/OracletoPGMigration/apps/engine-python)
  - owns deterministic assessment, datatype mapping rules, migration scoring, and future conversion/validation engines
- `PostgreSQL-backed control plane`
  - remains the durable-state target for tenants, projects, connectors, jobs, evidence, audit history, and policy state

The previous Node/static implementation remains in `apps/cloud`, `apps/agent`, and `ui-prototype` as a temporary legacy/reference prototype only. New product work should go into Go, React, or Python unless explicitly marked as a legacy compatibility change.

## Local Development

Run the Go API:

```bash
npm run start:api
```

Run the React app in another terminal:

```bash
cd apps/web-react
npm install
cd ../..
npm run start:web
```

Run the active stack tests:

```bash
npm run test:api
npm run test:engine
```

Run all currently available tests, including legacy prototype tests:

```bash
npm test
```

Local demo account:

- Email: `sai@example.com`
- Password: `Synqora_123`

## Conversion Engine Direction

Synqora should be a `rules-first` migration platform.

The expected conversion flow is:

1. parse Oracle metadata, DDL, and code into normalized inventory
2. apply deterministic rule packs
3. generate PostgreSQL artifacts
4. validate generated syntax and dependencies against a disposable PostgreSQL target
5. classify every artifact as `AUTO_SAFE`, `AUTO_REVIEW`, `MANUAL_REQUIRED`, or `BLOCKER`
6. use AI assistance only for complex low-confidence rewrites, explanations, or remediation suggestions

This means auto-conversion should happen through rules, not through Claude, Codex, or any other LLM as the primary engine.

PostgreSQL-facing rules should carry official PostgreSQL documentation links, target version ranges, validation fixtures, and last-reviewed timestamps. The initial source registry includes PostgreSQL documentation for partitioning, `CREATE TABLE`, date/time behavior, numeric types, identifiers, indexes, and constraints.

The first concrete ruleset is now:

- [rules/oracle_to_postgres_datatypes.v1.json](/Users/saiendla/Desktop/OracletoPGMigration/rules/oracle_to_postgres_datatypes.v1.json)
  - versioned datatype mapping catalog with automation class, confidence, severity, evidence requirements, review triggers, and official documentation references
- [rules/oracle_to_postgres_datatype_rules.md](/Users/saiendla/Desktop/OracletoPGMigration/rules/oracle_to_postgres_datatype_rules.md)
  - explanation of why datatype conversion must be conservative and evidence-driven

## Vision

`Synqora` should automate the full migration lifecycle from source discovery to post-cutover stabilization while still giving migration engineers:

- evidence for every decision
- restartable workflows
- human review where confidence is low
- visibility into risk, progress, and blockers

## Core Capabilities

- source and target discovery
- migration assessment and effort estimation
- schema and code conversion
- deployment orchestration
- bulk data load with restartability
- CDC / continuous replication
- schema, code, and data validation
- cutover management
- post-cutover hypercare

## Transport-Agnostic Migration Protocol

Synqora should let customers choose the data movement transport while Synqora enforces the migration protocol.

Supported transport directions:

- `Cloud native`: AWS DMS and equivalent managed migration services
- `Commercial replication`: Qlik Replicate, HVR, Oracle GoldenGate, and similar enterprise CDC platforms
- `Open source`: Debezium/Kafka Connect, ora2pg, pgloader, PostgreSQL COPY-based loaders
- `Customer managed`: Oracle Data Pump, files, object storage, external tables, custom unload/load scripts, and provider-specific bulk paths

Synqora owns the consistency contract around those tools:

- snapshot or checkpoint boundary
- global, schema-wave, or table-level consistency mode
- chunk manifest and retry plan
- CDC start checkpoint
- full-load and CDC evidence
- row-count, checksum, semantic, and business validation
- CDC lag and cutover gates

Consistency modes:

1. `Global Snapshot Mode`
- one SCN/checkpoint for all schemas and tables
- best correctness and simplest CDC model
- requires source undo/log retention to survive the load window

2. `Schema Wave Snapshot Mode`
- one SCN/checkpoint per dependency-aware schema or application wave
- better for phased enterprise migrations
- requires explicit cross-wave dependency validation

3. `Table-Level Snapshot Mode`
- one SCN/checkpoint per table or table group
- useful for 5 TB+ tables, hot tables, and very long migrations
- requires the strongest CDC, reconciliation, and cutover evidence

## Product Modes

1. `Assessment Only`
- inventory, score, and report migration complexity

2. `Migration Factory`
- assess, convert, deploy, load, and validate

3. `Migration + CDC`
- run full load, then keep source and target synchronized until cutover

4. `Continuous Replication`
- support long-running synchronization for DR, reporting, or modernization programs

## Internal Execution Board

Synqora should be managed internally with a lightweight Jira-style planning board.

Daily operating target:

- minimum `4 hours/day` protected product execution time
- hour 1: architecture, ticket grooming, acceptance criteria
- hour 2: development
- hour 3: testing and evidence capture
- hour 4: review, documentation, bug triage, and next-day planning

Ticket lanes:

- `Backlog`: ideas, architecture decisions, migration pitfalls, connector candidates
- `In Development`: active implementation work
- `Testing`: unit, API, UI, migration consistency, security, and regression validation
- `Bugs`: reported defects, environment issues, broken flows, incorrect product behavior
- `Ready For Go-Live`: cloud deployment, runbooks, SSO, observability, support readiness

Every major discussion should become one or more trackable tickets with acceptance criteria, test evidence, and product artifact updates.

## Platform Model

The architecture is organized into four planes:

- `Control Plane`
  - orchestration, approvals, checkpoints, workflow state, cutover control
- `Data Plane`
  - extraction, bulk load, CDC capture, apply, lag tracking
- `Rule Plane`
  - conversion rules, scoring, heuristics, auto-fix patterns
- `Evidence Plane`
  - inventories, artifacts, validation outputs, metrics, audit trail

## End-to-End Lifecycle

`Synqora` is being designed around this execution flow:

1. `Connect`
2. `Discover`
3. `Assess`
4. `Convert`
5. `Deploy`
6. `Load`
7. `Replicate`
8. `Validate`
9. `Cutover`
10. `Stabilize`

## Connection-First Product Flow

For a real Oracle-to-PostgreSQL product, the first user-facing action should be creating the business project context and then attaching database connections to that context.

The product hierarchy should be:

- `Organization / Tenant`
  - customer boundary, users, roles, policies, audit trail, and SSO
- `Business Unit / Portfolio`
  - Finance, HR, Supply Chain, or other operating groups with separate ownership and budgets
- `Migration Project`
  - business initiative such as ERP Core, HR Warehouse, or Billing Modernization
- `Database Connection Profiles`
  - reusable Oracle source and PostgreSQL target endpoints attached to one project or shared across a portfolio

That means `Synqora` should support:

- creating a project without forcing immediate target database details
- running `Assessment Only` with just Oracle source metadata access
- registering one or many `Oracle source` endpoints under the project or business unit
- adding `PostgreSQL target` endpoints later when conversion, deployment, load, CDC, or validation begins
- selecting the `Synqora Agent` runtime that can actually reach the relevant source and target systems
- validating connectivity, privileges, and policy boundaries from that agent
- capturing target capabilities only when they are needed for conversion or deployment

Architecturally, the preferred model is:

- `SaaS control plane`
  - stores connection metadata, workflow state, evidence, and policy
- `Customer-side Synqora Agent`
  - performs the real source and target connectivity checks
  - holds or retrieves credentials in the customer-managed plane
  - executes discovery, extraction, load, and CDC near the databases

This avoids assuming that the SaaS layer can directly log in to customer Oracle or PostgreSQL systems, which is usually the wrong default for enterprise environments.

Assessment should not require target details. The assessment phase should discover Oracle inventory, PL/SQL/code complexity, storage, data volumes, feature usage, semantic risks, and migration effort. The target platform choice can be made after sizing, compatibility scoring, extension review, HA/DR requirements, and cloud/provider constraints are understood.

## SaaS Account Model

The working prototype now includes a local SaaS-style login boundary:

- `Public product entry`
  - unauthenticated users land on an original Synqora product page before opening sign in or account creation
- `User login`
  - browser users authenticate through `Synqora Cloud`
- `Create account`
  - email/password signup creates a new organization tenant and owner user
- `Provider entry points`
  - Google, GitHub, and Company SSO buttons are present in the UI for production OAuth/OIDC/SAML integration
- `Tenant context`
  - projects, dashboards, agents, and jobs are shown under the signed-in tenant
- `HTTP-only session cookie`
  - the browser does not store API tokens in local storage
- `Separate agent trust`
  - customer-side agents still use bearer tokens from the agent registration flow
- `Enterprise integration surface`
  - the product model now exposes connectors, workflow hooks, guardrails, evidence, observability, and extensibility as first-class platform concepts

Local demo account:

- Email: `sai@example.com`
- Password: `Synqora_123`

For production, this local demo verifier should be replaced by OIDC/SAML SSO, MFA, SCIM provisioning, role-based access control, session revocation, and audit logging.

Local email signup is functional for prototype validation. Passwords are stored as salted PBKDF2 hashes in the local control-plane database, not as raw plaintext.

## Current Repository Contents

- [migration_framework_architecture.md](/Users/saiendla/Desktop/OracletoPGMigration/migration_framework_architecture.md)
  - detailed platform architecture for `Synqora`
- [synqora_saas_deployment_architecture.md](/Users/saiendla/Desktop/OracletoPGMigration/synqora_saas_deployment_architecture.md)
  - concrete SaaS deployment model for `Synqora`
- [synqora_cloud_control_plane_schema.md](/Users/saiendla/Desktop/OracletoPGMigration/synqora_cloud_control_plane_schema.md)
  - concrete control-plane data model for `Synqora Cloud`
- [synqora_agent_registration_trust_model.md](/Users/saiendla/Desktop/OracletoPGMigration/synqora_agent_registration_trust_model.md)
  - enrollment, identity, authorization, and revocation model for `Synqora Agent`
- [synqora_cloud_agent_job_protocol.md](/Users/saiendla/Desktop/OracletoPGMigration/synqora_cloud_agent_job_protocol.md)
  - pull-based execution protocol between `Synqora Cloud` and customer-side agents
- [apps/cloud/src/server.js](/Users/saiendla/Desktop/OracletoPGMigration/apps/cloud/src/server.js)
  - minimal `Synqora Cloud` HTTP service
- [apps/cloud/src/store.js](/Users/saiendla/Desktop/OracletoPGMigration/apps/cloud/src/store.js)
  - in-memory control-plane state and job orchestration prototype
- [apps/agent/src/cli.js](/Users/saiendla/Desktop/OracletoPGMigration/apps/agent/src/cli.js)
  - minimal `Synqora Agent` CLI
- [rules/oracle_to_postgres_datatypes.v1.json](/Users/saiendla/Desktop/OracletoPGMigration/rules/oracle_to_postgres_datatypes.v1.json)
  - deterministic Oracle-to-PostgreSQL datatype conversion ruleset

## Current Focus

The current design direction assumes:

- Oracle is the primary source engine
- PostgreSQL is the primary target engine
- the platform may run across any cloud provider or on-premises
- the framework must support both one-time migration and CDC-based cutover
- the primary product shape is SaaS control plane plus customer-side agents

## Next Design Deliverables

- service and API contracts
- Oracle source adapter contract
- PostgreSQL target adapter contract
- migration run state machine
- CDC checkpoint model
- SaaS authorization model
- artifact and evidence storage contract
- validation catalog
- dashboard and workflow wireframes

## Run The Scaffold

Requirements:

- Node.js 24+ recommended
- PostgreSQL client tools (`psql`) if using internal PostgreSQL metadata storage

Start `Synqora Cloud` with disposable in-memory state:

```bash
npm run start:cloud
```

Recommended for product development: start `Synqora Cloud` with the internal PostgreSQL metadata database:

```bash
SYNQORA_DB_NAME=postgres npm run db:internal:setup
SYNQORA_DB_NAME=postgres npm run start:cloud:internal
```

Open:

- `http://127.0.0.1:8787`

Sign in with:

- Email: `sai@example.com`
- Password: `Synqora_123`

Demo bootstrap token:

- `synqora-demo-token`

Register a local agent:

```bash
npm run agent:register -- --token synqora-demo-token
```

Send a heartbeat:

```bash
npm run agent:heartbeat
```

## Control-Plane Metadata Database

Synqora should use a real backend database for product work. The current safe direction is:

- Use the already available internal PostgreSQL database for local/control-plane metadata now.
- Keep customer Oracle/PostgreSQL source and target data outside the SaaS database.
- Store only Synqora metadata: organizations, tenants/accounts, projects, connection profiles, job state, evidence references, validation summaries, and audit records.
- Later, move the same metadata schema to managed cloud PostgreSQL such as Aurora PostgreSQL, Cloud SQL, AlloyDB, Azure Database for PostgreSQL, or self-managed PostgreSQL by changing `SYNQORA_DATABASE_URL`.

Storage modes:

- `memory`: quick UI demo only; state is lost on restart.
- `internal_postgres`: preferred local/internal metadata database.
- `postgres`: alias for PostgreSQL-backed metadata storage.

Example:

```bash
cp .env.example .env
SYNQORA_DB_NAME=postgres npm run db:internal:setup
SYNQORA_DB_NAME=postgres npm run start:cloud:internal
```

Cloud-ready swap later:

```bash
SYNQORA_STORAGE=internal_postgres \
SYNQORA_DATABASE_URL=postgresql://user:password@managed-postgres.example.com:5432/synqora_control \
npm run start:cloud:internal
```

Poll for work:

```bash
npm run agent:poll
```

Lease and execute one mock job:

```bash
npm run agent:run-once
```

Run tests:

```bash
npm test
```

## Summary

`Synqora` is intended to be a professional migration platform for enterprise Oracle-to-PostgreSQL modernization, not just a one-off conversion utility.

If built as planned, it should support assessment, conversion, deployment, full load, CDC, validation, cutover, and hypercare in a single framework.
