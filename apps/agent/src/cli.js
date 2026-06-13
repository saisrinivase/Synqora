#!/usr/bin/env node

import os from 'node:os';

import { createCloudClient } from './cloud-client.js';
import { loadAgentState, saveAgentState } from './local-state.js';

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function getBaseUrl(options) {
  return options.url || process.env.SYNQORA_CLOUD_URL || 'http://127.0.0.1:8787';
}

async function requireRegisteredState(options) {
  const { stateFile, state } = await loadAgentState(options.state);
  if (!state) {
    throw new Error(`No local agent state found at ${stateFile}. Run "register" first.`);
  }
  return { stateFile, state };
}

async function commandRegister(options) {
  const baseUrl = getBaseUrl(options);
  const registrationToken = options.token || process.env.SYNQORA_REGISTRATION_TOKEN;
  if (!registrationToken) {
    throw new Error('Missing registration token. Use --token or SYNQORA_REGISTRATION_TOKEN.');
  }

  const agentName = options.name || `synqora-agent-${os.hostname()}`;
  const runtimeMode = options.runtime || 'docker';
  const capabilities = (options.capabilities || 'discovery,conversion,deployment,bulk_load,cdc_capture,cdc_apply,validation,cutover')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const client = createCloudClient(baseUrl);
  const registration = await client.register({
    registrationToken,
    agentName,
    runtimeMode,
    platformType: os.platform(),
    capabilities
  });

  const state = {
    cloudUrl: baseUrl,
    agentId: registration.agent.agentId,
    agentName: registration.agent.agentName,
    accessToken: registration.accessToken,
    capabilities: registration.agent.capabilities,
    registeredAt: registration.agent.registeredAt
  };

  const stateFile = await saveAgentState(options.state, state);
  console.log(`Registered agent ${state.agentName} (${state.agentId})`);
  console.log(`Saved local state to ${stateFile}`);
}

async function commandStatus(options) {
  const { stateFile, state } = await requireRegisteredState(options);
  console.log(JSON.stringify({ stateFile, state }, null, 2));
}

async function commandHeartbeat(options) {
  const { state } = await requireRegisteredState(options);
  const client = createCloudClient(state.cloudUrl, state.accessToken);
  const response = await client.heartbeat({
    healthStatus: 'healthy',
    cpuPct: 21,
    memoryPct: 38,
    activeWorkflow: options.workflow || null
  });
  console.log(JSON.stringify(response, null, 2));
}

async function commandPoll(options) {
  const { state } = await requireRegisteredState(options);
  const client = createCloudClient(state.cloudUrl, state.accessToken);
  const response = await client.pollJobs({
    maxJobs: Number(options.maxJobs || 1)
  });
  console.log(JSON.stringify(response, null, 2));
}

async function runMockExecution(client, job) {
  await client.startJob(job.jobRunId);
  await client.checkpointJob(job.jobRunId, {
    checkpointType: 'mock_progress',
    checkpointKey: `${job.jobType}:50pct`,
    checkpointState: {
      stage: 'halfway',
      observedAt: new Date().toISOString()
    }
  });

  return client.completeJob(job.jobRunId, {
    summary: `Mock execution completed for ${job.jobType}`,
    metrics: {
      durationSeconds: 2,
      rowsProcessed: job.jobType === 'bulk_load_table_chunk' ? 250000 : null
    }
  });
}

async function commandRunOnce(options) {
  const { state } = await requireRegisteredState(options);
  const client = createCloudClient(state.cloudUrl, state.accessToken);
  const lease = await client.pollJobs({
    maxJobs: 1
  });

  if (!lease.jobs || lease.jobs.length === 0) {
    console.log('No eligible jobs available.');
    return;
  }

  const job = lease.jobs[0];
  console.log(`Leased job ${job.jobRunId} (${job.jobType})`);
  const result = await runMockExecution(client, job);
  console.log(JSON.stringify(result, null, 2));
}

function printHelp() {
  console.log(`Synqora Agent CLI

Usage:
  node apps/agent/src/cli.js register --token synqora-demo-token
  node apps/agent/src/cli.js status
  node apps/agent/src/cli.js heartbeat
  node apps/agent/src/cli.js poll
  node apps/agent/src/cli.js run-once

Options:
  --url           Synqora Cloud base URL (default: http://127.0.0.1:8787)
  --state         Local agent state file (default: .synqora/agent-state.json)
  --token         Bootstrap registration token
  --name          Agent name
  --runtime       Runtime mode (docker, kubernetes, vm)
  --capabilities  Comma-separated capabilities
`);
}

async function main() {
  const [, , command = 'help', ...argv] = process.argv;
  const options = parseArgs(argv);

  switch (command) {
    case 'register':
      return commandRegister(options);
    case 'status':
      return commandStatus(options);
    case 'heartbeat':
      return commandHeartbeat(options);
    case 'poll':
      return commandPoll(options);
    case 'run-once':
      return commandRunOnce(options);
    case 'help':
    default:
      printHelp();
  }
}

main().catch((error) => {
  console.error(`Synqora Agent CLI error: ${error.message}`);
  process.exitCode = 1;
});
