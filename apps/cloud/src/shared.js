import crypto from 'node:crypto';

export const DEMO_REGISTRATION_TOKEN = 'synqora-demo-token';
export const DEMO_LOGIN_EMAIL = 'sai@example.com';
export const DEMO_LOGIN_PASSWORD = process.env.SYNQORA_DEMO_PASSWORD || 'Synqora_123';

export const DEFAULT_CAPABILITIES = [
  'connectivity',
  'discovery',
  'conversion',
  'deployment',
  'bulk_load',
  'cdc_capture',
  'cdc_apply',
  'validation',
  'cutover'
];

export const PIPELINE_STAGES = [
  { key: 'connectivity', label: 'Connect' },
  { key: 'discovery', label: 'Discover' },
  { key: 'assessment', label: 'Assess' },
  { key: 'conversion', label: 'Convert' },
  { key: 'deployment', label: 'Deploy' },
  { key: 'data_load', label: 'Full Load' },
  { key: 'cdc', label: 'CDC' },
  { key: 'validation', label: 'Validate' },
  { key: 'cutover', label: 'Cutover' }
];

export function nowIso() {
  return new Date().toISOString();
}

export function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return {
    passwordHash,
    salt,
    algorithm: 'pbkdf2_sha256',
    iterations: 120000
  };
}

export function verifyPassword(password, record) {
  if (!password || !record?.passwordHash || !record?.salt) {
    return false;
  }

  const iterations = Number(record.iterations || 120000);
  const candidate = crypto.pbkdf2Sync(String(password), record.salt, iterations, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(record.passwordHash, 'hex'));
}

export function createToken(prefix) {
  return `${prefix}_${crypto.randomBytes(18).toString('hex')}`;
}

export function slugifyTenantName(value) {
  const slug = String(value || 'organization')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'organization';
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function priorityRank(priority) {
  return { low: 1, medium: 2, high: 3, urgent: 4 }[priority] ?? 1;
}

export function capabilityForJob(jobType) {
  switch (jobType) {
    case 'validate_oracle_connection':
      return 'connectivity';
    case 'discover_source_inventory':
      return 'discovery';
    case 'run_assessment_rules':
      return 'validation';
    case 'generate_conversion_artifacts':
      return 'conversion';
    case 'deploy_pre_data_objects':
      return 'deployment';
    case 'bulk_load_table_chunk':
      return 'bulk_load';
    case 'start_cdc_stream':
      return 'cdc_capture';
    case 'apply_cdc_batch':
      return 'cdc_apply';
    case 'run_validation_check':
      return 'validation';
    case 'execute_cutover_step':
      return 'cutover';
    default:
      return 'discovery';
  }
}

export function normalizePipelineStage(stage) {
  switch (stage) {
    case 'connect':
    case 'connection':
    case 'connectivity':
    case 'connection_setup':
      return 'connectivity';
    case 'discover':
    case 'discovery':
      return 'discovery';
    case 'assess':
    case 'assessment':
      return 'assessment';
    case 'convert':
    case 'conversion':
      return 'conversion';
    case 'deploy':
    case 'deployment':
      return 'deployment';
    case 'full_load':
    case 'data_load':
      return 'data_load';
    case 'cdc':
      return 'cdc';
    case 'validate':
    case 'validation':
      return 'validation';
    case 'cutover':
      return 'cutover';
    default:
      return 'connectivity';
  }
}

export function buildPipelineStages(currentStage, projectStatus = 'in_progress') {
  const normalizedStage = normalizePipelineStage(currentStage);
  const activeIndex = PIPELINE_STAGES.findIndex((stage) => stage.key === normalizedStage);
  const isComplete = projectStatus === 'completed' || projectStatus === 'cutover_complete';

  return PIPELINE_STAGES.map((stage, index) => {
    let status = 'pending';

    if (isComplete || index < activeIndex) {
      status = 'completed';
    } else if (index === activeIndex) {
      status = 'active';
    }

    return {
      key: stage.key,
      label: stage.label,
      status,
      timeLabel: status === 'completed' ? 'Completed' : status === 'active' ? 'In Progress' : 'Pending'
    };
  });
}

export function humanizeEngine(engine) {
  switch ((engine || '').toLowerCase()) {
    case 'not_selected':
    case 'target_tbd':
    case 'tbd':
      return 'Target TBD';
    case 'oracle':
      return 'Oracle';
    case 'postgresql':
      return 'PostgreSQL';
    case 'aurora_postgresql':
      return 'Aurora PostgreSQL';
    case 'cloudsql_postgresql':
      return 'Cloud SQL PostgreSQL';
    default:
      return engine || 'Unknown';
  }
}

export function humanizeEngagementMode(mode) {
  switch ((mode || '').toLowerCase()) {
    case 'migration_cdc':
      return 'Migration + CDC';
    case 'migration_factory':
      return 'Migration Factory';
    case 'assessment':
      return 'Assessment Only';
    default:
      return mode ? mode.replaceAll('_', ' ') : 'Unknown';
  }
}

function uniqueById(items, keyName) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.[keyName];
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildEnvironmentSnapshot(environment, project) {
  if (!environment) {
    return null;
  }

  const settings = environment?.settingsJson || environment?.settings || {};
  const isSource = environment?.environmentType === 'source';

  return {
    environmentId: environment?.environmentId ?? null,
    environmentName: environment?.environmentName ?? null,
    environmentType: environment?.environmentType ?? null,
    status: environment?.status ?? 'unknown',
    cloudProvider: environment?.cloudProvider ?? settings.cloudProvider ?? (isSource ? 'onprem' : 'aws'),
    regionName: environment?.regionName ?? settings.regionName ?? 'us-east-1',
    networkZone: environment?.networkZone ?? settings.networkZone ?? null,
    engineVersion:
      settings.engineVersion ??
      (isSource
        ? 'Oracle 19c EE'
        : project?.targetEngine?.toLowerCase() === 'postgresql'
          ? 'PostgreSQL 16'
          : humanizeEngine(project?.targetEngine)),
    host:
      settings.host ??
      (isSource ? 'oracle.internal:1521' : 'postgres.internal:5432'),
    schemas: settings.schemas ?? null,
    tables: settings.tables ?? null,
    packages: settings.packages ?? null,
    tablesDeployed: settings.tablesDeployed ?? null,
    codeDeployed: settings.codeDeployed ?? null,
    totalSizeTb: settings.totalSizeTb ?? null
  };
}

export function buildProjectOverviewPayload({
  project,
  owner,
  environments = [],
  workflows = [],
  workflowSteps = [],
  jobs = [],
  agents = []
}) {
  if (!project) {
    throw new Error('Project not found');
  }

  const sourceEnvironment = environments.find((environment) => environment.environmentType === 'source') || null;
  const targetEnvironment = environments.find((environment) => environment.environmentType === 'target') || null;
  const workflow =
    [...workflows].sort((left, right) => String(right.startedAt || '').localeCompare(String(left.startedAt || '')))[0] ||
    null;
  const steps = [...workflowSteps].sort((left, right) => (left.stepOrder ?? 0) - (right.stepOrder ?? 0));

  const relatedAgentIds = new Set(jobs.map((job) => job.leasedToAgentId).filter(Boolean));
  const relatedAgents =
    relatedAgentIds.size > 0
      ? agents.filter((agent) => relatedAgentIds.has(agent.agentId))
      : agents.filter((agent) => agent.tenantId === project.tenantId && agent.status !== 'retired');

  const dedupedAgents = uniqueById(relatedAgents, 'agentId');
  const queuedJobs = jobs.filter((job) => job.status === 'queued').length;
  const leasedJobs = jobs.filter((job) => job.status === 'leased').length;
  const runningJobs = jobs.filter((job) => job.status === 'running').length;
  const succeededJobs = jobs.filter((job) => job.status === 'succeeded').length;
  const failedJobs = jobs.filter((job) => job.status === 'failed').length;
  const pipeline = buildPipelineStages(project.pipelineStage, project.status);
  const activeStage = pipeline.find((stage) => stage.status === 'active') || pipeline[pipeline.length - 1];
  const completedStages = pipeline.filter((stage) => stage.status === 'completed').length;
  const completionPct = Math.round(((completedStages + (activeStage?.status === 'active' ? 0.5 : 0)) / pipeline.length) * 100);

  return {
    project,
    owner: owner || null,
    sourceEnvironment: buildEnvironmentSnapshot(sourceEnvironment, project),
    targetEnvironment: buildEnvironmentSnapshot(targetEnvironment, project),
    workflow,
    workflowSteps: steps,
    pipeline,
    agents: dedupedAgents,
    jobs: [...jobs].sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || ''))),
    summary: {
      activeStageKey: activeStage?.key || normalizePipelineStage(project.pipelineStage),
      activeStageLabel: activeStage?.label || 'Discover',
      completionPct,
      totalJobs: jobs.length,
      queuedJobs,
      leasedJobs,
      runningJobs,
      succeededJobs,
      failedJobs,
      activeAgents: dedupedAgents.filter((agent) => agent.status === 'active').length,
      criticalIssues: project.criticalIssues ?? 0,
      warningIssues: project.warningIssues ?? 0,
      startedAt: workflow?.startedAt || project.createdAt || null,
      modeLabel: humanizeEngagementMode(project.engagementMode),
      sourceEngineLabel: humanizeEngine(project.sourceEngine),
      targetEngineLabel: humanizeEngine(project.targetEngine)
    }
  };
}

export function createSeedIds() {
  return {
    tenantId: '7cd95f6a-b050-4cff-991f-1f04efaf5725',
    userId: '4ec34f47-cfb7-4a0f-845a-c1506be5ca89',
    projectId: 'af353db7-d0a6-44fe-8505-d8ca6b0ae3e3',
    projectTwoId: '619cf081-c176-4961-b5db-ef8778605926',
    sourceEnvId: '80a20bac-4ec7-483a-a1fb-9e2c3b89a749',
    targetEnvId: 'f32ee46c-1767-4fcc-b431-b0e4752506a7',
    agentPoolId: '867d0f0f-87d6-46fe-9f4a-10fa4e85db99',
    registrationId: '09080742-d0cc-45d2-8860-768266ec9536',
    workflowRunId: '9e84316e-a041-47e6-aa81-26a25d680efb',
    stepRunId: '2f714af6-500d-42c0-b931-0a1bc4d3a214',
    job1Id: '658b9e84-b073-49ea-9d08-0ec00e447e0a',
    job2Id: 'de00ff7e-2891-4c7d-b839-514effc1f527',
    job3Id: '7e33873d-f593-465a-a894-f3befec9b5b4'
  };
}
