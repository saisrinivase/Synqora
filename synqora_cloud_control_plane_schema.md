# Synqora Cloud Control-Plane Schema

## 1. Purpose

This document defines the `Synqora Cloud` control-plane data model.

It is intended to be concrete enough to guide:

- database schema design
- service boundaries
- API contracts
- workflow orchestration
- multi-tenant authorization
- agent coordination

This schema is for the `control plane`, not the customer data plane. It stores metadata, state, evidence, orchestration records, and references to artifacts. It should not be treated as the default storage location for customer raw database extracts.

## 2. Design Goals

The control-plane schema must support:

- multi-tenant SaaS isolation
- project and environment lifecycle
- agent registration and trust
- orchestration of jobs and runs
- restartable workflows and checkpoints
- migration issue tracking
- artifact review and approval
- CDC visibility and state
- validation and cutover evidence
- auditability

## 3. Persistence Principles

1. `tenant_id` on almost every business table
- tenant scoping must be explicit, not inferred

2. immutable run history
- execution records should be append-friendly

3. current state plus history
- keep the current operational state easily queryable
- keep event or run history for audit and debugging

4. references over payload bloat
- store large artifacts in object storage
- keep object-store references in the control-plane database

5. idempotent orchestration support
- jobs, checkpoints, and state transitions must allow safe retries

## 4. Technology Assumption

Use PostgreSQL for the control-plane metadata database.

Reasons:

- relational consistency
- JSONB for flexible evidence payloads
- strong indexing support
- natural fit for event, run, and workflow state records

## 5. Identifier Strategy

Recommended identifier convention:

- `*_id` as UUID
- `external_ref` for human-facing stable references where needed
- `created_at`, `updated_at`
- `created_by_user_id`, `updated_by_user_id` where applicable

Suggested timestamp fields:

- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Suggested status fields:

- plain constrained text or enum-like check constraints

## 6. Schema Organization

The logical model can live in one application schema, for example:

- `synqora_core`

Optional split later:

- `synqora_core`
- `synqora_audit`
- `synqora_metrics`

For now, a single logical schema is simpler.

## 7. Domain Areas

The control-plane schema should be grouped into these domains:

1. tenancy and identity
2. projects and environments
3. agent management
4. discovery and inventory
5. assessment and issues
6. conversion and artifacts
7. orchestration and execution
8. data load
9. CDC and replication
10. validation and reconciliation
11. cutover and hypercare
12. audit, notifications, and configuration

## 8. Core Tables by Domain

## 8.1 Tenancy and Identity

### `tenant`

Purpose:

- top-level customer or organizational account

Key fields:

- `tenant_id`
- `name`
- `slug`
- `status`
- `deployment_tier`
- `region_home`
- `settings_json`
- `created_at`
- `updated_at`

Notes:

- `slug` should be unique
- `status` examples: `active`, `suspended`, `trial`, `closed`

### `tenant_keyset`

Purpose:

- track tenant-scoped encryption or signing configuration references

Key fields:

- `tenant_keyset_id`
- `tenant_id`
- `key_provider`
- `key_reference`
- `status`
- `rotated_at`

### `user_account`

Purpose:

- platform user identity

Key fields:

- `user_id`
- `email`
- `display_name`
- `status`
- `auth_provider`
- `auth_subject`
- `last_login_at`

### `tenant_user`

Purpose:

- membership of users in tenants

Key fields:

- `tenant_user_id`
- `tenant_id`
- `user_id`
- `membership_status`
- `default_role`
- `joined_at`

### `role_definition`

Purpose:

- tenant-scoped or global RBAC role catalog

Key fields:

- `role_id`
- `tenant_id nullable`
- `role_name`
- `role_scope`
- `permissions_json`

### `user_role_binding`

Purpose:

- role assignments to users within a tenant

Key fields:

- `binding_id`
- `tenant_id`
- `user_id`
- `role_id`
- `resource_scope_type`
- `resource_scope_id nullable`

## 8.2 Projects and Environments

### `migration_project`

Purpose:

- top-level migration workspace

Key fields:

- `project_id`
- `tenant_id`
- `project_code`
- `name`
- `description`
- `status`
- `source_engine`
- `target_engine`
- `engagement_mode`
- `deployment_mode`
- `owner_user_id`
- `created_at`
- `updated_at`

Recommended values:

- `engagement_mode`: `assessment`, `migration`, `migration_cdc`, `continuous_replication`
- `deployment_mode`: `saas_standard`, `saas_dedicated`, `private_control_plane`

### `project_tag`

Purpose:

- project labels for reporting and filtering

Key fields:

- `project_tag_id`
- `tenant_id`
- `project_id`
- `tag_name`

### `environment`

Purpose:

- logical environment entry such as source-prod, target-stage, target-prod

Key fields:

- `environment_id`
- `tenant_id`
- `project_id`
- `environment_name`
- `environment_type`
- `network_zone`
- `cloud_provider`
- `region_name`
- `status`
- `settings_json`

Recommended values:

- `environment_type`: `source`, `target`, `staging`, `validation`

### `connection_profile`

Purpose:

- connection metadata without exposing raw secrets

Key fields:

- `connection_profile_id`
- `tenant_id`
- `environment_id`
- `engine_type`
- `hostname_or_endpoint`
- `port`
- `database_name`
- `service_name nullable`
- `connect_mode`
- `secret_reference`
- `tls_mode`
- `status`
- `last_tested_at`

### `network_profile`

Purpose:

- optional normalized network or connectivity policy profile

Key fields:

- `network_profile_id`
- `tenant_id`
- `environment_id`
- `profile_name`
- `egress_mode`
- `private_link_required`
- `ip_allowlist_json`

## 8.3 Agent Management

### `agent_pool`

Purpose:

- logical grouping of agents that can execute jobs for one or more environments

Key fields:

- `agent_pool_id`
- `tenant_id`
- `pool_name`
- `pool_type`
- `region_name`
- `status`
- `capabilities_json`

### `agent_registration`

Purpose:

- bootstrap record used for initial trust enrollment

Key fields:

- `agent_registration_id`
- `tenant_id`
- `agent_pool_id`
- `registration_token_hash`
- `expires_at`
- `max_uses`
- `used_count`
- `status`
- `issued_by_user_id`

### `agent_instance`

Purpose:

- registered runtime agent

Key fields:

- `agent_id`
- `tenant_id`
- `agent_pool_id`
- `agent_name`
- `agent_version`
- `platform_type`
- `runtime_mode`
- `status`
- `registered_at`
- `last_heartbeat_at`
- `certificate_thumbprint`
- `capabilities_json`

Recommended values:

- `runtime_mode`: `docker`, `kubernetes`, `vm`
- `status`: `active`, `offline`, `draining`, `retired`, `unhealthy`

### `agent_environment_binding`

Purpose:

- map which agents or pools can access which environments

Key fields:

- `binding_id`
- `tenant_id`
- `agent_id nullable`
- `agent_pool_id nullable`
- `environment_id`
- `access_mode`
- `status`

### `agent_heartbeat`

Purpose:

- time-series heartbeat and health snapshot

Key fields:

- `heartbeat_id`
- `tenant_id`
- `agent_id`
- `heartbeat_at`
- `health_status`
- `cpu_pct nullable`
- `memory_pct nullable`
- `active_job_count`
- `metrics_json`

Retention:

- short to medium retention, then aggregate

## 8.4 Discovery and Inventory

### `discovery_run`

Purpose:

- a discovery execution against one or more environments

Key fields:

- `discovery_run_id`
- `tenant_id`
- `project_id`
- `source_environment_id`
- `target_environment_id nullable`
- `status`
- `started_at`
- `completed_at`
- `triggered_by_user_id nullable`
- `agent_id`

### `inventory_snapshot`

Purpose:

- a logical snapshot container for discovered metadata

Key fields:

- `snapshot_id`
- `tenant_id`
- `project_id`
- `discovery_run_id`
- `environment_id`
- `snapshot_label`
- `snapshot_type`
- `captured_at`

### `inventory_object`

Purpose:

- normalized source or target object inventory

Key fields:

- `inventory_object_id`
- `tenant_id`
- `snapshot_id`
- `object_type`
- `object_name`
- `schema_name`
- `parent_object_name nullable`
- `source_system_identifier`
- `attributes_json`
- `ddl_reference_uri nullable`

Recommended values:

- `object_type`: `table`, `view`, `package`, `procedure`, `function`, `trigger`, `index`, `sequence`, `synonym`, `job`, `grant`, `role`

### `inventory_dependency`

Purpose:

- graph edges between discovered objects

Key fields:

- `dependency_id`
- `tenant_id`
- `snapshot_id`
- `from_inventory_object_id`
- `to_inventory_object_id`
- `dependency_type`

### `inventory_statistic`

Purpose:

- discovered metrics such as row counts, segment sizes, partition counts

Key fields:

- `inventory_stat_id`
- `tenant_id`
- `snapshot_id`
- `inventory_object_id`
- `metric_name`
- `metric_value_numeric nullable`
- `metric_value_text nullable`

## 8.5 Assessment and Issues

### `assessment_run`

Purpose:

- one execution of the migration assessment engine

Key fields:

- `assessment_run_id`
- `tenant_id`
- `project_id`
- `source_snapshot_id`
- `target_snapshot_id nullable`
- `status`
- `ruleset_version`
- `started_at`
- `completed_at`

### `assessment_issue`

Purpose:

- primary issue catalog for migration risks

Key fields:

- `issue_id`
- `tenant_id`
- `project_id`
- `assessment_run_id`
- `issue_code`
- `category`
- `severity`
- `confidence`
- `object_type`
- `object_name`
- `schema_name nullable`
- `summary`
- `evidence_json`
- `recommendation_text`
- `autofix_available`
- `status`
- `owner_user_id nullable`
- `suppressed_until nullable`

Recommended values:

- `status`: `open`, `accepted`, `fixed`, `suppressed`, `false_positive`

### `risk_score`

Purpose:

- aggregated project or run scores

Key fields:

- `risk_score_id`
- `tenant_id`
- `project_id`
- `assessment_run_id`
- `score_type`
- `score_value`
- `score_band`
- `explanation_json`

Examples:

- migration complexity
- cutover readiness
- plan volatility
- data movement effort

### `effort_estimate`

Purpose:

- estimated work buckets

Key fields:

- `effort_estimate_id`
- `tenant_id`
- `project_id`
- `assessment_run_id`
- `workstream_name`
- `estimated_units`
- `unit_type`
- `estimate_confidence`
- `notes`

## 8.6 Conversion and Artifacts

### `conversion_run`

Purpose:

- one execution of conversion logic

Key fields:

- `conversion_run_id`
- `tenant_id`
- `project_id`
- `source_snapshot_id`
- `status`
- `ruleset_version`
- `started_at`
- `completed_at`

### `conversion_artifact`

Purpose:

- produced target artifact, usually stored externally

Key fields:

- `artifact_id`
- `tenant_id`
- `project_id`
- `conversion_run_id`
- `source_inventory_object_id nullable`
- `artifact_type`
- `artifact_name`
- `storage_uri`
- `content_hash`
- `quality_score`
- `review_state`
- `version_no`
- `metadata_json`

Recommended values:

- `artifact_type`: `ddl`, `function_code`, `procedure_code`, `grant_script`, `validation_script`, `report`
- `review_state`: `generated`, `in_review`, `approved`, `rejected`, `superseded`

### `conversion_rule_hit`

Purpose:

- explain which rules were used on which artifacts

Key fields:

- `rule_hit_id`
- `tenant_id`
- `conversion_run_id`
- `artifact_id`
- `rule_code`
- `severity`
- `transformation_summary`
- `evidence_json`

### `manual_review_item`

Purpose:

- queue for human review

Key fields:

- `review_item_id`
- `tenant_id`
- `project_id`
- `artifact_id`
- `review_reason`
- `priority`
- `status`
- `assigned_user_id nullable`

## 8.7 Orchestration and Execution

### `workflow_run`

Purpose:

- top-level execution container for a full lifecycle action

Key fields:

- `workflow_run_id`
- `tenant_id`
- `project_id`
- `workflow_type`
- `status`
- `started_at`
- `completed_at`
- `trigger_mode`
- `triggered_by_user_id nullable`

Examples:

- assessment
- conversion
- deployment
- full_load
- migration_cdc
- validation
- cutover

### `workflow_step_run`

Purpose:

- step-level execution under a workflow

Key fields:

- `step_run_id`
- `tenant_id`
- `workflow_run_id`
- `step_name`
- `step_order`
- `status`
- `started_at`
- `completed_at`
- `agent_id nullable`
- `checkpoint_reference nullable`

### `job_definition`

Purpose:

- normalized job type catalog

Key fields:

- `job_definition_id`
- `job_type`
- `job_version`
- `payload_schema_version`
- `capability_required`
- `retry_policy_json`

### `job_run`

Purpose:

- executable unit sent to an agent

Key fields:

- `job_run_id`
- `tenant_id`
- `project_id`
- `workflow_run_id`
- `step_run_id nullable`
- `job_definition_id`
- `agent_id nullable`
- `agent_pool_id nullable`
- `status`
- `priority`
- `payload_json`
- `lease_expires_at nullable`
- `attempt_count`
- `max_attempts`
- `started_at`
- `completed_at`

Recommended values:

- `status`: `queued`, `leased`, `running`, `succeeded`, `failed`, `cancelled`, `timed_out`

### `job_checkpoint`

Purpose:

- restart state for long-running jobs

Key fields:

- `checkpoint_id`
- `tenant_id`
- `job_run_id`
- `checkpoint_type`
- `checkpoint_key`
- `checkpoint_state_json`
- `captured_at`

### `job_log_ref`

Purpose:

- pointer to structured logs stored elsewhere or summarized locally

Key fields:

- `job_log_ref_id`
- `tenant_id`
- `job_run_id`
- `log_storage_uri`
- `summary_json`

### `state_transition_event`

Purpose:

- append-only state change journal

Key fields:

- `event_id`
- `tenant_id`
- `entity_type`
- `entity_id`
- `from_status nullable`
- `to_status`
- `reason_code nullable`
- `details_json`
- `occurred_at`
- `actor_type`
- `actor_id nullable`

## 8.8 Data Load

### `migration_protocol_plan`

Purpose:

- product-level consistency and transport contract for a migration run
- separates Synqora governance from the chosen copy/CDC tool

Key fields:

- `protocol_plan_id`
- `tenant_id`
- `project_id`
- `workflow_run_id`
- `transport_provider`
- `transport_provider_type`
- `consistency_mode`
- `source_checkpoint_kind`
- `source_checkpoint_value`
- `cdc_start_checkpoint_value nullable`
- `snapshot_captured_at nullable`
- `status`
- `risk_level`
- `assessment_summary_json`
- `created_at`
- `approved_at nullable`

Examples:

- `transport_provider`: `aws_dms`, `qlik_replicate`, `hvr`, `goldengate`, `debezium`, `ora2pg`, `pgloader`, `custom_unload_load`
- `transport_provider_type`: `cloud_native`, `commercial`, `open_source`, `customer_managed`
- `consistency_mode`: `global_snapshot`, `schema_wave_snapshot`, `table_level_snapshot`
- `source_checkpoint_kind`: `oracle_scn`, `goldengate_trail`, `dms_checkpoint`, `kafka_offset`, `file_manifest`

### `migration_wave`

Purpose:

- dependency-aware schema/application/table group for phased migrations
- supports global, schema-wave, and table-level snapshot strategies

Key fields:

- `migration_wave_id`
- `tenant_id`
- `protocol_plan_id`
- `wave_name`
- `wave_order`
- `object_scope_json`
- `source_checkpoint_value`
- `cdc_start_checkpoint_value nullable`
- `status`
- `dependency_notes_json`
- `validation_status`

### `chunk_manifest`

Purpose:

- approved chunking strategy before full-load jobs are created
- enables retry, evidence, and transport-provider handoff

Key fields:

- `chunk_manifest_id`
- `tenant_id`
- `protocol_plan_id`
- `migration_wave_id nullable`
- `source_object_name`
- `target_object_name`
- `chunk_strategy`
- `chunk_count`
- `estimated_bytes`
- `estimated_rows`
- `provider_settings_json`
- `status`

### `load_run`

Purpose:

- full-load execution record

Key fields:

- `load_run_id`
- `tenant_id`
- `project_id`
- `workflow_run_id`
- `protocol_plan_id nullable`
- `transport_provider`
- `source_environment_id`
- `target_environment_id`
- `status`
- `strategy`
- `started_at`
- `completed_at`

### `load_table_run`

Purpose:

- per-table bulk load state

Key fields:

- `load_table_run_id`
- `tenant_id`
- `load_run_id`
- `chunk_manifest_id nullable`
- `source_object_name`
- `target_object_name`
- `status`
- `rows_expected nullable`
- `rows_loaded nullable`
- `bytes_loaded nullable`
- `load_method`

### `load_chunk`

Purpose:

- chunk-level parallel execution state

Key fields:

- `load_chunk_id`
- `tenant_id`
- `load_table_run_id`
- `chunk_key_start nullable`
- `chunk_key_end nullable`
- `chunk_filter_sql nullable`
- `status`
- `attempt_count`
- `rows_loaded`
- `started_at nullable`
- `completed_at nullable`

### `load_error`

Purpose:

- track failed chunks or table-level load problems

Key fields:

- `load_error_id`
- `tenant_id`
- `load_chunk_id nullable`
- `load_table_run_id`
- `error_code`
- `error_summary`
- `error_details_json`

## 8.9 CDC and Replication

### `cdc_stream`

Purpose:

- logical replication or migration-CDC stream definition

Key fields:

- `cdc_stream_id`
- `tenant_id`
- `project_id`
- `protocol_plan_id nullable`
- `transport_provider`
- `source_environment_id`
- `target_environment_id`
- `stream_name`
- `stream_mode`
- `status`
- `started_at nullable`
- `stopped_at nullable`
- `settings_json`

Examples:

- `stream_mode`: `migration_cdc`, `continuous_replication`, `dr_validation`

### `cdc_checkpoint`

Purpose:

- latest durable stream checkpoint

Key fields:

- `cdc_checkpoint_id`
- `tenant_id`
- `cdc_stream_id`
- `checkpoint_kind`
- `source_position_text`
- `source_position_json`
- `target_apply_position_text nullable`
- `captured_at`

### `cdc_batch`

Purpose:

- a processed change batch or transaction bundle

Key fields:

- `cdc_batch_id`
- `tenant_id`
- `cdc_stream_id`
- `agent_id`
- `batch_sequence`
- `source_txn_id nullable`
- `status`
- `change_count`
- `applied_count`
- `started_at`
- `completed_at nullable`

### `cdc_lag_sample`

Purpose:

- lag visibility over time

Key fields:

- `lag_sample_id`
- `tenant_id`
- `cdc_stream_id`
- `measured_at`
- `source_lag_seconds nullable`
- `apply_lag_seconds nullable`
- `pending_change_count nullable`
- `metrics_json`

### `cdc_apply_error`

Purpose:

- failed apply records or batch-level problems

Key fields:

- `cdc_apply_error_id`
- `tenant_id`
- `cdc_stream_id`
- `cdc_batch_id nullable`
- `error_code`
- `error_summary`
- `retryable`
- `details_json`

### `ddl_drift_event`

Purpose:

- source-side DDL changes observed during ongoing CDC

Key fields:

- `ddl_drift_event_id`
- `tenant_id`
- `cdc_stream_id`
- `event_time`
- `object_name`
- `ddl_summary`
- `raw_ddl_ref nullable`
- `status`

## 8.10 Validation and Reconciliation

### `validation_run`

Purpose:

- one validation pass

Key fields:

- `validation_run_id`
- `tenant_id`
- `project_id`
- `workflow_run_id nullable`
- `validation_scope`
- `status`
- `started_at`
- `completed_at`

### `validation_check`

Purpose:

- catalog of validation checks executed

Key fields:

- `validation_check_id`
- `tenant_id`
- `validation_run_id`
- `check_code`
- `check_category`
- `object_scope nullable`
- `status`
- `severity`
- `summary`

### `validation_result`

Purpose:

- result record for a validation check

Key fields:

- `validation_result_id`
- `tenant_id`
- `validation_check_id`
- `result_status`
- `score nullable`
- `details_json`
- `evidence_ref nullable`

### `reconciliation_result`

Purpose:

- data-level comparison results

Key fields:

- `reconciliation_result_id`
- `tenant_id`
- `validation_run_id`
- `object_name`
- `reconciliation_type`
- `source_value_text nullable`
- `target_value_text nullable`
- `difference_value_text nullable`
- `status`
- `details_json`

### `sample_diff`

Purpose:

- row or sample-level mismatch evidence

Key fields:

- `sample_diff_id`
- `tenant_id`
- `reconciliation_result_id`
- `source_sample_ref`
- `target_sample_ref`
- `difference_json`

## 8.11 Cutover and Hypercare

### `cutover_run`

Purpose:

- one cutover attempt or rehearsal

Key fields:

- `cutover_run_id`
- `tenant_id`
- `project_id`
- `status`
- `cutover_type`
- `planned_at nullable`
- `started_at nullable`
- `completed_at nullable`
- `decision_summary nullable`

Examples:

- `cutover_type`: `rehearsal`, `production`, `rollback_test`

### `cutover_gate`

Purpose:

- required gate checks for cutover

Key fields:

- `cutover_gate_id`
- `tenant_id`
- `cutover_run_id`
- `gate_code`
- `gate_category`
- `status`
- `required`
- `evaluated_at nullable`
- `details_json`

### `cutover_decision`

Purpose:

- explicit decisions made during cutover flow

Key fields:

- `cutover_decision_id`
- `tenant_id`
- `cutover_run_id`
- `decision_type`
- `decision_value`
- `decision_by_user_id`
- `decision_at`
- `reason_text`

### `rollback_event`

Purpose:

- rollback or fallback execution record

Key fields:

- `rollback_event_id`
- `tenant_id`
- `cutover_run_id`
- `status`
- `started_at`
- `completed_at nullable`
- `details_json`

### `hypercare_issue`

Purpose:

- post-cutover operational issue tracking

Key fields:

- `hypercare_issue_id`
- `tenant_id`
- `project_id`
- `cutover_run_id`
- `category`
- `severity`
- `summary`
- `status`
- `owner_user_id nullable`

## 8.12 Audit, Notifications, and Configuration

### `audit_event`

Purpose:

- immutable operator and system audit trail

Key fields:

- `audit_event_id`
- `tenant_id`
- `event_type`
- `actor_type`
- `actor_id nullable`
- `resource_type`
- `resource_id`
- `event_time`
- `details_json`

### `notification_endpoint`

Purpose:

- notification destinations

Key fields:

- `endpoint_id`
- `tenant_id`
- `endpoint_type`
- `endpoint_name`
- `endpoint_config_ref`
- `status`

### `notification_event`

Purpose:

- message dispatch records

Key fields:

- `notification_event_id`
- `tenant_id`
- `endpoint_id`
- `event_type`
- `severity`
- `status`
- `sent_at nullable`
- `payload_json`

### `tenant_setting`

Purpose:

- normalized tenant-level configuration overrides

Key fields:

- `tenant_setting_id`
- `tenant_id`
- `setting_key`
- `setting_value_json`
- `updated_at`

## 9. Relationships

The most important relationships are:

- `tenant -> migration_project`
- `migration_project -> environment`
- `environment -> connection_profile`
- `tenant -> agent_pool -> agent_instance`
- `migration_project -> discovery_run -> inventory_snapshot -> inventory_object`
- `migration_project -> assessment_run -> assessment_issue`
- `migration_project -> conversion_run -> conversion_artifact`
- `migration_project -> workflow_run -> job_run -> job_checkpoint`
- `migration_project -> load_run -> load_table_run -> load_chunk`
- `migration_project -> cdc_stream -> cdc_checkpoint / cdc_batch / cdc_lag_sample`
- `migration_project -> validation_run -> validation_check -> validation_result`
- `migration_project -> cutover_run -> cutover_gate / cutover_decision`

## 10. Minimum Indexing Strategy

At minimum, index:

- every primary key
- every foreign key
- every `(tenant_id, created_at)` access pattern on high-volume tables
- every `(tenant_id, project_id)` access pattern on project-scoped tables
- every `(tenant_id, status)` access pattern on workflow tables
- every `(agent_id, status)` and `(agent_pool_id, status)` access pattern on job tables
- every `(cdc_stream_id, captured_at)` and `(cdc_stream_id, measured_at)` access pattern on CDC tables

Examples of useful composite indexes:

- `assessment_issue (tenant_id, project_id, status, severity)`
- `job_run (tenant_id, status, agent_pool_id, priority, created_at)`
- `job_checkpoint (job_run_id, captured_at desc)`
- `cdc_lag_sample (cdc_stream_id, measured_at desc)`
- `cutover_gate (cutover_run_id, required, status)`

## 11. Retention Guidance

Keep different data at different retention levels.

### Long retention

- projects
- environments
- issues
- artifacts
- cutover records
- audit events

### Medium retention

- validation results
- workflow runs
- job history
- reconciliation outputs

### Short retention or summarized retention

- heartbeats
- lag samples
- high-volume execution logs
- detailed chunk telemetry

## 12. Multi-Tenant Isolation Rules

Hard requirements:

- all customer-visible business tables must include `tenant_id`
- application queries must always scope by `tenant_id`
- cross-tenant references are forbidden in business tables
- artifact namespaces must be tenant-scoped
- audit queries must also be tenant-aware except for internal platform ops

## 13. State Model Guidance

Do not rely only on mutable status columns.

Use:

- current status on main tables
- append-only `state_transition_event` for history

This helps with:

- debugging
- audit
- SLA tracking
- replayability

## 14. Suggested First Implementation Cut

For V1, implement these tables first:

### Must-have V1

- `tenant`
- `user_account`
- `tenant_user`
- `migration_project`
- `environment`
- `connection_profile`
- `agent_pool`
- `agent_registration`
- `agent_instance`
- `workflow_run`
- `workflow_step_run`
- `job_definition`
- `job_run`
- `job_checkpoint`
- `inventory_snapshot`
- `inventory_object`
- `assessment_run`
- `assessment_issue`
- `conversion_run`
- `conversion_artifact`
- `load_run`
- `load_table_run`
- `cdc_stream`
- `cdc_checkpoint`
- `validation_run`
- `validation_result`
- `cutover_run`
- `cutover_gate`
- `audit_event`

### Add soon after

- `inventory_dependency`
- `risk_score`
- `manual_review_item`
- `cdc_batch`
- `cdc_lag_sample`
- `reconciliation_result`
- `cutover_decision`
- `hypercare_issue`

## 15. Open Design Questions

These should be resolved next:

1. will tenant identity be fully internal or external-IdP-first?
2. how much evidence is stored in PostgreSQL vs object storage?
3. will agent logs stream in real time or only via references?
4. is the first release strictly multi-tenant, or do we support dedicated tenant stacks immediately?
5. which entities require hard delete, soft delete, or archival only?

## 16. Recommended Next Design Documents

After this schema, the best next documents are:

1. agent registration and trust model
2. control-plane to agent job protocol
3. SaaS authorization model
4. workflow state machines
5. object storage contract for artifacts and evidence

## 17. Summary

The `Synqora Cloud` schema should behave like the operating memory of the migration platform.

It must track:

- who the tenant is
- what the project is
- where source and target live
- which agents can act
- what work is planned
- what work has run
- what evidence was produced
- whether CDC is healthy
- whether validation passed
- whether cutover is truly ready

If this schema is designed cleanly, the rest of the platform becomes much easier to build in a controlled and auditable way.
