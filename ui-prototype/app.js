/* ============================================================
   SYNQORA — Application Logic
   Navigation, interactions, animations
   ============================================================ */

const appState = {
  session: null,
  dashboard: null,
  selectedProjectId: null,
  selectedProjectOverview: null,
  activeProjectFilter: 'all'
};

const viewNames = {
  dashboard: 'Dashboard',
  project: 'Project Pipeline',
  assessment: 'Assessment',
  converter: 'Schema Converter',
  dataload: 'Data Load',
  cdc: 'CDC / Replication',
  validation: 'Validation',
  cutover: 'Cutover Control'
};

document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initCounters();
  initSparkline();
  initModalHandlers();
  initFilterHandlers();
  initProjectCardHandlers();
  initAuthHandlers();
  await initAuthSession();
});

async function initAuthSession() {
  try {
    const response = await fetch('/api/v1/auth/session', { credentials: 'same-origin' });
    const payload = await response.json();

    if (payload.demoLogin) {
      applyDemoLoginHint(payload.demoLogin);
    }

    if (payload.authenticated) {
      setAuthenticatedSession(payload);
      await initDashboardApi();
      return;
    }
  } catch (error) {
    console.warn('Synqora session bootstrap failed:', error);
  }

  setLoggedOutView();
}

function initAuthHandlers() {
  const authTabs = document.querySelectorAll('.auth-tab[data-auth-mode]');
  authTabs.forEach((tab) => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode || 'signin'));
  });

  const providerButtons = document.querySelectorAll('[data-auth-provider]');
  providerButtons.forEach((button) => {
    button.addEventListener('click', () => showProviderMessage(button.dataset.authProvider));
  });

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitLogin();
    });
  }

  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitSignup();
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
      appState.session = null;
      appState.dashboard = null;
      appState.selectedProjectId = null;
      appState.selectedProjectOverview = null;
      setLoggedOutView();
    });
  }
}

function setAuthMode(mode) {
  const loginCard = document.querySelector('.login-card');
  const providerMessage = document.getElementById('providerMessage');
  const loginError = document.getElementById('loginError');
  const signupError = document.getElementById('signupError');

  document.querySelectorAll('.auth-tab[data-auth-mode]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.authMode === mode);
  });

  if (loginCard) {
    loginCard.classList.toggle('signup-mode', mode === 'signup');
  }
  if (providerMessage) providerMessage.textContent = '';
  if (loginError) loginError.textContent = '';
  if (signupError) signupError.textContent = '';
}

function showProviderMessage(provider) {
  const providerMessage = document.getElementById('providerMessage');
  const providerLabel = {
    google: 'Google Workspace',
    github: 'GitHub',
    sso: 'Company SSO / OIDC'
  }[provider] || 'identity provider';

  if (providerMessage) {
    providerMessage.textContent = `${providerLabel} login is part of the enterprise auth surface. Configure OAuth/OIDC/SAML provider settings for production; use email signup in this local prototype.`;
  }
}

async function submitLogin() {
  const emailEl = document.getElementById('loginEmail');
  const passwordEl = document.getElementById('loginPassword');
  const errorEl = document.getElementById('loginError');
  const submitBtn = document.querySelector('#loginForm button[type="submit"]');

  if (errorEl) errorEl.textContent = '';
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailEl?.value,
        password: passwordEl?.value
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to sign in');
    }

    setAuthenticatedSession(payload);
    await initDashboardApi();
  } catch (error) {
    if (errorEl) errorEl.textContent = error.message || 'Unable to sign in';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function submitSignup() {
  const emailEl = document.getElementById('signupEmail');
  const displayNameEl = document.getElementById('signupDisplayName');
  const organizationEl = document.getElementById('signupOrganization');
  const passwordEl = document.getElementById('signupPassword');
  const errorEl = document.getElementById('signupError');
  const submitBtn = document.querySelector('#signupForm button[type="submit"]');

  if (errorEl) errorEl.textContent = '';
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await fetch('/api/v1/auth/signup', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailEl?.value,
        displayName: displayNameEl?.value,
        organizationName: organizationEl?.value,
        password: passwordEl?.value
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to create account');
    }

    setAuthenticatedSession(payload);
    await initDashboardApi();
  } catch (error) {
    if (errorEl) errorEl.textContent = error.message || 'Unable to create account';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function setAuthenticatedSession(payload) {
  appState.session = payload;
  document.body.classList.remove('auth-pending');
  document.body.classList.add('authenticated');
  renderSessionIdentity(payload);
}

function setLoggedOutView() {
  document.body.classList.remove('authenticated');
  document.body.classList.add('auth-pending');
  const emailEl = document.getElementById('loginEmail');
  if (emailEl && !emailEl.value) {
    emailEl.focus();
  }
}

function renderSessionIdentity(payload) {
  const user = payload.user || {};
  const tenant = payload.tenant || {};
  const role = payload.role || 'user';
  const displayName = user.displayName || user.email || 'Synqora User';

  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  const tenantEl = document.getElementById('tenantNameLabel');

  if (nameEl) nameEl.textContent = displayName;
  if (roleEl) roleEl.textContent = humanizeStatus(role);
  if (tenantEl) tenantEl.textContent = tenant.name || 'Synqora Tenant';
  if (avatarEl) {
    avatarEl.textContent = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'SU';
  }
}

function applyDemoLoginHint(demoLogin) {
  const hint = document.getElementById('demoLoginHint');
  const email = document.getElementById('loginEmail');
  const password = document.getElementById('loginPassword');
  if (hint) {
    hint.textContent = `${demoLogin.email} / ${demoLogin.password}`;
  }
  if (email && !email.value) email.value = demoLogin.email;
  if (password && !password.value) password.value = demoLogin.password;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin'
  });

  if (response.status === 401) {
    setLoggedOutView();
  }

  return response;
}

async function initDashboardApi() {
  try {
    const response = await apiFetch('/api/v1/dashboard');
    if (!response.ok) return;

    const payload = await response.json();
    appState.dashboard = payload;

    const summary = payload.summary || {};

    setCounterValue('activeProjectsStat', summary.activeProjects);
    setCounterValue('objectsDiscoveredStat', summary.discoveredObjects);
    setCounterValue('conversionRateStat', summary.averageConversionRatePct);

    const dataWhole = document.getElementById('dataMigratedWholeStat');
    const dataFraction = document.getElementById('dataMigratedFractionStat');
    if (typeof summary.dataMigratedTb === 'number' && dataWhole && dataFraction) {
      const [whole, fraction = '0'] = summary.dataMigratedTb.toFixed(1).split('.');
      dataWhole.textContent = Number(whole).toLocaleString();
      dataFraction.textContent = fraction;
    }

    renderDashboardProjects(payload.projects || []);

    const defaultProjectId = appState.selectedProjectId || payload.projects?.[0]?.projectId;
    if (defaultProjectId) {
      await loadProjectOverview(defaultProjectId);
    }
  } catch (error) {
    console.warn('Synqora dashboard bootstrap failed:', error);
  }
}

async function loadProjectOverview(projectId, options = {}) {
  try {
    const response = await apiFetch(`/api/v1/projects/${projectId}/overview`);
    if (!response.ok) return;

    const payload = await response.json();
    appState.selectedProjectId = projectId;
    appState.selectedProjectOverview = payload;

    renderDashboardProjects(appState.dashboard?.projects || []);
    renderProjectOverview(payload);

    if (options.navigate) {
      setActiveView('project');
    }
  } catch (error) {
    console.warn('Synqora project overview load failed:', error);
  }
}

function setCounterValue(id, value) {
  if (typeof value !== 'number') return;
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.count = String(value);
  el.textContent = '0';
  animateCounter(el, value);
}

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const viewId = item.dataset.view;
      if (!viewId) return;
      setActiveView(viewId);
    });
  });

  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }
}

function setActiveView(viewId) {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');
  const breadcrumbPage = document.getElementById('breadcrumbPage');

  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });

  views.forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.add('active');
    targetView.style.animation = 'none';
    targetView.offsetHeight;
    targetView.style.animation = '';
  }

  if (breadcrumbPage) {
    breadcrumbPage.textContent = viewNames[viewId] || viewId;
  }
}

function initProjectCardHandlers() {
  const grid = document.getElementById('projectGrid');
  if (!grid) return;

  grid.addEventListener('click', async (event) => {
    const card = event.target.closest('.project-card[data-project-id]');
    if (!card) return;

    const projectId = card.dataset.projectId;
    if (!projectId) return;

    await loadProjectOverview(projectId, { navigate: true });
  });
}

function renderDashboardProjects(projects) {
  const grid = document.getElementById('projectGrid');
  if (!grid) return;

  const visibleProjects = projects.filter((project) => projectMatchesFilter(project, appState.activeProjectFilter));

  if (visibleProjects.length === 0) {
    grid.innerHTML = '<div class="glass-card empty-state">No projects match the current filter.</div>';
    return;
  }

  grid.innerHTML = visibleProjects.map(createProjectCardMarkup).join('');
}

function projectMatchesFilter(project, filterValue) {
  switch (filterValue) {
    case 'in_progress':
      return project.status === 'in_progress';
    case 'assessment':
      return project.status === 'assessment' || project.pipelineStage === 'assessment';
    case 'cutover_ready':
      return project.pipelineStage === 'cutover' || project.status === 'completed' || project.status === 'cutover_ready';
    case 'all':
    default:
      return true;
  }
}

function createProjectCardMarkup(project) {
  const metrics = buildProjectCardMetrics(project);
  const isSelected = project.projectId === appState.selectedProjectId;

  return `
    <div class="project-card${isSelected ? ' is-selected' : ''}" data-project-id="${escapeHtml(project.projectId)}" data-status="${escapeHtml(project.status || '')}">
      <div class="project-card-header">
        <div class="project-badge oracle">${escapeHtml(engineBadgeLabel(project.sourceEngine))}</div>
        <div class="project-badge pg">${escapeHtml(engineBadgeLabel(project.targetEngine))}</div>
        <span class="project-mode">${escapeHtml(humanizeMode(project.engagementMode))}</span>
      </div>
      <h3 class="project-name">${escapeHtml(project.name || 'Unnamed Project')}</h3>
      <p class="project-desc">${escapeHtml(project.description || 'No description provided')}</p>
      <div class="project-metrics">
        ${metrics
          .map(
            (metric) => `
              <div class="metric">
                <span class="metric-label">${escapeHtml(metric.label)}</span>
                <div class="progress-bar"><div class="progress-fill" style="width: ${metric.progress}%; --bar-color: ${metric.color}"></div></div>
                <span class="metric-value">${escapeHtml(metric.value)}</span>
              </div>
            `
          )
          .join('')}
      </div>
      <div class="project-footer">
        <div class="project-issues">
          <span class="issue-dot critical"></span> ${Number(project.criticalIssues || 0)} Critical
          <span class="issue-dot warning"></span> ${Number(project.warningIssues || 0)} Warnings
        </div>
        <span class="project-updated${pipelineProgressPct(project.pipelineStage) >= 100 ? ' cutover-ready' : ''}">${escapeHtml(formatUpdatedAt(project.updatedAt))}</span>
      </div>
    </div>
  `;
}

function buildProjectCardMetrics(project) {
  return [
    {
      label: 'Objects',
      progress: project.discoveredObjects > 0 ? 100 : 0,
      value: formatCompactNumber(project.discoveredObjects),
      color: '#10b981'
    },
    {
      label: 'Convert',
      progress: clampPercent(project.conversionRatePct),
      value: `${Number(project.conversionRatePct || 0)}%`,
      color: '#06b6d4'
    },
    {
      label: 'Pipeline',
      progress: pipelineProgressPct(project.pipelineStage),
      value: humanizeStage(project.pipelineStage),
      color: '#7c3aed'
    }
  ];
}

function renderProjectOverview(payload) {
  const project = payload.project || {};
  const summary = payload.summary || {};

  const title = document.getElementById('projectViewTitle');
  const subtitle = document.getElementById('projectViewSubtitle');
  if (title) title.textContent = project.name || 'Migration Project';
  if (subtitle) {
    subtitle.textContent = `${summary.sourceEngineLabel || engineBadgeLabel(project.sourceEngine)} -> ${summary.targetEngineLabel || engineBadgeLabel(project.targetEngine)} · ${summary.modeLabel || humanizeMode(project.engagementMode)}`;
  }

  const assessmentSubtitle = document.querySelector('#view-assessment .view-subtitle');
  if (assessmentSubtitle) {
    assessmentSubtitle.textContent = `${project.projectCode || project.name || 'Project'} - ${summary.activeStageLabel || 'Assessment'} state and risk analysis`;
  }

  renderPipelineStages(payload.pipeline || []);
  renderDetailList('sourceDetailList', buildSourceRows(payload));
  renderDetailList('targetDetailList', buildTargetRows(payload));
  renderDetailList('migrationSummaryList', buildSummaryRows(payload));
  renderProjectAgents(payload.agents || []);
  renderProjectJobs(payload.jobs || [], payload.agents || []);
}

function renderPipelineStages(stages) {
  const container = document.getElementById('projectPipelineStages');
  if (!container) return;

  container.innerHTML = stages
    .map((stage, index) => {
      const isLast = index === stages.length - 1;

      if (stage.status === 'completed') {
        return `
          <div class="pipeline-stage completed">
            <div class="stage-node">${completedStageIcon()}</div>
            <div class="${isLast ? 'stage-connector last' : 'stage-connector done'}"></div>
            <span class="stage-label">${escapeHtml(stage.label)}</span>
            <span class="stage-time">${escapeHtml(stage.timeLabel)}</span>
          </div>
        `;
      }

      if (stage.status === 'active') {
        return `
          <div class="pipeline-stage active-stage">
            <div class="stage-node running"><div class="pulse-ring"></div>${activeStageIcon(stage.key)}</div>
            <div class="${isLast ? 'stage-connector last' : 'stage-connector'}"></div>
            <span class="stage-label">${escapeHtml(stage.label)}</span>
            <span class="stage-time">${escapeHtml(stage.timeLabel)}</span>
          </div>
        `;
      }

      return `
        <div class="pipeline-stage">
          <div class="stage-node pending">${pendingStageIcon(stage.key)}</div>
          <div class="${isLast ? 'stage-connector last' : 'stage-connector'}"></div>
          <span class="stage-label">${escapeHtml(stage.label)}</span>
          <span class="stage-time">${escapeHtml(stage.timeLabel)}</span>
        </div>
      `;
    })
    .join('');
}

function renderDetailList(targetId, rows) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = rows.filter(Boolean).join('');
}

function buildSourceRows(payload) {
  const source = payload.sourceEnvironment || {};
  return [
    detailRow('Engine', source.engineVersion || 'Oracle'),
    detailRow('Host', source.host || '-', 'mono'),
    detailRow('Schemas', nullableNumber(source.schemas)),
    detailRow('Tables', nullableNumber(source.tables)),
    detailRow('Packages', nullableNumber(source.packages)),
    detailRow('Total Size', source.totalSizeTb != null ? `${Number(source.totalSizeTb).toFixed(1)} TB` : '-'),
    detailRow('Status', statusBadge(humanizeStatus(source.status), statusTone(source.status)))
  ];
}

function buildTargetRows(payload) {
  const target = payload.targetEnvironment || {};
  const project = payload.project || {};

  if (!payload.targetEnvironment || project.targetEngine === 'not_selected') {
    return [
      detailRow('Target Selection', statusBadge('Not Required For Assessment', 'idle')),
      detailRow('Recommended Timing', 'After source assessment and sizing'),
      detailRow('Decision Needed', 'PostgreSQL flavor, hosting model, HA/DR, extensions'),
      detailRow('Next Step', 'Create target connection when conversion or load is approved')
    ];
  }

  return [
    detailRow('Engine', target.engineVersion || 'PostgreSQL'),
    detailRow('Host', target.host || '-', 'mono'),
    detailRow('Schemas', nullableNumber(target.schemas)),
    detailRow('Tables Deployed', target.tablesDeployed != null ? `${target.tablesDeployed}` : '-'),
    detailRow('Code Deployed', target.codeDeployed != null ? `${target.codeDeployed}` : '-'),
    detailRow('Data Loaded', `${Number(project.dataMigratedTb || 0).toFixed(1)} TB`),
    detailRow('Status', statusBadge(humanizeStatus(target.status), statusTone(target.status)))
  ];
}

function buildSummaryRows(payload) {
  const project = payload.project || {};
  const summary = payload.summary || {};
  const owner = payload.owner || {};
  return [
    detailRow('Mode', summary.modeLabel || humanizeMode(project.engagementMode)),
    detailRow('Started', formatDateTime(summary.startedAt)),
    detailRow('Current Phase', statusBadge(summary.activeStageLabel || humanizeStage(project.pipelineStage), 'running')),
    detailRow('Progress', `${Number(summary.completionPct || 0)}%`),
    detailRow('Open Issues', `${Number(summary.criticalIssues || 0)} Critical · ${Number(summary.warningIssues || 0)} Warning`),
    detailRow('Auto-Convert Rate', `${Number(project.conversionRatePct || 0)}%`),
    detailRow('Owner', owner.displayName || owner.email || 'Unassigned')
  ];
}

function renderProjectAgents(agents) {
  const body = document.getElementById('projectAgentsBody');
  if (!body) return;

  if (!agents.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state small">No project agents have reported in yet.</td></tr>';
    return;
  }

  body.innerHTML = agents
    .map(
      (agent) => `
        <tr>
          <td class="mono">${escapeHtml(agent.agentName || agent.agentId || 'unknown')}</td>
          <td>${escapeHtml([agent.runtimeMode, agent.platformType].filter(Boolean).join(' · ') || '-')}</td>
          <td>${statusBadge(humanizeStatus(agent.status), statusTone(agent.status))}</td>
          <td>${escapeHtml(formatHeartbeat(agent.lastHeartbeatAt))}</td>
        </tr>
      `
    )
    .join('');
}

function renderProjectJobs(jobs, agents) {
  const body = document.getElementById('projectJobsBody');
  if (!body) return;

  if (!jobs.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state small">No jobs exist for this project yet.</td></tr>';
    return;
  }

  const agentById = new Map(agents.map((agent) => [agent.agentId, agent]));
  body.innerHTML = jobs
    .map((job) => {
      const agent = job.leasedToAgentId ? agentById.get(job.leasedToAgentId) : null;
      return `
        <tr>
          <td class="mono">${escapeHtml(job.jobType || 'unknown_job')}</td>
          <td>${escapeHtml(humanizeCapability(job.capabilityRequired))}</td>
          <td>${statusBadge(humanizeStatus(job.status), statusTone(job.status))}</td>
          <td>${escapeHtml(agent?.agentName || '-')}</td>
          <td>${Number(job.attemptCount || 0)} / ${Number(job.maxAttempts || 0)}</td>
        </tr>
      `;
    })
    .join('');
}

function detailRow(label, value, extraClass = '') {
  return `
    <div class="detail-row">
      <span>${escapeHtml(label)}</span>
      <span class="detail-value${extraClass ? ` ${extraClass}` : ''}">${typeof value === 'string' ? value : escapeHtml(String(value ?? '-'))}</span>
    </div>
  `;
}

function statusBadge(label, tone) {
  return `<span class="status-badge ${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function pipelineProgressPct(stage) {
  const order = ['connectivity', 'discovery', 'assessment', 'conversion', 'deployment', 'data_load', 'cdc', 'validation', 'cutover'];
  const normalized = normalizeStage(stage);
  const index = order.indexOf(normalized);
  if (index === -1) return 0;
  return Math.round(((index + 1) / order.length) * 100);
}

function normalizeStage(stage) {
  switch ((stage || '').toLowerCase()) {
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

function humanizeStage(stage) {
  const normalized = normalizeStage(stage);
  return (
    {
      connectivity: 'Connect',
      discovery: 'Discover',
      assessment: 'Assess',
      conversion: 'Convert',
      deployment: 'Deploy',
      data_load: 'Full Load',
      cdc: 'CDC',
      validation: 'Validate',
      cutover: 'Cutover'
    }[normalized] || 'Discover'
  );
}

function humanizeMode(mode) {
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

function engineBadgeLabel(engine) {
  switch ((engine || '').toLowerCase()) {
    case 'oracle':
      return 'Oracle';
    case 'postgresql':
      return 'PostgreSQL';
    case 'not_selected':
    case 'target_tbd':
    case 'tbd':
      return 'Target TBD';
    default:
      return engine || 'Unknown';
  }
}

function humanizeStatus(status) {
  return (status || 'unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeCapability(capability) {
  return humanizeStatus(capability);
}

function statusTone(status) {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'healthy':
    case 'succeeded':
    case 'completed':
      return 'completed';
    case 'running':
    case 'leased':
    case 'in_progress':
      return 'running';
    case 'queued':
    case 'pending':
    case 'assessment':
      return 'pending';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return 'idle';
  }
}

function formatCompactNumber(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(numeric);
}

function nullableNumber(value) {
  if (value == null) return '-';
  return Number(value).toLocaleString();
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function formatUpdatedAt(value) {
  if (!value) return 'Updated recently';

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Updated ${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `Updated ${diffDays}d ago`;
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatHeartbeat(value) {
  if (!value) return 'No heartbeat yet';
  return formatUpdatedAt(value).replace('Updated ', '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function completedStageIcon() {
  return '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
}

function activeStageIcon(stageKey) {
  if (stageKey === 'connectivity') {
    return '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h2a2 2 0 012 2v2h2V4a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2v4h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2h-2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 012-2h2V8H6a2 2 0 01-2-2V4zm4 10H6v2h2v-2zm6 0h-2v2h2v-2zM8 4H6v2h2V4zm6 0h-2v2h2V4z" clip-rule="evenodd"/></svg>';
  }
  if (stageKey === 'data_load') {
    return '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"/></svg>';
  }
  if (stageKey === 'cdc') {
    return '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clip-rule="evenodd"/></svg>';
  }
  return '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
}

function pendingStageIcon(stageKey) {
  if (stageKey === 'connectivity') {
    return '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" opacity="0.4"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h2a2 2 0 012 2v2h2V4a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2v4h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2h-2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 012-2h2V8H6a2 2 0 01-2-2V4zm4 10H6v2h2v-2zm6 0h-2v2h2v-2zM8 4H6v2h2V4zm6 0h-2v2h2V4z" clip-rule="evenodd"/></svg>';
  }
  if (stageKey === 'cdc') {
    return '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" opacity="0.4"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clip-rule="evenodd"/></svg>';
  }
  if (stageKey === 'cutover') {
    return '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" opacity="0.4"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>';
  }
  return '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" opacity="0.4"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
}

// ---- Animated Counters ----
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  counters.forEach(counter => {
    const target = parseInt(counter.dataset.count, 10);
    animateCounter(counter, target);
  });
}

function animateCounter(el, target) {
  const duration = 1500;
  const start = performance.now();
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const value = Math.round(easeOut(progress) * target);
    el.textContent = value.toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ---- Object Tree Toggle ----
function toggleTree(headerEl) {
  const node = headerEl.closest('.tree-node');
  if (node) {
    node.classList.toggle('expanded');
  }
}

// ---- Select Object (Schema Converter) ----
const objectData = {
  'ACCOUNTS': {
    source: `<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">FINANCE_CORE</span>.<span class="obj">ACCOUNTS</span> (
    <span class="col">ACCOUNT_ID</span>      <span class="typ">NUMBER</span>(12)        <span class="kw">NOT NULL</span>,
    <span class="col">ACCOUNT_CODE</span>    <span class="typ">VARCHAR2</span>(20)      <span class="kw">NOT NULL</span>,
    <span class="col">ACCOUNT_NAME</span>    <span class="typ">VARCHAR2</span>(200),
    <span class="col">ACCOUNT_TYPE</span>    <span class="typ">VARCHAR2</span>(30)      <span class="kw">DEFAULT</span> <span class="str">'GENERAL'</span>,
    <span class="col">PARENT_ID</span>       <span class="typ">NUMBER</span>(12),
    <span class="col">CURRENCY_CODE</span>   <span class="typ">CHAR</span>(3)           <span class="kw">DEFAULT</span> <span class="str">'USD'</span>,
    <span class="col">BALANCE</span>         <span class="typ">NUMBER</span>(18,4),
    <span class="col">IS_ACTIVE</span>       <span class="typ">NUMBER</span>(1)         <span class="kw">DEFAULT</span> 1,
    <span class="col">CREATED_DATE</span>    <span class="typ">DATE</span>              <span class="kw">DEFAULT</span> <span class="fn">SYSDATE</span>,
    <span class="col">MODIFIED_DATE</span>   <span class="typ">DATE</span>,
    <span class="col">MODIFIED_BY</span>     <span class="typ">VARCHAR2</span>(60),
    <span class="col">REMARKS</span>         <span class="typ">CLOB</span>,
    <span class="kw">CONSTRAINT</span> <span class="obj">PK_ACCOUNTS</span> <span class="kw">PRIMARY KEY</span> (<span class="col">ACCOUNT_ID</span>),
    <span class="kw">CONSTRAINT</span> <span class="obj">FK_ACCT_PARENT</span> <span class="kw">FOREIGN KEY</span> (<span class="col">PARENT_ID</span>)
        <span class="kw">REFERENCES</span> <span class="obj">ACCOUNTS</span>(<span class="col">ACCOUNT_ID</span>),
    <span class="kw">CONSTRAINT</span> <span class="obj">CHK_ACCT_TYPE</span> <span class="kw">CHECK</span> (
        <span class="col">ACCOUNT_TYPE</span> <span class="kw">IN</span> (<span class="str">'GENERAL'</span>,<span class="str">'ASSET'</span>,<span class="str">'LIABILITY'</span>,<span class="str">'EQUITY'</span>,<span class="str">'REVENUE'</span>,<span class="str">'EXPENSE'</span>)
    )
)
<span class="kw">TABLESPACE</span> <span class="obj">FIN_DATA</span>
<span class="kw">STORAGE</span> (<span class="kw">INITIAL</span> 1M <span class="kw">NEXT</span> 1M)
<span class="kw">LOGGING</span>;`,
    target: `<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">finance_core</span>.<span class="obj">accounts</span> (
    <span class="col">account_id</span>      <span class="typ">BIGINT</span>            <span class="kw">NOT NULL</span>,
    <span class="col">account_code</span>    <span class="typ">VARCHAR</span>(20)       <span class="kw">NOT NULL</span>,
    <span class="col">account_name</span>    <span class="typ">VARCHAR</span>(200),
    <span class="col">account_type</span>    <span class="typ">VARCHAR</span>(30)       <span class="kw">DEFAULT</span> <span class="str">'GENERAL'</span>,
    <span class="col">parent_id</span>       <span class="typ">BIGINT</span>,
    <span class="col">currency_code</span>   <span class="typ">CHAR</span>(3)           <span class="kw">DEFAULT</span> <span class="str">'USD'</span>,
    <span class="col">balance</span>         <span class="typ">NUMERIC</span>(18,4),
    <span class="col">is_active</span>       <span class="typ">BOOLEAN</span>           <span class="kw">DEFAULT</span> <span class="lit">TRUE</span>,  <span class="cmt">-- ⚡ NUMBER(1) → BOOLEAN</span>
    <span class="col">created_date</span>    <span class="typ">TIMESTAMPTZ</span>       <span class="kw">DEFAULT</span> <span class="fn">NOW</span>(), <span class="cmt">-- ⚡ DATE+SYSDATE → TIMESTAMPTZ+NOW()</span>
    <span class="col">modified_date</span>   <span class="typ">TIMESTAMPTZ</span>,
    <span class="col">modified_by</span>     <span class="typ">VARCHAR</span>(60),
    <span class="col">remarks</span>         <span class="typ">TEXT</span>,             <span class="cmt">-- ⚡ CLOB → TEXT</span>
    <span class="kw">CONSTRAINT</span> <span class="obj">pk_accounts</span> <span class="kw">PRIMARY KEY</span> (<span class="col">account_id</span>),
    <span class="kw">CONSTRAINT</span> <span class="obj">fk_acct_parent</span> <span class="kw">FOREIGN KEY</span> (<span class="col">parent_id</span>)
        <span class="kw">REFERENCES</span> <span class="obj">accounts</span>(<span class="col">account_id</span>),
    <span class="kw">CONSTRAINT</span> <span class="obj">chk_acct_type</span> <span class="kw">CHECK</span> (
        <span class="col">account_type</span> <span class="kw">IN</span> (<span class="str">'GENERAL'</span>,<span class="str">'ASSET'</span>,<span class="str">'LIABILITY'</span>,<span class="str">'EQUITY'</span>,<span class="str">'REVENUE'</span>,<span class="str">'EXPENSE'</span>)
    )
);
<span class="cmt">-- ⚡ TABLESPACE/STORAGE clauses removed (PG-managed)</span>
<span class="cmt">-- ⚡ 4 rules applied · Confidence: HIGH</span>`
  },
  'TRANSACTIONS': {
    source: `<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">FINANCE_CORE</span>.<span class="obj">TRANSACTIONS</span> (
    <span class="col">TXN_ID</span>          <span class="typ">NUMBER</span>(18)        <span class="kw">NOT NULL</span>,
    <span class="col">ACCOUNT_ID</span>      <span class="typ">NUMBER</span>(12)        <span class="kw">NOT NULL</span>,
    <span class="col">TXN_DATE</span>        <span class="typ">DATE</span>              <span class="kw">NOT NULL</span>,
    <span class="col">AMOUNT</span>          <span class="typ">NUMBER</span>(38,10),
    <span class="col">CURRENCY</span>        <span class="typ">CHAR</span>(3)           <span class="kw">DEFAULT</span> <span class="str">'USD'</span>,
    <span class="col">DESCRIPTION</span>     <span class="typ">VARCHAR2</span>(4000),
    <span class="col">STATUS</span>          <span class="typ">VARCHAR2</span>(20)      <span class="kw">DEFAULT</span> <span class="str">'PENDING'</span>,
    <span class="col">CREATED_BY</span>      <span class="typ">VARCHAR2</span>(60),
    <span class="col">CREATED_DATE</span>    <span class="typ">DATE</span>              <span class="kw">DEFAULT</span> <span class="fn">SYSDATE</span>,
    <span class="kw">CONSTRAINT</span> <span class="obj">PK_TXN</span> <span class="kw">PRIMARY KEY</span> (<span class="col">TXN_ID</span>),
    <span class="kw">CONSTRAINT</span> <span class="obj">FK_TXN_ACCT</span> <span class="kw">FOREIGN KEY</span> (<span class="col">ACCOUNT_ID</span>)
        <span class="kw">REFERENCES</span> <span class="obj">ACCOUNTS</span>(<span class="col">ACCOUNT_ID</span>)
)
<span class="kw">PARTITION BY RANGE</span> (<span class="col">TXN_DATE</span>)
(
    <span class="kw">PARTITION</span> <span class="obj">P_2024</span> <span class="kw">VALUES LESS THAN</span> (<span class="fn">TO_DATE</span>(<span class="str">'2025-01-01'</span>,<span class="str">'YYYY-MM-DD'</span>)),
    <span class="kw">PARTITION</span> <span class="obj">P_2025</span> <span class="kw">VALUES LESS THAN</span> (<span class="fn">TO_DATE</span>(<span class="str">'2026-01-01'</span>,<span class="str">'YYYY-MM-DD'</span>)),
    <span class="kw">PARTITION</span> <span class="obj">P_MAX</span>  <span class="kw">VALUES LESS THAN</span> (<span class="fn">MAXVALUE</span>)
)
<span class="kw">TABLESPACE</span> <span class="obj">FIN_DATA</span>;`,
    target: `<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">finance_core</span>.<span class="obj">transactions</span> (
    <span class="col">txn_id</span>          <span class="typ">BIGINT</span>            <span class="kw">NOT NULL</span>,
    <span class="col">account_id</span>      <span class="typ">BIGINT</span>            <span class="kw">NOT NULL</span>,
    <span class="col">txn_date</span>        <span class="typ">TIMESTAMPTZ</span>       <span class="kw">NOT NULL</span>,
    <span class="col">amount</span>          <span class="typ">NUMERIC</span>(38,10),   <span class="cmt">-- ⚠ Verify precision requirements</span>
    <span class="col">currency</span>        <span class="typ">CHAR</span>(3)           <span class="kw">DEFAULT</span> <span class="str">'USD'</span>,
    <span class="col">description</span>     <span class="typ">VARCHAR</span>(4000),
    <span class="col">status</span>          <span class="typ">VARCHAR</span>(20)       <span class="kw">DEFAULT</span> <span class="str">'PENDING'</span>,
    <span class="col">created_by</span>      <span class="typ">VARCHAR</span>(60),
    <span class="col">created_date</span>    <span class="typ">TIMESTAMPTZ</span>       <span class="kw">DEFAULT</span> <span class="fn">NOW</span>(),
    <span class="kw">CONSTRAINT</span> <span class="obj">pk_txn</span> <span class="kw">PRIMARY KEY</span> (<span class="col">txn_id</span>),
    <span class="kw">CONSTRAINT</span> <span class="obj">fk_txn_acct</span> <span class="kw">FOREIGN KEY</span> (<span class="col">account_id</span>)
        <span class="kw">REFERENCES</span> <span class="obj">accounts</span>(<span class="col">account_id</span>)
) <span class="kw">PARTITION BY RANGE</span> (<span class="col">txn_date</span>);

<span class="cmt">-- ⚡ Partitions converted to PG declarative partitioning</span>
<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">transactions_p_2024</span> <span class="kw">PARTITION OF</span> <span class="obj">transactions</span>
    <span class="kw">FOR VALUES FROM</span> (<span class="str">'2024-01-01'</span>) <span class="kw">TO</span> (<span class="str">'2025-01-01'</span>);
<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">transactions_p_2025</span> <span class="kw">PARTITION OF</span> <span class="obj">transactions</span>
    <span class="kw">FOR VALUES FROM</span> (<span class="str">'2025-01-01'</span>) <span class="kw">TO</span> (<span class="str">'2026-01-01'</span>);
<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">transactions_p_default</span> <span class="kw">PARTITION OF</span> <span class="obj">transactions</span>
    <span class="kw">DEFAULT</span>;
<span class="cmt">-- ⚡ 6 rules applied · Confidence: MEDIUM (review partition strategy)</span>`
  },
  'PKG_FINANCE': {
    source: `<span class="kw">CREATE OR REPLACE</span> <span class="kw">PACKAGE BODY</span> <span class="obj">FINANCE_CORE</span>.<span class="obj">PKG_FINANCE</span> <span class="kw">AS</span>

  <span class="kw">FUNCTION</span> <span class="fn">CALC_REVENUE</span>(
    <span class="col">p_account_id</span>  <span class="kw">IN</span> <span class="typ">NUMBER</span>,
    <span class="col">p_start_date</span>  <span class="kw">IN</span> <span class="typ">DATE</span>,
    <span class="col">p_end_date</span>    <span class="kw">IN</span> <span class="typ">DATE</span>
  ) <span class="kw">RETURN</span> <span class="typ">NUMBER</span> <span class="kw">IS</span>
    <span class="col">v_total</span>  <span class="typ">NUMBER</span>(18,4) := 0;
    <span class="col">v_depth</span>  <span class="typ">NUMBER</span> := 0;
  <span class="kw">BEGIN</span>
    <span class="cmt">-- Hierarchical revenue rollup</span>
    <span class="kw">FOR</span> rec <span class="kw">IN</span> (
      <span class="kw">SELECT</span> <span class="col">account_id</span>, <span class="col">balance</span>, <span class="fn">LEVEL</span> <span class="kw">AS</span> <span class="col">depth</span>
      <span class="kw">FROM</span> <span class="obj">accounts</span>
      <span class="kw">START WITH</span> <span class="col">account_id</span> = <span class="col">p_account_id</span>
      <span class="kw">CONNECT BY PRIOR</span> <span class="col">account_id</span> = <span class="col">parent_id</span>
    ) <span class="kw">LOOP</span>
      <span class="col">v_total</span> := <span class="col">v_total</span> + <span class="fn">NVL</span>(rec.<span class="col">balance</span>, 0);
    <span class="kw">END LOOP</span>;

    <span class="kw">RETURN</span> <span class="col">v_total</span>;
  <span class="kw">END</span> <span class="fn">CALC_REVENUE</span>;

<span class="kw">END</span> <span class="obj">PKG_FINANCE</span>;`,
    target: `<span class="cmt">-- ⚠ MANUAL REVIEW REQUIRED</span>
<span class="cmt">-- CONNECT BY PRIOR → WITH RECURSIVE CTE</span>
<span class="cmt">-- Oracle PACKAGE → PostgreSQL separate functions</span>

<span class="kw">CREATE OR REPLACE FUNCTION</span> <span class="obj">finance_core</span>.<span class="fn">calc_revenue</span>(
    <span class="col">p_account_id</span>  <span class="typ">BIGINT</span>,
    <span class="col">p_start_date</span>  <span class="typ">TIMESTAMPTZ</span>,
    <span class="col">p_end_date</span>    <span class="typ">TIMESTAMPTZ</span>
) <span class="kw">RETURNS</span> <span class="typ">NUMERIC</span>(18,4) <span class="kw">AS</span> $$
<span class="kw">DECLARE</span>
    <span class="col">v_total</span>  <span class="typ">NUMERIC</span>(18,4) := 0;
    <span class="col">rec</span>      <span class="typ">RECORD</span>;
<span class="kw">BEGIN</span>
    <span class="cmt">-- ⚡ Converted: CONNECT BY → WITH RECURSIVE</span>
    <span class="kw">FOR</span> rec <span class="kw">IN</span> (
        <span class="kw">WITH RECURSIVE</span> <span class="obj">acct_tree</span> <span class="kw">AS</span> (
            <span class="kw">SELECT</span> <span class="col">account_id</span>, <span class="col">balance</span>, 1 <span class="kw">AS</span> <span class="col">depth</span>
            <span class="kw">FROM</span> <span class="obj">accounts</span>
            <span class="kw">WHERE</span> <span class="col">account_id</span> = <span class="col">p_account_id</span>
            <span class="kw">UNION ALL</span>
            <span class="kw">SELECT</span> a.<span class="col">account_id</span>, a.<span class="col">balance</span>, t.<span class="col">depth</span> + 1
            <span class="kw">FROM</span> <span class="obj">accounts</span> a
            <span class="kw">JOIN</span> <span class="obj">acct_tree</span> t <span class="kw">ON</span> a.<span class="col">parent_id</span> = t.<span class="col">account_id</span>
        )
        <span class="kw">SELECT</span> <span class="col">account_id</span>, <span class="col">balance</span>, <span class="col">depth</span> <span class="kw">FROM</span> <span class="obj">acct_tree</span>
    ) <span class="kw">LOOP</span>
        <span class="col">v_total</span> := <span class="col">v_total</span> + <span class="fn">COALESCE</span>(rec.<span class="col">balance</span>, 0);
    <span class="kw">END LOOP</span>;

    <span class="kw">RETURN</span> <span class="col">v_total</span>;
<span class="kw">END</span>;
$$ <span class="kw">LANGUAGE</span> plpgsql;
<span class="cmt">-- ⚡ 3 rules applied · Confidence: MEDIUM (verify recursion depth)</span>`
  }
};

function selectObject(leafEl, type, name) {
  // Update selected state
  document.querySelectorAll('.tree-leaf').forEach(l => l.classList.remove('selected'));
  leafEl.classList.add('selected');

  // Update code panels
  const data = objectData[name];
  if (data) {
    const sourceEl = document.querySelector('#sourceCode code');
    const targetEl = document.querySelector('#targetCode code');
    if (sourceEl) sourceEl.innerHTML = data.source;
    if (targetEl) targetEl.innerHTML = data.target;
  }
}

// ---- Sparkline ----
function initSparkline() {
  const container = document.getElementById('sparkline');
  if (!container) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 32');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.width = '100%';
  svg.style.height = '100%';

  const values = [180, 210, 195, 240, 220, 255, 245, 260, 235, 248, 242, 250, 245];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 120;
    const y = 30 - ((v - min) / range) * 26;
    return `${x},${y}`;
  });

  const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  areaPath.setAttribute('d', `M0,${30 - ((values[0] - min) / range) * 26} L${points.join(' L')} L120,32 L0,32 Z`);
  areaPath.setAttribute('fill', 'url(#sparkGrad)');

  const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  linePath.setAttribute('d', `M${points.join(' L')}`);
  linePath.setAttribute('fill', 'none');
  linePath.setAttribute('stroke', '#06b6d4');
  linePath.setAttribute('stroke-width', '1.5');

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'sparkGrad');
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', '1');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s1.setAttribute('offset', '0%');
  s1.setAttribute('stop-color', '#06b6d4');
  s1.setAttribute('stop-opacity', '0.2');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s2.setAttribute('offset', '100%');
  s2.setAttribute('stop-color', '#06b6d4');
  s2.setAttribute('stop-opacity', '0');
  grad.appendChild(s1);
  grad.appendChild(s2);
  defs.appendChild(grad);

  svg.appendChild(defs);
  svg.appendChild(areaPath);
  svg.appendChild(linePath);
  container.appendChild(svg);
}

// ---- Modal ----
function initModalHandlers() {
  const openButtons = document.querySelectorAll('[data-open-modal="new-project"]');
  const connectionButtons = document.querySelectorAll('[data-open-modal="database-connection"]');
  const overlay = document.getElementById('modalOverlay');
  const connectionOverlay = document.getElementById('connectionModalOverlay');

  openButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (overlay) overlay.classList.add('visible');
    });
  });

  connectionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (connectionOverlay) connectionOverlay.classList.add('visible');
    });
  });

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  if (connectionOverlay) {
    connectionOverlay.addEventListener('click', (e) => {
      if (e.target === connectionOverlay) closeConnectionModal();
    });
  }

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeConnectionModal();
    }
  });
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.classList.remove('visible');
}

function closeConnectionModal() {
  const overlay = document.getElementById('connectionModalOverlay');
  if (overlay) overlay.classList.remove('visible');
}

// ---- Filter Handlers ----
function initFilterHandlers() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.dataset.projectFilter) {
        appState.activeProjectFilter = btn.dataset.projectFilter;
        renderDashboardProjects(appState.dashboard?.projects || []);
      }
    });
  });

  const treeSearch = document.getElementById('treeSearch');
  if (treeSearch) {
    treeSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const leaves = document.querySelectorAll('.tree-leaf');
      leaves.forEach(leaf => {
        const name = leaf.dataset.obj || leaf.textContent;
        leaf.style.display = name.toLowerCase().includes(query) || query === '' ? '' : 'none';
      });
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.focus();
    }
  });
}

// ---- Simulated Live Updates ----
// Periodically update CDC lag for realism
setInterval(() => {
  const lagEl = document.querySelector('.cdc-metric-value');
  if (lagEl && lagEl.textContent.includes('s')) {
    const newLag = (1.5 + Math.random() * 2).toFixed(1);
    lagEl.textContent = `${newLag}s`;
  }

  const eventsEl = document.querySelectorAll('.cdc-metric-value')[1];
  if (eventsEl) {
    const newEvents = Math.floor(13000 + Math.random() * 4000).toLocaleString();
    eventsEl.textContent = newEvents;
  }
}, 3000);
