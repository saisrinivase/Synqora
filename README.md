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

## V1 Scaffold

The repository now includes a runnable V1 scaffold:

- `Synqora Cloud`
  - a lightweight Node.js control-plane prototype
- `Synqora Agent`
  - a lightweight Node.js CLI for register / heartbeat / poll / run-once flows
- `UI prototype`
  - a public Synqora product homepage plus the signed-in migration command center served by the cloud service, with SaaS login, account creation, top-level stats hydrated from the API, enterprise workspace hierarchy, project creation, and separate database connection onboarding visible in the UX

This is intentionally a thin implementation slice. It proves the product shape without locking us into a heavy framework too early.

The scaffold now supports two storage modes:

- `memory`
  - fastest for local UI and API prototyping
- `postgres`
  - durable control-plane state backed by PostgreSQL through `psql`

## Implementation Direction

The current repository is still a prototype implementation:

- `Backend / control plane`
  - currently Node.js
- `Frontend`
  - currently static HTML, CSS, and vanilla JavaScript
- `Agent`
  - currently Node.js CLI

For the longer-term enterprise product, the recommended direction is:

- `React + TypeScript frontend`
  - reusable components, route-level state, typed API contracts, testable hooks, design-system reuse, and enterprise UI maintainability
- `Go control-plane and agent services`
  - strong concurrency model, simple deployment, static binaries, long-running agent reliability, job workers, CDC orchestration, and lower operational footprint
- `PostgreSQL-backed control plane`
  - durable tenants, projects, connectors, jobs, evidence, audit history, and policy state

The current prototype should therefore be treated as a working product model and UX validation layer, not the final production stack.

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

## Product Modes

1. `Assessment Only`
- inventory, score, and report migration complexity

2. `Migration Factory`
- assess, convert, deploy, load, and validate

3. `Migration + CDC`
- run full load, then keep source and target synchronized until cutover

4. `Continuous Replication`
- support long-running synchronization for DR, reporting, or modernization programs

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

Start `Synqora Cloud`:

```bash
npm run start:cloud
```

Start `Synqora Cloud` with PostgreSQL-backed storage:

```bash
SYNQORA_DB_NAME=postgres npm run db:setup
SYNQORA_STORAGE=postgres SYNQORA_DB_NAME=postgres npm run start:cloud
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
