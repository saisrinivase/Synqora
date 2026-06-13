async function requestJson(url, { method = 'GET', token, body } = {}) {
  const headers = {
    Accept: 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || `${response.status} ${response.statusText}`);
  }

  return payload;
}

export function createCloudClient(baseUrl, agentToken) {
  const root = baseUrl.replace(/\/$/, '');

  return {
    register(body) {
      return requestJson(`${root}/api/v1/agent/register`, {
        method: 'POST',
        body
      });
    },
    heartbeat(body) {
      return requestJson(`${root}/api/v1/agent/heartbeat`, {
        method: 'POST',
        token: agentToken,
        body
      });
    },
    pollJobs(body) {
      return requestJson(`${root}/api/v1/agent/jobs/poll`, {
        method: 'POST',
        token: agentToken,
        body
      });
    },
    startJob(jobRunId) {
      return requestJson(`${root}/api/v1/agent/jobs/${jobRunId}/start`, {
        method: 'POST',
        token: agentToken,
        body: {}
      });
    },
    checkpointJob(jobRunId, body) {
      return requestJson(`${root}/api/v1/agent/jobs/${jobRunId}/checkpoint`, {
        method: 'POST',
        token: agentToken,
        body
      });
    },
    completeJob(jobRunId, body) {
      return requestJson(`${root}/api/v1/agent/jobs/${jobRunId}/complete`, {
        method: 'POST',
        token: agentToken,
        body
      });
    },
    failJob(jobRunId, body) {
      return requestJson(`${root}/api/v1/agent/jobs/${jobRunId}/fail`, {
        method: 'POST',
        token: agentToken,
        body
      });
    }
  };
}
