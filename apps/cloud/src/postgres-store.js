import crypto from 'node:crypto';

import {
  DEMO_REGISTRATION_TOKEN,
  DEMO_LOGIN_EMAIL,
  DEMO_LOGIN_PASSWORD,
  DEFAULT_CAPABILITIES,
  buildProjectOverviewPayload,
  capabilityForJob,
  createPasswordRecord,
  createSeedIds,
  createToken,
  hashValue,
  nowIso,
  priorityRank,
  slugifyTenantName,
  verifyPassword
} from './shared.js';
import { runJsonArray, runJsonObject, runSql, sqlBoolean, sqlJson, sqlNullable, sqlString } from './psql.js';

function uuid() {
  return crypto.randomUUID();
}

function parseCapabilities(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return DEFAULT_CAPABILITIES;
}

export class SynqoraPostgresStore {
  async getDashboard(context = null) {
    const tenantId = context?.tenant?.tenantId;
    const tenant = await runJsonObject(`
      SELECT row_to_json(t)
      FROM (
        SELECT tenant_id AS "tenantId",
               name,
               slug,
               status,
               deployment_tier AS "deploymentTier",
               region_home AS "regionHome"
        FROM synqora_core.tenant
        ${tenantId ? `WHERE tenant_id = ${sqlString(tenantId)}` : ''}
        ORDER BY created_at
        LIMIT 1
      ) t;
    `);

    const projects = await this.listProjects(context);
    const jobs = await this.listJobs(context);
    const agents = await this.listAgents(context);

    const activeProjects = projects.filter((project) => project.status !== 'archived');

    return {
      tenant,
      summary: {
        activeProjects: activeProjects.length,
        discoveredObjects: activeProjects.reduce((sum, project) => sum + (project.discoveredObjects ?? 0), 0),
        averageConversionRatePct: Math.round(
          activeProjects.reduce((sum, project) => sum + (project.conversionRatePct ?? 0), 0) /
            Math.max(activeProjects.length, 1)
        ),
        dataMigratedTb: Number(
          activeProjects.reduce((sum, project) => sum + (project.dataMigratedTb ?? 0), 0).toFixed(1)
        ),
        registeredAgents: agents.filter((agent) => agent.status !== 'retired').length,
        queuedJobs: jobs.filter((job) => job.status === 'queued').length,
        runningJobs: jobs.filter((job) => job.status === 'running').length
      },
      projects,
      jobs
    };
  }

  async listProjects(context = null) {
    const tenantId = context?.tenant?.tenantId;
    return runJsonArray(`
      SELECT COALESCE(json_agg(row_to_json(p) ORDER BY p."createdAt"), '[]'::json)
      FROM (
        SELECT project_id AS "projectId",
               tenant_id AS "tenantId",
               project_code AS "projectCode",
               name,
               description,
               status,
               source_engine AS "sourceEngine",
               target_engine AS "targetEngine",
               engagement_mode AS "engagementMode",
               deployment_mode AS "deploymentMode",
               owner_user_id AS "ownerUserId",
               discovered_objects AS "discoveredObjects",
               conversion_rate_pct AS "conversionRatePct",
               data_migrated_tb AS "dataMigratedTb",
               critical_issues AS "criticalIssues",
               warning_issues AS "warningIssues",
               pipeline_stage AS "pipelineStage",
               created_at AS "createdAt",
               updated_at AS "updatedAt"
        FROM synqora_core.migration_project
        ${tenantId ? `WHERE tenant_id = ${sqlString(tenantId)}` : ''}
      ) p;
    `);
  }

  async listAgents(context = null) {
    const tenantId = context?.tenant?.tenantId;
    return runJsonArray(`
      SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a."registeredAt"), '[]'::json)
      FROM (
        SELECT agent_id AS "agentId",
               tenant_id AS "tenantId",
               agent_pool_id AS "agentPoolId",
               agent_name AS "agentName",
               agent_version AS "agentVersion",
               platform_type AS "platformType",
               runtime_mode AS "runtimeMode",
               status,
               registered_at AS "registeredAt",
               last_heartbeat_at AS "lastHeartbeatAt",
               capabilities_json AS "capabilities"
        FROM synqora_core.agent_instance
        ${tenantId ? `WHERE tenant_id = ${sqlString(tenantId)}` : ''}
      ) a;
    `);
  }

  async listJobs(context = null) {
    const tenantId = context?.tenant?.tenantId;
    return runJsonArray(`
      SELECT COALESCE(json_agg(row_to_json(j) ORDER BY j."createdAt"), '[]'::json)
      FROM (
        SELECT job_run_id AS "jobRunId",
               tenant_id AS "tenantId",
               project_id AS "projectId",
               workflow_run_id AS "workflowRunId",
               step_run_id AS "stepRunId",
               job_type AS "jobType",
               job_version AS "jobVersion",
               status,
               priority,
               capability_required AS "capabilityRequired",
               lease_expires_at AS "leaseExpiresAt",
               leased_to_agent_id AS "leasedToAgentId",
               attempt_count AS "attemptCount",
               max_attempts AS "maxAttempts",
               payload_json AS payload,
               result_json AS result,
               failure_json AS failure,
               created_at AS "createdAt",
               started_at AS "startedAt",
               completed_at AS "completedAt"
        FROM synqora_core.job_run
        ${tenantId ? `WHERE tenant_id = ${sqlString(tenantId)}` : ''}
      ) j;
    `);
  }

  async authenticateUser({ email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const context = await runJsonObject(`
      SELECT row_to_json(ctx)
      FROM (
        SELECT json_build_object(
                 'userId', ua.user_id,
                 'email', ua.email,
                 'displayName', ua.display_name,
                 'status', ua.status,
                 'createdAt', ua.created_at,
                 'updatedAt', ua.updated_at,
                 'lastLoginAt', now()
               ) AS "user",
               json_build_object(
                 'tenantId', t.tenant_id,
                 'name', t.name,
                 'slug', t.slug,
                 'status', t.status,
                 'deploymentTier', t.deployment_tier,
                 'regionHome', t.region_home
               ) AS tenant,
               COALESCE(tu.default_role, 'admin') AS role,
               json_build_object(
                 'passwordHash', uai.password_hash,
                 'salt', uai.password_salt,
                 'algorithm', uai.password_algorithm,
                 'iterations', uai.password_iterations
               ) AS "passwordRecord"
        FROM synqora_core.user_account ua
        JOIN synqora_core.user_auth_identity uai
          ON uai.user_id = ua.user_id
         AND uai.provider = 'local'
         AND lower(uai.provider_subject) = ${sqlString(normalizedEmail)}
         AND uai.status = 'active'
        JOIN synqora_core.tenant_user tu
          ON tu.user_id = ua.user_id
         AND tu.membership_status = 'active'
        JOIN synqora_core.tenant t
          ON t.tenant_id = tu.tenant_id
         AND t.status = 'active'
        WHERE lower(ua.email) = ${sqlString(normalizedEmail)}
          AND ua.status = 'active'
        ORDER BY tu.joined_at NULLS LAST
        LIMIT 1
      ) ctx;
    `);

    if (!context || !verifyPassword(password, context.passwordRecord)) {
      throw new Error('Invalid email or password');
    }

    await runSql(`
      UPDATE synqora_core.user_account
      SET last_login_at = now(),
          updated_at = now()
      WHERE user_id = ${sqlString(context.user.userId)};
    `);

    delete context.passwordRecord;
    return context;
  }

  async createUserAccount({ email, password, displayName, organizationName }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const finalDisplayName = String(displayName || normalizedEmail.split('@')[0] || 'Synqora User').trim();
    const finalOrganizationName = String(organizationName || `${finalDisplayName}'s Organization`).trim();

    if (!normalizedEmail || !password || password.length < 8) {
      throw new Error('A valid email and password with at least 8 characters are required');
    }

    const existing = await runJsonObject(`
      SELECT json_build_object('userId', user_id)
      FROM synqora_core.user_account
      WHERE lower(email) = ${sqlString(normalizedEmail)}
      LIMIT 1;
    `);

    if (existing) {
      throw new Error('An account with this email already exists');
    }

    const tenantId = uuid();
    const userId = uuid();
    const passwordRecord = createPasswordRecord(password);
    const slug = `${slugifyTenantName(finalOrganizationName)}-${tenantId.slice(0, 8)}`;

    await runSql(`
      BEGIN;
      INSERT INTO synqora_core.tenant (
        tenant_id, name, slug, status, deployment_tier, region_home, settings_json, created_at, updated_at
      ) VALUES (
        ${sqlString(tenantId)}, ${sqlString(finalOrganizationName)}, ${sqlString(slug)},
        'active', 'saas_trial', 'us-east-1', '{}'::jsonb, now(), now()
      );

      INSERT INTO synqora_core.user_account (
        user_id, email, display_name, status, auth_provider, auth_subject, last_login_at, created_at, updated_at
      ) VALUES (
        ${sqlString(userId)}, ${sqlString(normalizedEmail)}, ${sqlString(finalDisplayName)},
        'active', 'local', ${sqlString(normalizedEmail)}, now(), now(), now()
      );

      INSERT INTO synqora_core.tenant_user (
        tenant_user_id, tenant_id, user_id, membership_status, default_role, joined_at, created_at, updated_at
      ) VALUES (
        ${sqlString(uuid())}, ${sqlString(tenantId)}, ${sqlString(userId)}, 'active', 'owner', now(), now(), now()
      );

      INSERT INTO synqora_core.user_auth_identity (
        auth_identity_id, user_id, provider, provider_subject, password_hash, password_salt,
        password_algorithm, password_iterations, status, created_at, updated_at
      ) VALUES (
        ${sqlString(uuid())}, ${sqlString(userId)}, 'local', ${sqlString(normalizedEmail)},
        ${sqlString(passwordRecord.passwordHash)}, ${sqlString(passwordRecord.salt)},
        ${sqlString(passwordRecord.algorithm)}, ${passwordRecord.iterations}, 'active', now(), now()
      );
      COMMIT;
    `);

    return {
      user: {
        userId,
        email: normalizedEmail,
        displayName: finalDisplayName,
        status: 'active',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastLoginAt: nowIso()
      },
      tenant: {
        tenantId,
        name: finalOrganizationName,
        slug,
        status: 'active',
        deploymentTier: 'saas_trial',
        regionHome: 'us-east-1'
      },
      role: 'owner'
    };
  }

  async getProjectOverview(projectId, context = null) {
    const tenantId = context?.tenant?.tenantId;
    const project = await runJsonObject(`
      SELECT row_to_json(p)
      FROM (
        SELECT project_id AS "projectId",
               tenant_id AS "tenantId",
               project_code AS "projectCode",
               name,
               description,
               status,
               source_engine AS "sourceEngine",
               target_engine AS "targetEngine",
               engagement_mode AS "engagementMode",
               deployment_mode AS "deploymentMode",
               owner_user_id AS "ownerUserId",
               discovered_objects AS "discoveredObjects",
               conversion_rate_pct AS "conversionRatePct",
               data_migrated_tb AS "dataMigratedTb",
               critical_issues AS "criticalIssues",
               warning_issues AS "warningIssues",
               pipeline_stage AS "pipelineStage",
               created_at AS "createdAt",
               updated_at AS "updatedAt"
        FROM synqora_core.migration_project
        WHERE project_id = ${sqlString(projectId)}
          ${tenantId ? `AND tenant_id = ${sqlString(tenantId)}` : ''}
        LIMIT 1
      ) p;
    `);

    const owner = await runJsonObject(`
      SELECT row_to_json(u)
      FROM (
        SELECT ua.user_id AS "userId",
               ua.email,
               ua.display_name AS "displayName",
               ua.status,
               ua.created_at AS "createdAt",
               ua.updated_at AS "updatedAt"
        FROM synqora_core.user_account ua
        JOIN synqora_core.migration_project mp
          ON mp.owner_user_id = ua.user_id
        WHERE mp.project_id = ${sqlString(projectId)}
        LIMIT 1
      ) u;
    `);

    const environments = await runJsonArray(`
      SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e."environmentType"), '[]'::json)
      FROM (
        SELECT environment_id AS "environmentId",
               tenant_id AS "tenantId",
               project_id AS "projectId",
               environment_name AS "environmentName",
               environment_type AS "environmentType",
               network_zone AS "networkZone",
               cloud_provider AS "cloudProvider",
               region_name AS "regionName",
               status,
               settings_json AS "settingsJson",
               created_at AS "createdAt",
               updated_at AS "updatedAt"
        FROM synqora_core.environment
        WHERE project_id = ${sqlString(projectId)}
      ) e;
    `);

    const workflows = await runJsonArray(`
      SELECT COALESCE(json_agg(row_to_json(w) ORDER BY w."startedAt" DESC NULLS LAST), '[]'::json)
      FROM (
        SELECT workflow_run_id AS "workflowRunId",
               tenant_id AS "tenantId",
               project_id AS "projectId",
               workflow_type AS "workflowType",
               status,
               trigger_mode AS "triggerMode",
               triggered_by_user_id AS "triggeredByUserId",
               started_at AS "startedAt",
               completed_at AS "completedAt",
               created_at AS "createdAt",
               updated_at AS "updatedAt"
        FROM synqora_core.workflow_run
        WHERE project_id = ${sqlString(projectId)}
      ) w;
    `);

    const workflowSteps = await runJsonArray(`
      SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s."stepOrder"), '[]'::json)
      FROM (
        SELECT wsr.step_run_id AS "stepRunId",
               wsr.tenant_id AS "tenantId",
               wsr.workflow_run_id AS "workflowRunId",
               wsr.step_name AS "stepName",
               wsr.step_order AS "stepOrder",
               wsr.status,
               wsr.started_at AS "startedAt",
               wsr.completed_at AS "completedAt",
               wsr.created_at AS "createdAt",
               wsr.updated_at AS "updatedAt"
        FROM synqora_core.workflow_step_run wsr
        JOIN synqora_core.workflow_run wr
          ON wr.workflow_run_id = wsr.workflow_run_id
        WHERE wr.project_id = ${sqlString(projectId)}
      ) s;
    `);

    const jobs = await runJsonArray(`
      SELECT COALESCE(json_agg(row_to_json(j) ORDER BY j."createdAt" DESC), '[]'::json)
      FROM (
        SELECT job_run_id AS "jobRunId",
               tenant_id AS "tenantId",
               project_id AS "projectId",
               workflow_run_id AS "workflowRunId",
               step_run_id AS "stepRunId",
               job_type AS "jobType",
               job_version AS "jobVersion",
               status,
               priority,
               capability_required AS "capabilityRequired",
               lease_expires_at AS "leaseExpiresAt",
               leased_to_agent_id AS "leasedToAgentId",
               attempt_count AS "attemptCount",
               max_attempts AS "maxAttempts",
               payload_json AS payload,
               result_json AS result,
               failure_json AS failure,
               created_at AS "createdAt",
               started_at AS "startedAt",
               completed_at AS "completedAt"
        FROM synqora_core.job_run
        WHERE project_id = ${sqlString(projectId)}
      ) j;
    `);

    const agents = await runJsonArray(`
      SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a."registeredAt" DESC), '[]'::json)
      FROM (
        SELECT ai.agent_id AS "agentId",
               ai.tenant_id AS "tenantId",
               ai.agent_pool_id AS "agentPoolId",
               ai.agent_name AS "agentName",
               ai.agent_version AS "agentVersion",
               ai.platform_type AS "platformType",
               ai.runtime_mode AS "runtimeMode",
               ai.status,
               ai.registered_at AS "registeredAt",
               ai.last_heartbeat_at AS "lastHeartbeatAt",
               ai.capabilities_json AS "capabilities"
        FROM synqora_core.agent_instance ai
        WHERE ai.tenant_id = (
          SELECT tenant_id
          FROM synqora_core.migration_project
          WHERE project_id = ${sqlString(projectId)}
        )
      ) a;
    `);

    return buildProjectOverviewPayload({
      project,
      owner,
      environments,
      workflows,
      workflowSteps,
      jobs,
      agents
    });
  }

  async registerAgent({
    registrationToken,
    agentName,
    runtimeMode = 'docker',
    platformType = process.platform,
    capabilities = DEFAULT_CAPABILITIES
  }) {
    if (!registrationToken) {
      throw new Error('registrationToken is required');
    }

    const registration = await runJsonObject(`
      SELECT row_to_json(r)
      FROM (
        SELECT agent_registration_id AS "agentRegistrationId",
               tenant_id AS "tenantId",
               agent_pool_id AS "agentPoolId",
               max_uses AS "maxUses",
               used_count AS "usedCount"
        FROM synqora_core.agent_registration
        WHERE registration_token_hash = ${sqlString(hashValue(registrationToken))}
          AND status = 'issued'
          AND expires_at > now()
          AND used_count < max_uses
        LIMIT 1
      ) r;
    `);

    if (!registration) {
      throw new Error('Registration token is invalid, expired, or exhausted');
    }

    const agentId = uuid();
    const accessToken = createToken('synqora_agent');
    const registeredAt = nowIso();
    const finalAgentName = agentName || `agent-${agentId.slice(0, 8)}`;

    await runSql(`
      BEGIN;
      UPDATE synqora_core.agent_registration
      SET used_count = used_count + 1,
          status = CASE WHEN used_count + 1 >= max_uses THEN 'used' ELSE status END,
          updated_at = now()
      WHERE agent_registration_id = ${sqlString(registration.agentRegistrationId)};

      INSERT INTO synqora_core.agent_instance (
        agent_id, tenant_id, agent_pool_id, agent_name, agent_version, platform_type, runtime_mode,
        status, registered_at, last_heartbeat_at, capabilities_json, created_at, updated_at
      ) VALUES (
        ${sqlString(agentId)}, ${sqlString(registration.tenantId)}, ${sqlString(registration.agentPoolId)},
        ${sqlString(finalAgentName)}, '0.1.0', ${sqlString(platformType)}, ${sqlString(runtimeMode)},
        'active', ${sqlString(registeredAt)}, NULL, ${sqlJson(capabilities)}, now(), now()
      );

      INSERT INTO synqora_core.agent_credential (
        agent_credential_id, tenant_id, agent_id, access_token_hash, issued_at, status, created_at, updated_at
      ) VALUES (
        ${sqlString(uuid())}, ${sqlString(registration.tenantId)}, ${sqlString(agentId)},
        ${sqlString(hashValue(accessToken))}, now(), 'active', now(), now()
      );

      INSERT INTO synqora_core.state_transition_event (
        event_id, tenant_id, entity_type, entity_id, from_status, to_status, reason_code, details_json, occurred_at
      ) VALUES (
        ${sqlString(uuid())}, ${sqlString(registration.tenantId)}, 'agent_instance', ${sqlString(agentId)},
        NULL, 'active', 'agent_registered', ${sqlJson({ agentPoolId: registration.agentPoolId })}, now()
      );
      COMMIT;
    `);

    return {
      agent: {
        agentId,
        tenantId: registration.tenantId,
        agentPoolId: registration.agentPoolId,
        agentName: finalAgentName,
        agentVersion: '0.1.0',
        platformType,
        runtimeMode,
        status: 'active',
        registeredAt,
        lastHeartbeatAt: null,
        capabilities
      },
      accessToken,
      pollIntervalSeconds: 10,
      heartbeatIntervalSeconds: 30
    };
  }

  async authenticateAgent(accessToken) {
    if (!accessToken) {
      throw new Error('Missing agent access token');
    }

    const agent = await runJsonObject(`
      SELECT row_to_json(a)
      FROM (
        SELECT ai.agent_id AS "agentId",
               ai.tenant_id AS "tenantId",
               ai.agent_pool_id AS "agentPoolId",
               ai.agent_name AS "agentName",
               ai.agent_version AS "agentVersion",
               ai.platform_type AS "platformType",
               ai.runtime_mode AS "runtimeMode",
               ai.status,
               ai.registered_at AS "registeredAt",
               ai.last_heartbeat_at AS "lastHeartbeatAt",
               ai.capabilities_json AS "capabilities"
        FROM synqora_core.agent_credential ac
        JOIN synqora_core.agent_instance ai
          ON ai.agent_id = ac.agent_id
        WHERE ac.access_token_hash = ${sqlString(hashValue(accessToken))}
          AND ac.status = 'active'
          AND ai.status NOT IN ('revoked', 'retired')
        LIMIT 1
      ) a;
    `);

    if (!agent) {
      throw new Error('Agent access token is invalid or revoked');
    }

    agent.capabilities = parseCapabilities(agent.capabilities);
    return agent;
  }

  async heartbeatAgent(agentId, metrics = {}) {
    const agent = await this.#findAgent(agentId);
    const heartbeatId = uuid();
    const activeJobCountResult = await runJsonObject(`
      SELECT json_build_object(
        'activeJobCount',
        COUNT(*)::int
      )
      FROM synqora_core.job_run
      WHERE leased_to_agent_id = ${sqlString(agentId)}
        AND status IN ('leased', 'running');
    `);

    await runSql(`
      BEGIN;
      UPDATE synqora_core.agent_instance
      SET last_heartbeat_at = now(),
          updated_at = now()
      WHERE agent_id = ${sqlString(agentId)};

      INSERT INTO synqora_core.agent_heartbeat (
        heartbeat_id, tenant_id, agent_id, heartbeat_at, health_status, cpu_pct, memory_pct,
        active_job_count, metrics_json, created_at
      ) VALUES (
        ${sqlString(heartbeatId)}, ${sqlString(agent.tenantId)}, ${sqlString(agentId)}, now(),
        ${sqlString(metrics.healthStatus || 'healthy')}, ${metrics.cpuPct ?? 'NULL'}, ${metrics.memoryPct ?? 'NULL'},
        ${activeJobCountResult?.activeJobCount ?? 0}, ${sqlJson(metrics)}, now()
      );
      COMMIT;
    `);

    return {
      heartbeatId,
      tenantId: agent.tenantId,
      agentId,
      heartbeatAt: nowIso(),
      healthStatus: metrics.healthStatus || 'healthy',
      cpuPct: metrics.cpuPct ?? null,
      memoryPct: metrics.memoryPct ?? null,
      activeJobCount: activeJobCountResult?.activeJobCount ?? 0,
      metricsJson: metrics
    };
  }

  async pollJobs(agentId, { maxJobs = 1 } = {}) {
    const agent = await this.#findAgent(agentId);
    agent.capabilities = parseCapabilities(agent.capabilities);
    const jobs = await this.listJobs();
    const eligibleJobs = jobs
      .filter((job) => job.status === 'queued' && agent.capabilities.includes(job.capabilityRequired))
      .sort(
        (left, right) =>
          priorityRank(right.priority) - priorityRank(left.priority) ||
          String(left.createdAt).localeCompare(String(right.createdAt))
      )
      .slice(0, Math.max(1, maxJobs));

    if (eligibleJobs.length === 0) {
      return [];
    }

    const leaseExpiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();

    await runSql(`
      BEGIN;
      ${eligibleJobs
        .map(
          (job) => `
            UPDATE synqora_core.job_run
            SET status = 'leased',
                leased_to_agent_id = ${sqlString(agentId)},
                lease_expires_at = ${sqlString(leaseExpiresAt)},
                updated_at = now()
            WHERE job_run_id = ${sqlString(job.jobRunId)}
              AND status = 'queued';

            INSERT INTO synqora_core.state_transition_event (
              event_id, tenant_id, entity_type, entity_id, from_status, to_status, reason_code, details_json, occurred_at
            ) VALUES (
              ${sqlString(uuid())}, ${sqlString(job.tenantId)}, 'job_run', ${sqlString(job.jobRunId)},
              'queued', 'leased', 'job_leased', ${sqlJson({ agentId })}, now()
            );
          `
        )
        .join('\n')}
      COMMIT;
    `);

    return eligibleJobs.map((job) => ({
      jobRunId: job.jobRunId,
      jobType: job.jobType,
      jobVersion: job.jobVersion,
      tenantId: job.tenantId,
      projectId: job.projectId,
      workflowRunId: job.workflowRunId,
      stepRunId: job.stepRunId,
      capabilityRequired: job.capabilityRequired,
      leaseExpiresAt,
      inputs: job.payload,
      executionPolicy: {
        maxAttempts: job.maxAttempts,
        timeoutSeconds: 3600
      }
    }));
  }

  async startJob(agentId, jobRunId) {
    const job = await this.#findOwnedJob(jobRunId, agentId, 'leased');
    await runSql(`
      BEGIN;
      UPDATE synqora_core.job_run
      SET status = 'running',
          started_at = now(),
          attempt_count = attempt_count + 1,
          updated_at = now()
      WHERE job_run_id = ${sqlString(jobRunId)};

      INSERT INTO synqora_core.state_transition_event (
        event_id, tenant_id, entity_type, entity_id, from_status, to_status, reason_code, details_json, occurred_at
      ) VALUES (
        ${sqlString(uuid())}, ${sqlString(job.tenantId)}, 'job_run', ${sqlString(jobRunId)},
        'leased', 'running', 'job_started', ${sqlJson({ agentId })}, now()
      );
      COMMIT;
    `);

    return this.#findJob(jobRunId);
  }

  async checkpointJob(agentId, jobRunId, checkpoint) {
    const job = await this.#findOwnedJob(jobRunId, agentId, 'running');
    const checkpointId = uuid();
    const checkpointType = checkpoint.checkpointType || 'progress';
    const checkpointKey = checkpoint.checkpointKey || `${job.jobType}:${Date.now()}`;

    await runSql(`
      BEGIN;
      INSERT INTO synqora_core.job_checkpoint (
        checkpoint_id, tenant_id, job_run_id, checkpoint_type, checkpoint_key, checkpoint_state_json, captured_at, created_at
      ) VALUES (
        ${sqlString(checkpointId)}, ${sqlString(job.tenantId)}, ${sqlString(jobRunId)}, ${sqlString(checkpointType)},
        ${sqlString(checkpointKey)}, ${sqlJson(checkpoint.checkpointState || {})}, now(), now()
      );

      UPDATE synqora_core.job_run
      SET lease_expires_at = ${sqlString(new Date(Date.now() + 1000 * 60 * 5).toISOString())},
          updated_at = now()
      WHERE job_run_id = ${sqlString(jobRunId)};
      COMMIT;
    `);

    return {
      checkpointId,
      tenantId: job.tenantId,
      jobRunId,
      checkpointType,
      checkpointKey,
      checkpointStateJson: checkpoint.checkpointState || {},
      capturedAt: nowIso()
    };
  }

  async completeJob(agentId, jobRunId, result = {}) {
    const job = await this.#findOwnedJob(jobRunId, agentId, 'running');

    await runSql(`
      BEGIN;
      UPDATE synqora_core.job_run
      SET status = 'succeeded',
          completed_at = now(),
          result_json = ${sqlJson(result)},
          updated_at = now()
      WHERE job_run_id = ${sqlString(jobRunId)};

      INSERT INTO synqora_core.state_transition_event (
        event_id, tenant_id, entity_type, entity_id, from_status, to_status, reason_code, details_json, occurred_at
      ) VALUES (
        ${sqlString(uuid())}, ${sqlString(job.tenantId)}, 'job_run', ${sqlString(jobRunId)},
        'running', 'succeeded', 'job_completed', ${sqlJson({ agentId })}, now()
      );
      COMMIT;
    `);

    await this.#enqueueFollowUpJobs(await this.#findJob(jobRunId));
    return this.#findJob(jobRunId);
  }

  async failJob(agentId, jobRunId, failure = {}) {
    const job = await this.#findOwnedJob(jobRunId, agentId, 'running');

    await runSql(`
      BEGIN;
      UPDATE synqora_core.job_run
      SET status = 'failed',
          completed_at = now(),
          failure_json = ${sqlJson(failure)},
          updated_at = now()
      WHERE job_run_id = ${sqlString(jobRunId)};

      INSERT INTO synqora_core.state_transition_event (
        event_id, tenant_id, entity_type, entity_id, from_status, to_status, reason_code, details_json, occurred_at
      ) VALUES (
        ${sqlString(uuid())}, ${sqlString(job.tenantId)}, 'job_run', ${sqlString(jobRunId)},
        'running', 'failed', 'job_failed', ${sqlJson({ agentId, retryable: failure.retryable ?? false })}, now()
      );
      COMMIT;
    `);

    return this.#findJob(jobRunId);
  }

  async #enqueueFollowUpJobs(completedJob) {
    const nextTypeMap = {
      discover_source_inventory: 'run_assessment_rules',
      run_assessment_rules: 'generate_conversion_artifacts',
      generate_conversion_artifacts: 'run_validation_check'
    };

    const nextType = nextTypeMap[completedJob.jobType];
    if (!nextType) {
      return;
    }

    await runSql(`
      BEGIN;
      INSERT INTO synqora_core.job_run (
        job_run_id, tenant_id, project_id, workflow_run_id, step_run_id, job_type, job_version, status, priority,
        capability_required, payload_json, attempt_count, max_attempts, created_at, updated_at
      ) VALUES (
        ${sqlString(uuid())}, ${sqlString(completedJob.tenantId)}, ${sqlString(completedJob.projectId)},
        ${sqlString(completedJob.workflowRunId)}, ${sqlNullable(completedJob.stepRunId)}, ${sqlString(nextType)}, 'v1',
        'queued', ${sqlString(completedJob.priority)}, ${sqlString(capabilityForJob(nextType))},
        ${sqlJson({ parentJobRunId: completedJob.jobRunId, projectId: completedJob.projectId })},
        0, 3, now(), now()
      );
      COMMIT;
    `);
  }

  async #findAgent(agentId) {
    const agent = await runJsonObject(`
      SELECT row_to_json(a)
      FROM (
        SELECT agent_id AS "agentId",
               tenant_id AS "tenantId",
               agent_pool_id AS "agentPoolId",
               agent_name AS "agentName",
               agent_version AS "agentVersion",
               platform_type AS "platformType",
               runtime_mode AS "runtimeMode",
               status,
               registered_at AS "registeredAt",
               last_heartbeat_at AS "lastHeartbeatAt",
               capabilities_json AS "capabilities"
        FROM synqora_core.agent_instance
        WHERE agent_id = ${sqlString(agentId)}
        LIMIT 1
      ) a;
    `);

    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    agent.capabilities = parseCapabilities(agent.capabilities);
    return agent;
  }

  async #findJob(jobRunId) {
    const job = await runJsonObject(`
      SELECT row_to_json(j)
      FROM (
        SELECT job_run_id AS "jobRunId",
               tenant_id AS "tenantId",
               project_id AS "projectId",
               workflow_run_id AS "workflowRunId",
               step_run_id AS "stepRunId",
               job_type AS "jobType",
               job_version AS "jobVersion",
               status,
               priority,
               capability_required AS "capabilityRequired",
               lease_expires_at AS "leaseExpiresAt",
               leased_to_agent_id AS "leasedToAgentId",
               attempt_count AS "attemptCount",
               max_attempts AS "maxAttempts",
               payload_json AS payload,
               result_json AS result,
               failure_json AS failure,
               created_at AS "createdAt",
               started_at AS "startedAt",
               completed_at AS "completedAt"
        FROM synqora_core.job_run
        WHERE job_run_id = ${sqlString(jobRunId)}
        LIMIT 1
      ) j;
    `);

    if (!job) {
      throw new Error(`Unknown job: ${jobRunId}`);
    }
    return job;
  }

  async #findOwnedJob(jobRunId, agentId, expectedStatus) {
    const job = await this.#findJob(jobRunId);
    if (job.leasedToAgentId !== agentId) {
      throw new Error('Job is not leased to this agent');
    }
    if (job.status !== expectedStatus) {
      throw new Error(`Job must be in ${expectedStatus} state`);
    }
    return job;
  }
}

export async function seedPostgresDemoData() {
  const ids = createSeedIds();
  const tokenHash = hashValue(DEMO_REGISTRATION_TOKEN);
  const demoPassword = createPasswordRecord(DEMO_LOGIN_PASSWORD);

  await runSql(`
    BEGIN;
    INSERT INTO synqora_core.tenant (
      tenant_id, name, slug, status, deployment_tier, region_home, settings_json, created_at, updated_at
    ) VALUES (
      ${sqlString(ids.tenantId)}, 'Synqora Demo Tenant', 'synqora-demo', 'active', 'saas_standard', 'us-east-1', '{}'::jsonb, now(), now()
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    INSERT INTO synqora_core.user_account (
      user_id, email, display_name, status, auth_provider, auth_subject, last_login_at, created_at, updated_at
    ) VALUES (
      ${sqlString(ids.userId)}, 'sai@example.com', 'Sai Endla', 'active', 'local', 'sai@example.com', now(), now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO synqora_core.tenant_user (
      tenant_user_id, tenant_id, user_id, membership_status, default_role, joined_at, created_at, updated_at
    ) VALUES (
      ${sqlString(uuid())}, ${sqlString(ids.tenantId)}, ${sqlString(ids.userId)}, 'active', 'admin', now(), now(), now()
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO synqora_core.user_auth_identity (
      auth_identity_id, user_id, provider, provider_subject, password_hash, password_salt,
      password_algorithm, password_iterations, status, created_at, updated_at
    ) VALUES (
      ${sqlString(uuid())}, ${sqlString(ids.userId)}, 'local', ${sqlString(DEMO_LOGIN_EMAIL)},
      ${sqlString(demoPassword.passwordHash)}, ${sqlString(demoPassword.salt)},
      ${sqlString(demoPassword.algorithm)}, ${demoPassword.iterations}, 'active', now(), now()
    )
    ON CONFLICT (provider, provider_subject) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        password_salt = EXCLUDED.password_salt,
        password_algorithm = EXCLUDED.password_algorithm,
        password_iterations = EXCLUDED.password_iterations,
        status = 'active',
        updated_at = now();

    INSERT INTO synqora_core.migration_project (
      project_id, tenant_id, project_code, name, description, status, source_engine, target_engine,
      engagement_mode, deployment_mode, owner_user_id, discovered_objects, conversion_rate_pct,
      data_migrated_tb, critical_issues, warning_issues, pipeline_stage, created_at, updated_at
    ) VALUES
    (
      ${sqlString(ids.projectId)}, ${sqlString(ids.tenantId)}, 'FINPROD-001', 'ERP Core — FINPROD',
      'Financial production database migration, validation, and CDC cutover.', 'in_progress', 'oracle', 'postgresql',
      'migration_cdc', 'saas_standard', ${sqlString(ids.userId)}, 48723, 94, 2.4, 3, 14, 'data_load', now(), now()
    ),
    (
      ${sqlString(ids.projectTwoId)}, ${sqlString(ids.tenantId)}, 'HRDW-002', 'HR Analytics Warehouse',
      'Assessment-first modernization program with staged conversion.', 'assessment', 'oracle', 'not_selected',
      'assessment', 'saas_standard', ${sqlString(ids.userId)}, 12984, 0, 0.0, 6, 33, 'assessment', now(), now()
    )
    ON CONFLICT (project_id) DO UPDATE
    SET target_engine = CASE
          WHEN synqora_core.migration_project.engagement_mode = 'assessment' THEN 'not_selected'
          ELSE EXCLUDED.target_engine
        END,
        updated_at = now();

    INSERT INTO synqora_core.environment (
      environment_id, tenant_id, project_id, environment_name, environment_type, network_zone, cloud_provider,
      region_name, status, settings_json, created_at, updated_at
    ) VALUES
    (
      ${sqlString(ids.sourceEnvId)}, ${sqlString(ids.tenantId)}, ${sqlString(ids.projectId)}, 'oracle-prod-east',
      'source', 'customer-onprem-east', 'onprem', 'us-east-1', 'active',
      ${sqlJson({
        engineVersion: 'Oracle 19c EE',
        host: 'oraprod-fin.internal:1521',
        schemas: 4,
        tables: 847,
        packages: 312,
        totalSizeTb: 1.8
      })},
      now(), now()
    ),
    (
      ${sqlString(ids.targetEnvId)}, ${sqlString(ids.tenantId)}, ${sqlString(ids.projectId)}, 'postgres-cutover-east',
      'target', 'customer-aws-east', 'aws', 'us-east-1', 'active',
      ${sqlJson({
        engineVersion: 'PostgreSQL 16.3',
        host: 'pg-fin-prod.us-east-1.rds.amazonaws.com',
        schemas: 4,
        tablesDeployed: 847,
        codeDeployed: 289,
        totalSizeTb: 1.8
      })},
      now(), now()
    )
    ON CONFLICT (environment_id) DO UPDATE
    SET network_zone = EXCLUDED.network_zone,
        cloud_provider = EXCLUDED.cloud_provider,
        region_name = EXCLUDED.region_name,
        status = EXCLUDED.status,
        settings_json = EXCLUDED.settings_json,
        updated_at = now();

    INSERT INTO synqora_core.agent_pool (
      agent_pool_id, tenant_id, pool_name, pool_type, region_name, status, capabilities_json, created_at, updated_at
    ) VALUES (
      ${sqlString(ids.agentPoolId)}, ${sqlString(ids.tenantId)}, 'customer-prod-east', 'shared', 'us-east-1', 'active',
      ${sqlJson(DEFAULT_CAPABILITIES)}, now(), now()
    )
    ON CONFLICT (agent_pool_id) DO NOTHING;

    INSERT INTO synqora_core.agent_registration (
      agent_registration_id, tenant_id, agent_pool_id, registration_token_hash, expires_at, max_uses, used_count, status,
      issued_by_user_id, created_at, updated_at
    ) VALUES (
      ${sqlString(ids.registrationId)}, ${sqlString(ids.tenantId)}, ${sqlString(ids.agentPoolId)},
      ${sqlString(tokenHash)}, now() + interval '7 days', 10, 0, 'issued', ${sqlString(ids.userId)}, now(), now()
    )
    ON CONFLICT (agent_registration_id) DO NOTHING;

    INSERT INTO synqora_core.workflow_run (
      workflow_run_id, tenant_id, project_id, workflow_type, status, trigger_mode, triggered_by_user_id, started_at, created_at, updated_at
    ) VALUES (
      ${sqlString(ids.workflowRunId)}, ${sqlString(ids.tenantId)}, ${sqlString(ids.projectId)},
      'migration_cdc', 'running', 'manual', ${sqlString(ids.userId)}, now(), now(), now()
    )
    ON CONFLICT (workflow_run_id) DO NOTHING;

    INSERT INTO synqora_core.workflow_step_run (
      step_run_id, tenant_id, workflow_run_id, step_name, step_order, status, started_at, created_at, updated_at
    ) VALUES (
      ${sqlString(ids.stepRunId)}, ${sqlString(ids.tenantId)}, ${sqlString(ids.workflowRunId)},
      'Discovery and Assessment', 1, 'running', now(), now(), now()
    )
    ON CONFLICT (step_run_id) DO NOTHING;

    INSERT INTO synqora_core.job_run (
      job_run_id, tenant_id, project_id, workflow_run_id, step_run_id, job_type, job_version, status, priority,
      capability_required, payload_json, attempt_count, max_attempts, created_at, updated_at
    ) VALUES
    (
      ${sqlString(ids.job1Id)}, ${sqlString(ids.tenantId)}, ${sqlString(ids.projectId)}, ${sqlString(ids.workflowRunId)},
      ${sqlString(ids.stepRunId)}, 'discover_source_inventory', 'v1', 'queued', 'high', 'discovery',
      ${sqlJson({ sourceEnvironmentId: ids.sourceEnvId, sourceSchemaPatterns: ['FINANCE_CORE', 'HR_APP'], discoveryDepth: 'full' })},
      0, 3, now(), now()
    ),
    (
      ${sqlString(ids.job2Id)}, ${sqlString(ids.tenantId)}, ${sqlString(ids.projectId)}, ${sqlString(ids.workflowRunId)},
      ${sqlString(ids.stepRunId)}, 'bulk_load_table_chunk', 'v1', 'queued', 'medium', 'bulk_load',
      ${sqlJson({ sourceTable: 'FINANCE_CORE.TRANSACTIONS', targetTable: 'finance_core.transactions', chunkKeyStart: 1, chunkKeyEnd: 250000 })},
      0, 5, now(), now()
    ),
    (
      ${sqlString(ids.job3Id)}, ${sqlString(ids.tenantId)}, ${sqlString(ids.projectId)}, ${sqlString(ids.workflowRunId)},
      ${sqlString(ids.stepRunId)}, 'start_cdc_stream', 'v1', 'queued', 'medium', 'cdc_capture',
      ${sqlJson({ sourceEnvironmentId: ids.sourceEnvId, targetEnvironmentId: ids.targetEnvId, streamMode: 'migration_cdc' })},
      0, 3, now(), now()
    )
    ON CONFLICT (job_run_id) DO NOTHING;
    COMMIT;
  `);
}
