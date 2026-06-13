import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_LOGIN_EMAIL, DEMO_LOGIN_PASSWORD, DEMO_REGISTRATION_TOKEN, createToken } from './shared.js';
import { createStoreFromEnv } from './create-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');
const uiPrototypeDir = path.join(workspaceRoot, 'ui-prototype');

const port = Number(process.env.SYNQORA_PORT || 8787);
const host = process.env.SYNQORA_HOST || '127.0.0.1';
const store = await createStoreFromEnv();
const SESSION_COOKIE_NAME = 'synqora_session';
const SESSION_TTL_MS = Number(process.env.SYNQORA_SESSION_TTL_MS || 1000 * 60 * 60 * 8);
const sessions = new Map();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(payload);
}

function sendUnauthorized(response) {
  sendJson(response, 401, { error: 'Authentication required' });
}

function notFound(response) {
  sendJson(response, 404, { error: 'Not Found' });
}

function parseCookies(request) {
  const header = request.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...valueParts] = part.split('=');
        return [decodeURIComponent(key), decodeURIComponent(valueParts.join('='))];
      })
  );
}

function buildSessionCookie(sessionToken, maxAgeSeconds) {
  const value = sessionToken ? `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}` : `${SESSION_COOKIE_NAME}=`;
  return [
    value,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ].join('; ');
}

function getBearerToken(request) {
  const value = request.headers.authorization || '';
  const [scheme, token] = value.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

async function authenticateUserRequest(request) {
  const token = parseCookies(request)[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  session.lastSeenAt = Date.now();
  return session.context;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStaticFile(response, relativePath, contentType) {
  const absolutePath = path.join(uiPrototypeDir, relativePath);
  try {
    const file = await fs.readFile(absolutePath);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    response.end(file);
  } catch {
    notFound(response);
  }
}

function handleError(response, error) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  sendJson(response, 400, { error: message });
}

function sendSession(response, context) {
  return sendJson(response, 200, {
    authenticated: true,
    user: context.user,
    tenant: context.tenant,
    role: context.role
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, {
        ok: true,
        service: 'synqora-cloud',
        version: '0.1.0',
        time: new Date().toISOString()
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/auth/session') {
      const context = await authenticateUserRequest(request);
      if (!context) {
        return sendJson(response, 200, {
          authenticated: false,
          demoLogin: {
            email: DEMO_LOGIN_EMAIL,
            password: DEMO_LOGIN_PASSWORD
          }
        });
      }

      return sendSession(response, context);
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/auth/login') {
      const body = await readJsonBody(request);
      const context = await store.authenticateUser({
        email: body.email,
        password: body.password
      });
      const sessionToken = createToken('synqora_session');
      sessions.set(sessionToken, {
        context,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS
      });
      response.setHeader('Set-Cookie', buildSessionCookie(sessionToken, Math.floor(SESSION_TTL_MS / 1000)));
      return sendSession(response, context);
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/auth/logout') {
      const token = parseCookies(request)[SESSION_COOKIE_NAME];
      if (token) {
        sessions.delete(token);
      }
      response.setHeader('Set-Cookie', buildSessionCookie('', 0));
      return sendJson(response, 200, { authenticated: false });
    }

    if (url.pathname.startsWith('/api/v1/') && !url.pathname.startsWith('/api/v1/agent/')) {
      const context = await authenticateUserRequest(request);
      if (!context) {
        return sendUnauthorized(response);
      }
      request.synqoraUser = context;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') {
      return sendJson(response, 200, await store.getDashboard());
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/projects') {
      return sendJson(response, 200, { projects: await store.listProjects() });
    }

    const projectOverviewMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)\/overview$/);
    if (request.method === 'GET' && projectOverviewMatch) {
      const [, projectId] = projectOverviewMatch;
      return sendJson(response, 200, await store.getProjectOverview(projectId));
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/agents') {
      return sendJson(response, 200, { agents: await store.listAgents() });
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/jobs') {
      return sendJson(response, 200, { jobs: await store.listJobs() });
    }

    if (request.method === 'POST' && url.pathname === '/api/v1/agent/register') {
      const body = await readJsonBody(request);
      const registration = await store.registerAgent({
        registrationToken: body.registrationToken,
        agentName: body.agentName,
        runtimeMode: body.runtimeMode,
        platformType: body.platformType,
        capabilities: body.capabilities
      });
      return sendJson(response, 201, registration);
    }

    if (url.pathname.startsWith('/api/v1/agent/')) {
      const agent = await store.authenticateAgent(getBearerToken(request));

      if (request.method === 'POST' && url.pathname === '/api/v1/agent/heartbeat') {
        const body = await readJsonBody(request);
        return sendJson(response, 200, {
          heartbeat: await store.heartbeatAgent(agent.agentId, body),
          agent
        });
      }

      if (request.method === 'POST' && url.pathname === '/api/v1/agent/jobs/poll') {
        const body = await readJsonBody(request);
        return sendJson(response, 200, {
          jobs: await store.pollJobs(agent.agentId, { maxJobs: body.maxJobs })
        });
      }
    }

    const jobMatch = url.pathname.match(/^\/api\/v1\/agent\/jobs\/([^/]+)\/(start|checkpoint|complete|fail)$/);
    if (jobMatch && request.method === 'POST') {
      const agent = await store.authenticateAgent(getBearerToken(request));
      const body = await readJsonBody(request);
      const [, jobRunId, action] = jobMatch;

      if (action === 'start') {
        return sendJson(response, 200, { job: await store.startJob(agent.agentId, jobRunId) });
      }

      if (action === 'checkpoint') {
        return sendJson(response, 200, { checkpoint: await store.checkpointJob(agent.agentId, jobRunId, body) });
      }

      if (action === 'complete') {
        return sendJson(response, 200, { job: await store.completeJob(agent.agentId, jobRunId, body) });
      }

      if (action === 'fail') {
        return sendJson(response, 200, { job: await store.failJob(agent.agentId, jobRunId, body) });
      }
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return serveStaticFile(response, 'index.html', 'text/html; charset=utf-8');
    }

    if (request.method === 'GET' && url.pathname === '/app.js') {
      return serveStaticFile(response, 'app.js', 'application/javascript; charset=utf-8');
    }

    if (request.method === 'GET' && url.pathname === '/styles.css') {
      return serveStaticFile(response, 'styles.css', 'text/css; charset=utf-8');
    }

    if (request.method === 'GET' && url.pathname === '/bootstrap-token') {
      return sendText(response, 200, DEMO_REGISTRATION_TOKEN);
    }

    return notFound(response);
  } catch (error) {
    return handleError(response, error);
  }
});

server.listen(port, host, () => {
  console.log(`Synqora Cloud listening on http://${host}:${port}`);
  console.log(`Demo bootstrap token: ${DEMO_REGISTRATION_TOKEN}`);
});
