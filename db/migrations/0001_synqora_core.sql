CREATE SCHEMA IF NOT EXISTS synqora_core;

CREATE TABLE IF NOT EXISTS synqora_core.schema_migrations (
  migration_name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.tenant (
  tenant_id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL,
  deployment_tier text NOT NULL,
  region_home text,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.user_account (
  user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL,
  auth_provider text,
  auth_subject text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.tenant_user (
  tenant_user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  user_id uuid NOT NULL REFERENCES synqora_core.user_account (user_id),
  membership_status text NOT NULL,
  default_role text,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.migration_project (
  project_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  project_code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL,
  source_engine text NOT NULL,
  target_engine text NOT NULL,
  engagement_mode text NOT NULL,
  deployment_mode text NOT NULL,
  owner_user_id uuid REFERENCES synqora_core.user_account (user_id),
  discovered_objects integer NOT NULL DEFAULT 0,
  conversion_rate_pct integer NOT NULL DEFAULT 0,
  data_migrated_tb numeric(10,1) NOT NULL DEFAULT 0,
  critical_issues integer NOT NULL DEFAULT 0,
  warning_issues integer NOT NULL DEFAULT 0,
  pipeline_stage text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.environment (
  environment_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  project_id uuid NOT NULL REFERENCES synqora_core.migration_project (project_id),
  environment_name text NOT NULL,
  environment_type text NOT NULL,
  network_zone text,
  cloud_provider text,
  region_name text,
  status text NOT NULL,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.agent_pool (
  agent_pool_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  pool_name text NOT NULL,
  pool_type text NOT NULL,
  region_name text,
  status text NOT NULL,
  capabilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.agent_registration (
  agent_registration_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  agent_pool_id uuid NOT NULL REFERENCES synqora_core.agent_pool (agent_pool_id),
  registration_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  issued_by_user_id uuid REFERENCES synqora_core.user_account (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.agent_instance (
  agent_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  agent_pool_id uuid NOT NULL REFERENCES synqora_core.agent_pool (agent_pool_id),
  agent_name text NOT NULL,
  agent_version text,
  platform_type text,
  runtime_mode text,
  status text NOT NULL,
  registered_at timestamptz NOT NULL,
  last_heartbeat_at timestamptz,
  capabilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.agent_credential (
  agent_credential_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  agent_id uuid NOT NULL REFERENCES synqora_core.agent_instance (agent_id),
  access_token_hash text NOT NULL,
  issued_at timestamptz NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.agent_heartbeat (
  heartbeat_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  agent_id uuid NOT NULL REFERENCES synqora_core.agent_instance (agent_id),
  heartbeat_at timestamptz NOT NULL,
  health_status text NOT NULL,
  cpu_pct numeric(5,2),
  memory_pct numeric(5,2),
  active_job_count integer NOT NULL DEFAULT 0,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.workflow_run (
  workflow_run_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  project_id uuid NOT NULL REFERENCES synqora_core.migration_project (project_id),
  workflow_type text NOT NULL,
  status text NOT NULL,
  trigger_mode text,
  triggered_by_user_id uuid REFERENCES synqora_core.user_account (user_id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.workflow_step_run (
  step_run_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  workflow_run_id uuid NOT NULL REFERENCES synqora_core.workflow_run (workflow_run_id),
  step_name text NOT NULL,
  step_order integer NOT NULL,
  status text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.job_run (
  job_run_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  project_id uuid NOT NULL REFERENCES synqora_core.migration_project (project_id),
  workflow_run_id uuid NOT NULL REFERENCES synqora_core.workflow_run (workflow_run_id),
  step_run_id uuid REFERENCES synqora_core.workflow_step_run (step_run_id),
  job_type text NOT NULL,
  job_version text NOT NULL,
  status text NOT NULL,
  priority text NOT NULL,
  capability_required text NOT NULL,
  lease_expires_at timestamptz,
  leased_to_agent_id uuid REFERENCES synqora_core.agent_instance (agent_id),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 1,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_json jsonb,
  failure_json jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.job_checkpoint (
  checkpoint_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  job_run_id uuid NOT NULL REFERENCES synqora_core.job_run (job_run_id),
  checkpoint_type text NOT NULL,
  checkpoint_key text NOT NULL,
  checkpoint_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synqora_core.state_transition_event (
  event_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES synqora_core.tenant (tenant_id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason_code text,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_synqora_project_tenant_status
  ON synqora_core.migration_project (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_synqora_agent_instance_tenant_status
  ON synqora_core.agent_instance (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_synqora_job_run_tenant_status_pool
  ON synqora_core.job_run (tenant_id, status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_synqora_job_checkpoint_job_captured
  ON synqora_core.job_checkpoint (job_run_id, captured_at DESC);
