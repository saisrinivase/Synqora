import crypto from 'node:crypto';

import {
  DEMO_REGISTRATION_TOKEN,
  DEMO_LOGIN_EMAIL,
  DEMO_LOGIN_PASSWORD,
  DEFAULT_CAPABILITIES,
  buildProjectOverviewPayload,
  capabilityForJob,
  createPasswordRecord,
  createToken,
  deepClone,
  hashValue,
  nowIso,
  priorityRank,
  slugifyTenantName,
  verifyPassword
} from './shared.js';

export class SynqoraStore {
  constructor() {
    this.state = this.#createSeedState();
  }

  #createSeedState() {
    const seededAt = nowIso();
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const projectTwoId = crypto.randomUUID();
    const sourceEnvId = crypto.randomUUID();
    const targetEnvId = crypto.randomUUID();
    const agentPoolId = crypto.randomUUID();
    const registrationId = crypto.randomUUID();
    const workflowRunId = crypto.randomUUID();
    const stepRunId = crypto.randomUUID();

    const job1Id = crypto.randomUUID();
    const job2Id = crypto.randomUUID();
    const job3Id = crypto.randomUUID();
    const demoPassword = createPasswordRecord(DEMO_LOGIN_PASSWORD);

    return {
      tenant: {
        tenantId,
        name: 'Synqora Demo Tenant',
        slug: 'synqora-demo',
        status: 'active',
        deploymentTier: 'saas_standard',
        regionHome: 'us-east-1',
        createdAt: seededAt,
        updatedAt: seededAt
      },
      users: [
        {
          userId,
          email: 'sai@example.com',
          displayName: 'Sai Endla',
          status: 'active',
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      projects: [
        {
          projectId,
          tenantId,
          projectCode: 'FINPROD-001',
          name: 'ERP Core — FINPROD',
          description: 'Financial production database migration, validation, and CDC cutover.',
          status: 'in_progress',
          sourceEngine: 'oracle',
          targetEngine: 'postgresql',
          engagementMode: 'migration_cdc',
          deploymentMode: 'saas_standard',
          ownerUserId: userId,
          discoveredObjects: 48723,
          conversionRatePct: 94,
          dataMigratedTb: 2.4,
          criticalIssues: 3,
          warningIssues: 14,
          pipelineStage: 'data_load',
          createdAt: seededAt,
          updatedAt: seededAt
        },
        {
          projectId: projectTwoId,
          tenantId,
          projectCode: 'HRDW-002',
          name: 'HR Analytics Warehouse',
          description: 'Assessment-first modernization program with staged conversion.',
          status: 'assessment',
          sourceEngine: 'oracle',
          targetEngine: 'not_selected',
          engagementMode: 'assessment',
          deploymentMode: 'saas_standard',
          ownerUserId: userId,
          discoveredObjects: 12984,
          conversionRatePct: 0,
          dataMigratedTb: 0,
          criticalIssues: 6,
          warningIssues: 33,
          pipelineStage: 'assessment',
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      environments: [
        {
          environmentId: sourceEnvId,
          tenantId,
          projectId,
          environmentName: 'oracle-prod-east',
          environmentType: 'source',
          status: 'active',
          cloudProvider: 'onprem',
          regionName: 'us-east-1',
          networkZone: 'customer-onprem-east',
          settingsJson: {
            engineVersion: 'Oracle 19c EE',
            host: 'oraprod-fin.internal:1521',
            schemas: 4,
            tables: 847,
            packages: 312,
            totalSizeTb: 1.8
          },
          createdAt: seededAt,
          updatedAt: seededAt
        },
        {
          environmentId: targetEnvId,
          tenantId,
          projectId,
          environmentName: 'postgres-cutover-east',
          environmentType: 'target',
          status: 'active',
          cloudProvider: 'aws',
          regionName: 'us-east-1',
          networkZone: 'customer-aws-east',
          settingsJson: {
            engineVersion: 'PostgreSQL 16.3',
            host: 'pg-fin-prod.us-east-1.rds.amazonaws.com',
            schemas: 4,
            tablesDeployed: 847,
            codeDeployed: 289,
            totalSizeTb: 1.8
          },
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      agentPools: [
        {
          agentPoolId,
          tenantId,
          poolName: 'customer-prod-east',
          poolType: 'shared',
          regionName: 'us-east-1',
          status: 'active',
          capabilities: DEFAULT_CAPABILITIES,
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      agentRegistrations: [
        {
          agentRegistrationId: registrationId,
          tenantId,
          agentPoolId,
          registrationTokenHash: hashValue(DEMO_REGISTRATION_TOKEN),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
          maxUses: 10,
          usedCount: 0,
          status: 'issued',
          issuedByUserId: userId,
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      agentInstances: [],
      agentCredentials: [],
      agentHeartbeats: [],
      tenantUsers: [
        {
          tenantUserId: crypto.randomUUID(),
          tenantId,
          userId,
          membershipStatus: 'active',
          defaultRole: 'admin',
          joinedAt: seededAt,
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      authIdentities: [
        {
          authIdentityId: crypto.randomUUID(),
          userId,
          provider: 'local',
          providerSubject: DEMO_LOGIN_EMAIL,
          passwordHash: demoPassword.passwordHash,
          passwordSalt: demoPassword.salt,
          passwordAlgorithm: demoPassword.algorithm,
          passwordIterations: demoPassword.iterations,
          status: 'active',
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      workflows: [
        {
          workflowRunId,
          tenantId,
          projectId,
          workflowType: 'migration_cdc',
          status: 'running',
          startedAt: seededAt,
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      workflowSteps: [
        {
          stepRunId,
          tenantId,
          workflowRunId,
          stepName: 'Discovery and Assessment',
          stepOrder: 1,
          status: 'running',
          startedAt: seededAt,
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      jobs: [
        {
          jobRunId: job1Id,
          tenantId,
          projectId,
          workflowRunId,
          stepRunId,
          jobType: 'discover_source_inventory',
          jobVersion: 'v1',
          status: 'queued',
          priority: 'high',
          capabilityRequired: capabilityForJob('discover_source_inventory'),
          leaseExpiresAt: null,
          leasedToAgentId: null,
          attemptCount: 0,
          maxAttempts: 3,
          payload: {
            sourceEnvironmentId: sourceEnvId,
            sourceSchemaPatterns: ['FINANCE_CORE', 'HR_APP'],
            discoveryDepth: 'full'
          },
          createdAt: seededAt,
          updatedAt: seededAt
        },
        {
          jobRunId: job2Id,
          tenantId,
          projectId,
          workflowRunId,
          stepRunId,
          jobType: 'bulk_load_table_chunk',
          jobVersion: 'v1',
          status: 'queued',
          priority: 'medium',
          capabilityRequired: capabilityForJob('bulk_load_table_chunk'),
          leaseExpiresAt: null,
          leasedToAgentId: null,
          attemptCount: 0,
          maxAttempts: 5,
          payload: {
            sourceTable: 'FINANCE_CORE.TRANSACTIONS',
            targetTable: 'finance_core.transactions',
            chunkKeyStart: 1,
            chunkKeyEnd: 250000
          },
          createdAt: seededAt,
          updatedAt: seededAt
        },
        {
          jobRunId: job3Id,
          tenantId,
          projectId,
          workflowRunId,
          stepRunId,
          jobType: 'start_cdc_stream',
          jobVersion: 'v1',
          status: 'queued',
          priority: 'medium',
          capabilityRequired: capabilityForJob('start_cdc_stream'),
          leaseExpiresAt: null,
          leasedToAgentId: null,
          attemptCount: 0,
          maxAttempts: 3,
          payload: {
            sourceEnvironmentId: sourceEnvId,
            targetEnvironmentId: targetEnvId,
            streamMode: 'migration_cdc'
          },
          createdAt: seededAt,
          updatedAt: seededAt
        }
      ],
      checkpoints: [],
      transitions: []
    };
  }

  getDashboard(context = null) {
    const tenant = this.#tenantForContext(context);
    const activeProjects = this.state.projects.filter(
      (project) => project.tenantId === tenant.tenantId && project.status !== 'archived'
    );
    const tenantJobs = this.state.jobs.filter((job) => job.tenantId === tenant.tenantId);
    const queuedJobs = tenantJobs.filter((job) => job.status === 'queued').length;
    const runningJobs = tenantJobs.filter((job) => job.status === 'running').length;

    return {
      tenant: deepClone(tenant),
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
        registeredAgents: this.state.agentInstances.filter(
          (agent) => agent.tenantId === tenant.tenantId && agent.status !== 'retired'
        ).length,
        queuedJobs,
        runningJobs
      },
      projects: deepClone(activeProjects),
      jobs: deepClone(tenantJobs)
    };
  }

  listProjects(context = null) {
    const tenant = this.#tenantForContext(context);
    return deepClone(this.state.projects.filter((project) => project.tenantId === tenant.tenantId));
  }

  listAgents(context = null) {
    const tenant = this.#tenantForContext(context);
    return deepClone(this.state.agentInstances.filter((agent) => agent.tenantId === tenant.tenantId));
  }

  listJobs(context = null) {
    const tenant = this.#tenantForContext(context);
    return deepClone(this.state.jobs.filter((job) => job.tenantId === tenant.tenantId));
  }

  authenticateUser({ email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = this.state.users.find((item) => item.email.toLowerCase() === normalizedEmail && item.status === 'active');
    const identity = this.state.authIdentities.find(
      (item) => item.provider === 'local' && item.providerSubject === normalizedEmail && item.status === 'active'
    );

    if (
      !user ||
      !identity ||
      !verifyPassword(password, {
        passwordHash: identity.passwordHash,
        salt: identity.passwordSalt,
        iterations: identity.passwordIterations
      })
    ) {
      throw new Error('Invalid email or password');
    }

    user.lastLoginAt = nowIso();
    const membership = this.state.tenantUsers.find(
      (item) => item.userId === user.userId && item.membershipStatus === 'active'
    );
    const tenant =
      membership?.tenantId === this.state.tenant.tenantId
        ? this.state.tenant
        : (this.state.tenants || []).find((item) => item.tenantId === membership?.tenantId);

    return deepClone({
      user,
      tenant: tenant || this.state.tenant,
      role: membership?.defaultRole || 'admin'
    });
  }

  createUserAccount({ email, password, displayName, organizationName }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const finalDisplayName = String(displayName || normalizedEmail.split('@')[0] || 'Synqora User').trim();
    const finalOrganizationName = String(organizationName || `${finalDisplayName}'s Organization`).trim();

    if (!normalizedEmail || !password || password.length < 8) {
      throw new Error('A valid email and password with at least 8 characters are required');
    }
    if (this.state.users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
      throw new Error('An account with this email already exists');
    }

    const timestamp = nowIso();
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const passwordRecord = createPasswordRecord(password);
    const baseSlug = slugifyTenantName(finalOrganizationName);
    const existingSlugs = new Set([this.state.tenant, ...(this.state.tenants || [])].filter(Boolean).map((tenant) => tenant.slug));
    let slug = baseSlug;
    let suffix = 2;
    while (existingSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const tenant = {
      tenantId,
      name: finalOrganizationName,
      slug,
      status: 'active',
      deploymentTier: 'saas_trial',
      regionHome: 'us-east-1',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const user = {
      userId,
      email: normalizedEmail,
      displayName: finalDisplayName,
      status: 'active',
      authProvider: 'local',
      authSubject: normalizedEmail,
      lastLoginAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const membership = {
      tenantUserId: crypto.randomUUID(),
      tenantId,
      userId,
      membershipStatus: 'active',
      defaultRole: 'owner',
      joinedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.state.tenants = this.state.tenants || [];
    this.state.tenants.push(tenant);
    this.state.users.push(user);
    this.state.tenantUsers.push(membership);
    this.state.authIdentities.push({
      authIdentityId: crypto.randomUUID(),
      userId,
      provider: 'local',
      providerSubject: normalizedEmail,
      passwordHash: passwordRecord.passwordHash,
      passwordSalt: passwordRecord.salt,
      passwordAlgorithm: passwordRecord.algorithm,
      passwordIterations: passwordRecord.iterations,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    });

    return deepClone({
      user,
      tenant,
      role: membership.defaultRole
    });
  }

  getProjectOverview(projectId, context = null) {
    const tenant = this.#tenantForContext(context);
    const project = this.state.projects.find((item) => item.projectId === projectId);
    if (project && project.tenantId !== tenant.tenantId) {
      throw new Error('Project not found');
    }

    return deepClone(
      buildProjectOverviewPayload({
        project,
        owner: this.state.users.find((user) => user.userId === project?.ownerUserId) || null,
        environments: this.state.environments.filter((environment) => environment.projectId === projectId),
        workflows: this.state.workflows.filter((workflow) => workflow.projectId === projectId),
        workflowSteps: this.state.workflowSteps.filter((step) =>
          this.state.workflows.some(
            (workflow) => workflow.projectId === projectId && workflow.workflowRunId === step.workflowRunId
          )
        ),
        jobs: this.state.jobs.filter((job) => job.projectId === projectId),
        agents: this.state.agentInstances
      })
    );
  }

  registerAgent({
    registrationToken,
    agentName,
    runtimeMode = 'docker',
    platformType = process.platform,
    capabilities = DEFAULT_CAPABILITIES
  }) {
    if (!registrationToken) {
      throw new Error('registrationToken is required');
    }

    const registration = this.state.agentRegistrations.find(
      (item) =>
        item.registrationTokenHash === hashValue(registrationToken) &&
        item.status === 'issued' &&
        new Date(item.expiresAt).getTime() > Date.now() &&
        item.usedCount < item.maxUses
    );

    if (!registration) {
      throw new Error('Registration token is invalid, expired, or exhausted');
    }

    registration.usedCount += 1;
    if (registration.usedCount >= registration.maxUses) {
      registration.status = 'used';
    }

    const agentId = crypto.randomUUID();
    const accessToken = createToken('synqora_agent');

    const agent = {
      agentId,
      tenantId: registration.tenantId,
      agentPoolId: registration.agentPoolId,
      agentName: agentName || `agent-${agentId.slice(0, 8)}`,
      agentVersion: '0.1.0',
      platformType,
      runtimeMode,
      status: 'active',
      registeredAt: nowIso(),
      lastHeartbeatAt: null,
      capabilities
    };

    this.state.agentInstances.push(agent);
    this.state.agentCredentials.push({
      agentId,
      tenantId: registration.tenantId,
      accessTokenHash: hashValue(accessToken),
      issuedAt: nowIso(),
      status: 'active'
    });

    this.#recordTransition('agent_instance', agentId, null, 'active', 'agent_registered', {
      agentPoolId: registration.agentPoolId
    });

    return {
      agent: deepClone(agent),
      accessToken,
      pollIntervalSeconds: 10,
      heartbeatIntervalSeconds: 30
    };
  }

  authenticateAgent(accessToken) {
    if (!accessToken) {
      throw new Error('Missing agent access token');
    }

    const credential = this.state.agentCredentials.find(
      (item) => item.accessTokenHash === hashValue(accessToken) && item.status === 'active'
    );

    if (!credential) {
      throw new Error('Agent access token is invalid or revoked');
    }

    const agent = this.state.agentInstances.find((item) => item.agentId === credential.agentId);
    if (!agent || ['revoked', 'retired'].includes(agent.status)) {
      throw new Error('Agent is not active');
    }

    return agent;
  }

  heartbeatAgent(agentId, metrics = {}) {
    const agent = this.#findAgent(agentId);
    agent.lastHeartbeatAt = nowIso();

    const heartbeat = {
      heartbeatId: crypto.randomUUID(),
      tenantId: agent.tenantId,
      agentId,
      heartbeatAt: nowIso(),
      healthStatus: metrics.healthStatus || 'healthy',
      cpuPct: metrics.cpuPct ?? null,
      memoryPct: metrics.memoryPct ?? null,
      activeJobCount: this.state.jobs.filter(
        (job) => job.leasedToAgentId === agentId && ['leased', 'running'].includes(job.status)
      ).length,
      metricsJson: metrics
    };

    this.state.agentHeartbeats.push(heartbeat);
    return deepClone(heartbeat);
  }

  pollJobs(agentId, { maxJobs = 1 } = {}) {
    const agent = this.#findAgent(agentId);
    const eligibleJobs = this.state.jobs
      .filter((job) => job.status === 'queued' && agent.capabilities.includes(job.capabilityRequired))
      .sort((left, right) => priorityRank(right.priority) - priorityRank(left.priority) || left.createdAt.localeCompare(right.createdAt))
      .slice(0, Math.max(1, maxJobs));

    if (eligibleJobs.length === 0) {
      return [];
    }

    const leaseExpiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();

    for (const job of eligibleJobs) {
      const previousStatus = job.status;
      job.status = 'leased';
      job.leasedToAgentId = agentId;
      job.leaseExpiresAt = leaseExpiresAt;
      this.#recordTransition('job_run', job.jobRunId, previousStatus, 'leased', 'job_leased', {
        agentId
      });
    }

    return deepClone(
      eligibleJobs.map((job) => ({
        jobRunId: job.jobRunId,
        jobType: job.jobType,
        jobVersion: job.jobVersion,
        tenantId: job.tenantId,
        projectId: job.projectId,
        workflowRunId: job.workflowRunId,
        stepRunId: job.stepRunId,
        capabilityRequired: job.capabilityRequired,
        leaseExpiresAt: job.leaseExpiresAt,
        inputs: job.payload,
        executionPolicy: {
          maxAttempts: job.maxAttempts,
          timeoutSeconds: 3600
        }
      }))
    );
  }

  startJob(agentId, jobRunId) {
    const job = this.#findJob(jobRunId);
    this.#assertJobOwnership(job, agentId, 'leased');

    const previousStatus = job.status;
    job.status = 'running';
    job.startedAt = nowIso();
    job.attemptCount += 1;
    this.#recordTransition('job_run', jobRunId, previousStatus, 'running', 'job_started', {
      agentId
    });

    return deepClone(job);
  }

  checkpointJob(agentId, jobRunId, checkpoint) {
    const job = this.#findJob(jobRunId);
    this.#assertJobOwnership(job, agentId, 'running');

    const item = {
      checkpointId: crypto.randomUUID(),
      tenantId: job.tenantId,
      jobRunId,
      checkpointType: checkpoint.checkpointType || 'progress',
      checkpointKey: checkpoint.checkpointKey || `${job.jobType}:${Date.now()}`,
      checkpointStateJson: checkpoint.checkpointState || {},
      capturedAt: nowIso()
    };

    this.state.checkpoints.push(item);
    job.leaseExpiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();
    return deepClone(item);
  }

  completeJob(agentId, jobRunId, result = {}) {
    const job = this.#findJob(jobRunId);
    this.#assertJobOwnership(job, agentId, 'running');

    const previousStatus = job.status;
    job.status = 'succeeded';
    job.completedAt = nowIso();
    job.result = result;
    this.#recordTransition('job_run', jobRunId, previousStatus, 'succeeded', 'job_completed', {
      agentId
    });

    this.#enqueueFollowUpJobs(job);
    return deepClone(job);
  }

  failJob(agentId, jobRunId, failure = {}) {
    const job = this.#findJob(jobRunId);
    this.#assertJobOwnership(job, agentId, 'running');

    const previousStatus = job.status;
    job.status = 'failed';
    job.completedAt = nowIso();
    job.failure = failure;
    this.#recordTransition('job_run', jobRunId, previousStatus, 'failed', 'job_failed', {
      agentId,
      retryable: failure.retryable ?? false
    });

    return deepClone(job);
  }

  #enqueueFollowUpJobs(completedJob) {
    const nextTypeMap = {
      discover_source_inventory: 'run_assessment_rules',
      run_assessment_rules: 'generate_conversion_artifacts',
      generate_conversion_artifacts: 'run_validation_check'
    };

    const nextType = nextTypeMap[completedJob.jobType];
    if (!nextType) {
      return;
    }

    const newJob = {
      jobRunId: crypto.randomUUID(),
      tenantId: completedJob.tenantId,
      projectId: completedJob.projectId,
      workflowRunId: completedJob.workflowRunId,
      stepRunId: completedJob.stepRunId,
      jobType: nextType,
      jobVersion: 'v1',
      status: 'queued',
      priority: completedJob.priority,
      capabilityRequired: capabilityForJob(nextType),
      leaseExpiresAt: null,
      leasedToAgentId: null,
      attemptCount: 0,
      maxAttempts: 3,
      payload: {
        parentJobRunId: completedJob.jobRunId,
        projectId: completedJob.projectId
      },
      createdAt: nowIso()
    };

    this.state.jobs.push(newJob);
    this.#recordTransition('job_run', newJob.jobRunId, null, 'queued', 'job_enqueued', {
      parentJobRunId: completedJob.jobRunId
    });
  }

  #findAgent(agentId) {
    const agent = this.state.agentInstances.find((item) => item.agentId === agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    return agent;
  }

  #tenantForContext(context) {
    const tenantId = context?.tenant?.tenantId || this.state.tenant.tenantId;
    const tenant =
      this.state.tenant.tenantId === tenantId
        ? this.state.tenant
        : (this.state.tenants || []).find((item) => item.tenantId === tenantId);

    if (!tenant) {
      throw new Error('Tenant not found');
    }
    return tenant;
  }

  #findJob(jobRunId) {
    const job = this.state.jobs.find((item) => item.jobRunId === jobRunId);
    if (!job) {
      throw new Error(`Unknown job: ${jobRunId}`);
    }
    return job;
  }

  #assertJobOwnership(job, agentId, expectedStatus) {
    if (job.leasedToAgentId !== agentId) {
      throw new Error('Job is not leased to this agent');
    }
    if (job.status !== expectedStatus) {
      throw new Error(`Job must be in ${expectedStatus} state`);
    }
  }

  #recordTransition(entityType, entityId, fromStatus, toStatus, reasonCode, detailsJson = {}) {
    this.state.transitions.push({
      eventId: crypto.randomUUID(),
      tenantId: this.state.tenant.tenantId,
      entityType,
      entityId,
      fromStatus,
      toStatus,
      reasonCode,
      detailsJson,
      occurredAt: nowIso()
    });
  }
}
