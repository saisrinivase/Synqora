import test from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_LOGIN_EMAIL, DEMO_LOGIN_PASSWORD, DEMO_REGISTRATION_TOKEN } from '../src/shared.js';
import { SynqoraStore } from '../src/store.js';

test('demo SaaS login returns tenant-scoped user context', () => {
  const store = new SynqoraStore();
  const context = store.authenticateUser({
    email: DEMO_LOGIN_EMAIL,
    password: DEMO_LOGIN_PASSWORD
  });

  assert.equal(context.user.email, DEMO_LOGIN_EMAIL);
  assert.equal(context.tenant.slug, 'synqora-demo');
  assert.equal(context.role, 'admin');
});

test('agent registration creates a usable agent identity', () => {
  const store = new SynqoraStore();
  const registered = store.registerAgent({
    registrationToken: DEMO_REGISTRATION_TOKEN,
    agentName: 'test-agent',
    capabilities: ['discovery', 'validation']
  });

  assert.equal(registered.agent.agentName, 'test-agent');
  assert.ok(registered.accessToken);

  const authenticated = store.authenticateAgent(registered.accessToken);
  assert.equal(authenticated.agentId, registered.agent.agentId);
});

test('leased discovery work can be started and completed', () => {
  const store = new SynqoraStore();
  const registered = store.registerAgent({
    registrationToken: DEMO_REGISTRATION_TOKEN,
    agentName: 'discoverer',
    capabilities: ['discovery', 'validation', 'conversion']
  });

  const jobs = store.pollJobs(registered.agent.agentId, { maxJobs: 1 });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].jobType, 'discover_source_inventory');

  store.startJob(registered.agent.agentId, jobs[0].jobRunId);
  store.checkpointJob(registered.agent.agentId, jobs[0].jobRunId, {
    checkpointType: 'inventory_snapshot',
    checkpointKey: 'schemas:2',
    checkpointState: { schemasCompleted: 2 }
  });
  const completed = store.completeJob(registered.agent.agentId, jobs[0].jobRunId, {
    summary: 'Source inventory captured'
  });

  assert.equal(completed.status, 'succeeded');
  assert.ok(store.listJobs().some((job) => job.jobType === 'run_assessment_rules' && job.status === 'queued'));
});
