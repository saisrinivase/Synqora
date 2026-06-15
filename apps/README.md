# Synqora Application Layout

This repository is moving to the production architecture we agreed on:

- `apps/api-go`
  - Go SaaS control-plane API
  - owns tenancy, projects, connections, workflow state, and job queue APIs
- `apps/web-react`
  - React + TypeScript web application
  - owns the authenticated product UI and lifecycle readiness states
- `apps/engine-python`
  - Python migration analysis and rules engine
  - owns Oracle-to-PostgreSQL assessment, deterministic conversion rules, scoring, and evidence classification
- `apps/cloud` and `apps/agent`
  - legacy Node prototype implementation kept temporarily as reference while the Go/React/Python stack reaches feature parity
  - supports `memory` and PostgreSQL-backed metadata storage for local/internal testing

The product architecture remains unchanged:

- SaaS control plane coordinates work
- customer-side agents perform database connectivity and execution
- assessment starts with Oracle source only
- PostgreSQL target is added later for conversion, load, CDC, validation, and cutover
- SaaS stores metadata, evidence, workflow state, and audit history
- SaaS does not store raw database passwords

## Metadata Storage Direction

For now, use the internal PostgreSQL database as the Synqora control-plane metadata store:

```bash
SYNQORA_DB_NAME=postgres npm run db:internal:setup
SYNQORA_DB_NAME=postgres npm run start:cloud:internal
```

This stores Synqora metadata only: organizations, accounts/tenants, projects, connection profiles, job state, audit trail, and evidence references. It should not store raw Oracle/PostgreSQL customer data or raw database passwords.

When the product is ready for cloud deployment, point the same storage mode at a managed PostgreSQL-compatible database with `SYNQORA_DATABASE_URL`.
