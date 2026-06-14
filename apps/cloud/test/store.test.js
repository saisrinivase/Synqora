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

  const dashboard = store.getDashboard(context);
  assert.equal(dashboard.projects.length, 0);
  assert.equal(dashboard.jobs.length, 0);
});

test('email signup creates a new tenant-scoped owner account', () => {
  const store = new SynqoraStore();
  const context = store.createUserAccount({
    email: 'new.owner@example.com',
    password: 'StrongPass123',
    displayName: 'New Owner',
    organizationName: 'New Migration Org'
  });

  assert.equal(context.user.email, 'new.owner@example.com');
  assert.equal(context.tenant.name, 'New Migration Org');
  assert.equal(context.role, 'owner');

  const signedIn = store.authenticateUser({
    email: 'new.owner@example.com',
    password: 'StrongPass123'
  });
  assert.equal(signedIn.tenant.tenantId, context.tenant.tenantId);

  const dashboard = store.getDashboard(signedIn);
  assert.equal(dashboard.tenant.name, 'New Migration Org');
  assert.equal(dashboard.projects.length, 0);
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

test('oracle connection creation queues assessment validation work', () => {
  const store = new SynqoraStore();
  const context = store.authenticateUser({
    email: DEMO_LOGIN_EMAIL,
    password: DEMO_LOGIN_PASSWORD
  });
  const project = store.createProject(context, {
    projectCode: 'FIN-ASSMT-001',
    name: 'Finance Oracle Assessment',
    schemaScope: 'FINANCE_CORE'
  });
  const created = store.createDatabaseConnection(context, {
    projectId: project.projectId,
    connectionRole: 'source_assessment',
    engine: 'Oracle 19c',
    host: 'oracle.internal',
    port: '1521',
    serviceName: 'FINPROD',
    schemaScope: 'FINANCE_CORE',
    credentialReference: 'vault://finance/oracle/readonly',
    agentNetworkZone: 'customer-onprem-east',
    startAssessment: true
  });

  assert.equal(created.connection.environmentType, 'source');
  assert.equal(created.connection.status, 'pending_validation');
  assert.equal(created.project.status, 'assessment_queued');

  const jobs = store.listJobs(context);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].jobType, 'validate_oracle_connection');
  assert.equal(jobs[0].capabilityRequired, 'connectivity');
});

test('leased oracle validation work can be completed and queues discovery', () => {
  const store = new SynqoraStore();
  const context = store.authenticateUser({
    email: DEMO_LOGIN_EMAIL,
    password: DEMO_LOGIN_PASSWORD
  });
  const project = store.createProject(context, {
    projectCode: 'FIN-ASSMT-002',
    name: 'Finance Oracle Assessment',
    schemaScope: 'FINANCE_CORE'
  });
  store.createDatabaseConnection(context, {
    projectId: project.projectId,
    connectionRole: 'source_assessment',
    engine: 'Oracle 19c',
    host: 'oracle.internal',
    port: '1521',
    serviceName: 'FINPROD',
    schemaScope: 'FINANCE_CORE',
    credentialReference: 'vault://finance/oracle/readonly',
    startAssessment: true
  });
  const registered = store.registerAgent({
    registrationToken: DEMO_REGISTRATION_TOKEN,
    agentName: 'discoverer',
    capabilities: ['connectivity', 'discovery', 'validation', 'conversion']
  });

  const jobs = store.pollJobs(registered.agent.agentId, { maxJobs: 1 });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].jobType, 'validate_oracle_connection');

  store.startJob(registered.agent.agentId, jobs[0].jobRunId);
  store.checkpointJob(registered.agent.agentId, jobs[0].jobRunId, {
    checkpointType: 'oracle_connection_validation',
    checkpointKey: 'network:ok',
    checkpointState: { networkReachable: true, dictionaryAccess: true }
  });
  const completed = store.completeJob(registered.agent.agentId, jobs[0].jobRunId, {
    summary: 'Oracle connection validated'
  });

  assert.equal(completed.status, 'succeeded');
  assert.ok(store.listJobs(context).some((job) => job.jobType === 'discover_source_inventory' && job.status === 'queued'));
});
