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

The product architecture remains unchanged:

- SaaS control plane coordinates work
- customer-side agents perform database connectivity and execution
- assessment starts with Oracle source only
- PostgreSQL target is added later for conversion, load, CDC, validation, and cutover
- SaaS stores metadata, evidence, workflow state, and audit history
- SaaS does not store raw database passwords
