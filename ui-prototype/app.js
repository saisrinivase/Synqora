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
  services: 'Services',
  project: 'Project Pipeline',
  assessment: 'Assessment',
  converter: 'Schema Converter',
  dataload: 'Data Load',
  cdc: 'CDC / Replication',
  validation: 'Validation',
  cutover: 'Cutover Control'
};

const THEME_STORAGE_KEY = 'synqora-theme';

initTheme();

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggleHandlers();
  initNavigation();
  initCounters();
  initSparkline();
  initModalHandlers();
  initFilterHandlers();
  initActiveProjectsCardHandler();
  initProjectCardHandlers();
  initServiceCardHandlers();
  initAuthHandlers();
  await initAuthSession();
});

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = savedTheme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  updateThemeToggleLabels(theme);
}

function initThemeToggleHandlers() {
  const toggles = document.querySelectorAll('[data-theme-toggle]');
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      updateThemeToggleLabels(nextTheme);
    });
  });
  updateThemeToggleLabels(document.documentElement.dataset.theme || 'light');
}

function updateThemeToggleLabels(theme) {
  const toggles = document.querySelectorAll('[data-theme-toggle]');
  toggles.forEach((toggle) => {
    toggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  });
}

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
    showStartupNetworkError(error);
    console.warn('Synqora session bootstrap failed:', error);
  }

  setLoggedOutView();
}

function initAuthHandlers() {
  const authOpenButtons = document.querySelectorAll('[data-open-auth]');
  authOpenButtons.forEach((button) => {
    button.addEventListener('click', () => openAuthPanel(button.dataset.openAuth || 'signin'));
  });

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
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'same-origin'
        });
      } catch (error) {
        console.warn(formatNetworkError(error));
      }
      appState.session = null;
      appState.dashboard = null;
      appState.selectedProjectId = null;
      appState.selectedProjectOverview = null;
      setLoggedOutView();
    });
  }

  const loginShell = document.getElementById('loginShell');
  if (loginShell) {
    loginShell.addEventListener('click', (event) => {
      if (event.target === loginShell) {
        closeAuthPanel();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      document.body.classList.contains('auth-open') &&
      !document.body.classList.contains('authenticated')
    ) {
      closeAuthPanel();
    }
  });
}

function openAuthPanel(mode = 'signin') {
  document.body.classList.add('auth-open');
  setAuthMode(mode);

  window.setTimeout(() => {
    const focusTarget = mode === 'signup'
      ? document.getElementById('signupEmail')
      : document.getElementById('loginEmail');
    if (focusTarget) focusTarget.focus();
  }, 80);
}

function closeAuthPanel() {
  if (document.body.classList.contains('authenticated')) return;
  document.body.classList.remove('auth-open');
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
    const response = await safeFetch('/api/v1/auth/login', {
      method: 'POST',
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
    const response = await safeFetch('/api/v1/auth/signup', {
      method: 'POST',
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
  document.body.classList.remove('auth-pending', 'auth-open');
  document.body.classList.add('authenticated');
  renderSessionIdentity(payload);
}

function setLoggedOutView() {
  document.body.classList.remove('authenticated');
  document.body.classList.remove('auth-open');
  document.body.classList.add('auth-pending');
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
  const response = await safeFetch(path, options);

  if (response.status === 401) {
    setLoggedOutView();
  }

  return response;
}

async function safeFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin'
    });
  } catch (error) {
    throw new Error(formatNetworkError(error));
  }

  return response;
}

function formatNetworkError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  if (rawMessage.includes('NetworkError') || rawMessage.includes('Failed to fetch') || rawMessage.includes('Load failed')) {
    return 'Synqora API is not reachable. Start the local server with npm run legacy:start:cloud and reload http://127.0.0.1:8787/.';
  }
  return rawMessage || 'Synqora API request failed.';
}

function showStartupNetworkError(error) {
  const message = formatNetworkError(error);
  const loginError = document.getElementById('loginError');
  const providerMessage = document.getElementById('providerMessage');
  if (loginError) loginError.textContent = message;
  if (providerMessage) providerMessage.textContent = message;
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
    renderConnectionProjectOptions(payload.projects || []);
    renderWorkspaceLabels(payload.tenant || {});
    renderDashboardEvidence(payload);
    renderServicesConsole(payload);

    const projects = payload.projects || [];
    const selectedProjectStillVisible = projects.some((project) => project.projectId === appState.selectedProjectId);
    const defaultProjectId = selectedProjectStillVisible ? appState.selectedProjectId : projects[0]?.projectId;
    if (defaultProjectId) {
      await loadProjectOverview(defaultProjectId);
    } else {
      appState.selectedProjectId = null;
      appState.selectedProjectOverview = null;
      renderLifecycleReadiness();
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
    renderLifecycleReadiness();

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

function initActiveProjectsCardHandler() {
  const card = document.getElementById('activeProjectsCard');
  const projectSection = document.getElementById('tenantProjectsSection');
  if (!card || !projectSection) return;

  const openTenantProjects = () => {
    setActiveView('dashboard');
    projectSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  card.addEventListener('click', openTenantProjects);
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openTenantProjects();
  });
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

function initServiceCardHandlers() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;

  grid.addEventListener('click', (event) => {
    const card = event.target.closest('.service-card[data-service-view]');
    if (!card) return;
    const view = card.dataset.serviceView;
    if (view) setActiveView(view);
  });
}

function renderDashboardProjects(projects) {
  const grid = document.getElementById('projectGrid');
  if (!grid) return;

  const visibleProjects = projects.filter((project) => projectMatchesFilter(project, appState.activeProjectFilter));

  if (visibleProjects.length === 0) {
    grid.innerHTML = '<div class="glass-card empty-state">No migration projects yet. Create a project, then attach an Oracle source connection to start assessment.</div>';
    return;
  }

  grid.innerHTML = visibleProjects.map(createProjectCardMarkup).join('');
}

function renderConnectionProjectOptions(projects) {
  const select = document.getElementById('connectionProjectSelect');
  if (!select) return;

  if (!projects.length) {
    select.innerHTML = '<option value="">Create a project first</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = projects
    .map((project) => `<option value="${escapeHtml(project.projectId)}">${escapeHtml(project.projectCode || project.name)} - ${escapeHtml(project.name || 'Project')}</option>`)
    .join('');

  if (appState.selectedProjectId && projects.some((project) => project.projectId === appState.selectedProjectId)) {
    select.value = appState.selectedProjectId;
  }
}

function renderWorkspaceLabels(tenant) {
  const projectOrg = document.getElementById('projectOrganization');
  if (projectOrg) {
    projectOrg.value = tenant.name || 'Synqora Tenant';
  }
}

function renderDashboardEvidence(payload) {
  const summary = payload.summary || {};
  const projects = payload.projects || [];
  const jobs = payload.jobs || [];

  setStatTrend('activeProjectsTrend', projects.length ? `${projects.length} active workspace item${projects.length === 1 ? '' : 's'}` : 'No projects yet', projects.length ? 'up' : 'idle');
  setStatTrend('objectsDiscoveredTrend', summary.discoveredObjects > 0 ? 'Discovery evidence collected' : 'Awaiting discovery', summary.discoveredObjects > 0 ? 'up' : 'idle');
  setStatTrend('conversionRateTrend', summary.averageConversionRatePct > 0 ? 'Conversion evidence available' : 'No conversion run', summary.averageConversionRatePct > 0 ? 'up' : 'idle');
  setStatTrend('dataMigratedTrend', summary.dataMigratedTb > 0 ? 'Load activity recorded' : 'No load started', summary.dataMigratedTb > 0 ? 'up' : 'idle');

  renderActivityFeed(projects, jobs);
  renderRiskHeatmap(projects);
}

function renderServicesConsole(payload) {
  const summary = payload.summary || {};
  const projects = payload.projects || [];
  const jobs = payload.jobs || [];
  const connections = payload.connections || [];

  setText('serviceDatabaseCount', String(summary.databaseConnections ?? connections.length));
  setText('serviceProjectCount', String(summary.activeProjects ?? projects.length));
  setText('serviceJobCount', String(summary.queuedJobs ?? jobs.filter((job) => job.status === 'queued').length));

  const serviceCards = [
    {
      name: 'Database Connections',
      description: 'Reusable Oracle and PostgreSQL endpoints under this tenant.',
      metric: `${connections.length} endpoints`,
      action: 'Create / troubleshoot',
      view: 'services'
    },
    {
      name: 'Migration Projects',
      description: 'Business wrappers for assessment, conversion, load, CDC, validation, and cutover.',
      metric: `${projects.length} projects`,
      action: 'Open portfolio',
      view: 'dashboard'
    },
    {
      name: 'Agents & Connectivity',
      description: 'Customer-side execution plane for network checks, secrets, discovery, and validation.',
      metric: `${summary.registeredAgents || 0} agents`,
      action: 'Review agent readiness',
      view: 'services'
    },
    {
      name: 'Assessment',
      description: 'Oracle source discovery, migration risk detection, and evidence snapshots.',
      metric: `${jobs.filter((job) => job.jobType?.includes('assessment') || job.jobType?.includes('discover')).length} jobs`,
      action: 'Open assessment',
      view: 'assessment'
    },
    {
      name: 'Schema Conversion',
      description: 'Datatype, DDL, PL/SQL, trigger, sequence, and partition conversion workflow.',
      metric: `${summary.averageConversionRatePct || 0}% converted`,
      action: 'Open converter',
      view: 'converter'
    },
    {
      name: 'Data Load & CDC',
      description: 'Full-load chunking, replication readiness, lag tracking, and retry evidence.',
      metric: `${summary.dataMigratedTb || 0} TB`,
      action: 'Open load plan',
      view: 'dataload'
    },
    {
      name: 'Validation',
      description: 'Schema, code, row-count, checksum, and business-rule comparison reports.',
      metric: `${jobs.filter((job) => job.jobType?.includes('validation')).length} checks`,
      action: 'Open validation',
      view: 'validation'
    },
    {
      name: 'Evidence & Audit',
      description: 'Issue history, rule decisions, approval trail, cutover gates, and remediation notes.',
      metric: `${jobs.length} events`,
      action: 'Open cutover control',
      view: 'cutover'
    }
  ];

  const grid = document.getElementById('servicesGrid');
  if (grid) {
    grid.innerHTML = serviceCards.map((service) => `
      <button class="service-card" type="button" data-service-view="${escapeHtml(service.view)}">
        <span>${escapeHtml(service.metric)}</span>
        <strong>${escapeHtml(service.name)}</strong>
        <p>${escapeHtml(service.description)}</p>
        <small>${escapeHtml(service.action)}</small>
      </button>
    `).join('');
  }

  const projectById = new Map(projects.map((project) => [project.projectId, project]));
  const body = document.getElementById('databaseInventoryBody');
  if (!body) return;

  if (!connections.length) {
    body.innerHTML = '<tr><td colspan="6">No database connections yet. Add an Oracle source connection to start assessment.</td></tr>';
    return;
  }

  body.innerHTML = connections.map((connection) => {
    const settings = connection.settingsJson || {};
    const project = projectById.get(connection.projectId);
    return `
      <tr>
        <td><strong>${escapeHtml(connection.environmentName || 'Database')}</strong><small>${escapeHtml(settings.engineVersion || 'Engine pending')}</small></td>
        <td>${escapeHtml(humanizeStatus(connection.environmentType || 'database'))}</td>
        <td><span class="status-badge ${escapeHtml(statusTone(connection.status))}">${escapeHtml(humanizeStatus(connection.status || 'pending'))}</span></td>
        <td>${escapeHtml(project?.projectCode || 'Unassigned')}</td>
        <td>${escapeHtml(settings.host || settings.hostName || 'Host pending')}<small>${escapeHtml(settings.serviceName || '')}</small></td>
        <td>${escapeHtml(connection.networkZone || 'Agent zone pending')}</td>
      </tr>
    `;
  }).join('');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setStatTrend(id, text, tone = 'idle') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('up', 'down', 'idle');
  el.classList.add(tone);
}

function renderActivityFeed(projects, jobs) {
  const list = document.getElementById('activityList');
  if (!list) return;

  const projectById = new Map(projects.map((project) => [project.projectId, project]));
  const items = [];

  jobs
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0))
    .slice(0, 5)
    .forEach((job) => {
      const project = projectById.get(job.projectId);
      items.push({
        icon: job.status === 'failed' ? 'amber' : 'blue',
        title: project?.projectCode || project?.name || 'Project',
        text: `${humanizeJobType(job.jobType)} is ${humanizeStatus(job.status).toLowerCase()}`,
        time: formatUpdatedAt(job.createdAt || job.updatedAt)
      });
    });

  if (!items.length && projects.length) {
    projects
      .slice()
      .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0))
      .slice(0, 5)
      .forEach((project) => {
        items.push({
          icon: project.status === 'assessment_queued' ? 'blue' : 'green',
          title: project.projectCode || project.name || 'Project',
          text: project.status === 'assessment_queued' ? 'Oracle source validation queued' : 'Project created',
          time: formatUpdatedAt(project.updatedAt || project.createdAt)
        });
      });
  }

  if (!items.length) {
    list.innerHTML = '<div class="empty-state small">No activity yet. Create a project and attach an Oracle source connection to start the audit trail.</div>';
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
        <div class="activity-item">
          <div class="activity-icon ${escapeHtml(item.icon)}">${activityIcon(item.icon)}</div>
          <div class="activity-content">
            <span class="activity-text"><strong>${escapeHtml(item.title)}</strong> - ${escapeHtml(item.text)}</span>
            <span class="activity-time">${escapeHtml(item.time)}</span>
          </div>
        </div>
      `
    )
    .join('');
}

function renderRiskHeatmap(projects) {
  const target = document.getElementById('riskHeatmapContent');
  if (!target) return;

  if (!projects.length) {
    target.innerHTML = '<div class="empty-state small">Risk scoring will appear after Oracle discovery and assessment evidence is collected.</div>';
    return;
  }

  const visibleProjects = projects.slice(0, 4);
  const dimensions = ['Schema', 'Code', 'Data', 'Performance', 'Security', 'Cutover'];
  const hasAssessmentEvidence = visibleProjects.some(
    (project) => Number(project.criticalIssues || 0) > 0 || Number(project.warningIssues || 0) > 0 || Number(project.discoveredObjects || 0) > 0
  );

  if (!hasAssessmentEvidence) {
    target.innerHTML = `
      <div class="empty-state small">Projects exist, but risk scoring is pending. Run Oracle source validation and discovery to populate this heatmap.</div>
      <div class="heatmap-legend pending-only">
        ${visibleProjects.map((project) => `<span class="heatmap-project">${escapeHtml(project.projectCode || project.name || 'Project')}</span>`).join('')}
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="heatmap-grid">
      ${dimensions
        .map(
          (dimension) => `
            <div class="heatmap-row">
              <span class="heatmap-label">${escapeHtml(dimension)}</span>
              <div class="heatmap-cells">
                ${visibleProjects.map((project) => riskCell(project, dimension)).join('')}
              </div>
            </div>
          `
        )
        .join('')}
    </div>
    <div class="heatmap-legend">
      ${visibleProjects.map((project) => `<span class="heatmap-project">${escapeHtml(project.projectCode || project.name || 'Project')}</span>`).join('')}
    </div>
  `;
}

function riskCell(project, dimension) {
  const critical = Number(project.criticalIssues || 0);
  const warning = Number(project.warningIssues || 0);
  const discovered = Number(project.discoveredObjects || 0);
  let tone = 'pending';
  let label = 'P';
  let title = 'Pending assessment evidence';

  if (discovered > 0 || critical > 0 || warning > 0) {
    if (critical > 0 || (dimension === 'Code' && warning > 10)) {
      tone = 'high';
      label = 'H';
      title = 'High';
    } else if (warning > 0 || project.pipelineStage === 'connectivity') {
      tone = 'med';
      label = 'M';
      title = 'Medium';
    } else {
      tone = 'low';
      label = 'L';
      title = 'Low';
    }
  }

  return `<div class="heatmap-cell ${tone}" title="${escapeHtml(project.projectCode || project.name || 'Project')}: ${escapeHtml(title)}">${label}</div>`;
}

function projectMatchesFilter(project, filterValue) {
  switch (filterValue) {
    case 'in_progress':
      return project.status === 'in_progress';
    case 'assessment':
      return project.status === 'assessment' || project.status === 'assessment_queued' || project.pipelineStage === 'assessment';
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

function renderLifecycleReadiness() {
  const overview = appState.selectedProjectOverview;
  const project = overview?.project;
  const source = overview?.sourceEnvironment;
  const jobs = overview?.jobs || [];

  renderProjectPipelineReadiness(project);

  const lifecycle = [
    {
      viewId: 'assessment',
      subtitle: project ? `${project.projectCode || project.name} - source assessment readiness` : 'Select a project to start Oracle assessment',
      title: 'Assessment waits for Oracle source evidence',
      ready: Boolean(project && source && Number(project.discoveredObjects || 0) > 0),
      next: project
        ? source
          ? 'An agent must validate connectivity and collect Oracle dictionary evidence before assessment results are shown.'
          : 'Attach an Oracle source connection to queue connectivity validation.'
        : 'Create a migration project, then attach an Oracle source connection.'
    },
    {
      viewId: 'converter',
      subtitle: project ? `${project.projectCode || project.name} - conversion readiness` : 'Select a project before conversion',
      title: 'Schema conversion is locked until assessment completes',
      ready: Boolean(project && Number(project.conversionRatePct || 0) > 0),
      next: 'Complete Oracle assessment, confirm datatype policy, then run conversion rules against discovered objects.'
    },
    {
      viewId: 'dataload',
      subtitle: project ? `${project.projectCode || project.name} - load readiness` : 'Select a project before data load',
      title: 'Data load requires a target and approved load plan',
      ready: Boolean(project && Number(project.dataMigratedTb || 0) > 0),
      next: 'Attach a PostgreSQL target, approve table chunking, and generate load jobs before monitoring throughput.'
    },
    {
      viewId: 'cdc',
      subtitle: project ? `${project.projectCode || project.name} - replication readiness` : 'Select a project before CDC',
      title: 'CDC is disabled until replication prerequisites are approved',
      ready: Boolean(project && normalizeStage(project.pipelineStage) === 'cdc'),
      next: 'Validate supplemental logging, source privileges, target apply schema, and rollback strategy before starting CDC.'
    },
    {
      viewId: 'validation',
      subtitle: project ? `${project.projectCode || project.name} - validation readiness` : 'Select a project before validation',
      title: 'Validation runs after schema deployment and data load',
      ready: Boolean(project && ['validation', 'cutover'].includes(normalizeStage(project.pipelineStage))),
      next: 'Run schema, row-count, checksum, semantic, and performance validations after target deployment.'
    },
    {
      viewId: 'cutover',
      subtitle: project ? `${project.projectCode || project.name} - cutover readiness` : 'Select a project before cutover',
      title: 'Cutover controls remain locked until gates pass',
      ready: Boolean(project && normalizeStage(project.pipelineStage) === 'cutover'),
      next: 'Complete validation, CDC catch-up, approvals, rollback package, and freeze confirmation before cutover.'
    }
  ];

  lifecycle.forEach((item) => {
    const view = document.getElementById(`view-${item.viewId}`);
    if (!view) return;

    const subtitle = view.querySelector('.view-subtitle');
    if (subtitle) subtitle.textContent = item.subtitle;

    const panel = ensureLifecyclePanel(view);
    const queuedJobCount = jobs.filter((job) => job.status === 'queued').length;
    const runningJobCount = jobs.filter((job) => job.status === 'running').length;
    const sourceStatus = source?.status ? humanizeStatus(source.status) : 'No source connection';

    if (item.ready) {
      view.classList.remove('stage-blocked');
      panel.hidden = true;
      return;
    }

    view.classList.add('stage-blocked');
    panel.hidden = false;
    panel.innerHTML = `
      <div class="lifecycle-state-content">
        <span class="surface-kicker">Readiness Gate</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.next)}</p>
        <div class="lifecycle-readiness-grid">
          <div><span>Project</span><strong>${escapeHtml(project?.projectCode || project?.name || 'Not created')}</strong></div>
          <div><span>Source</span><strong>${escapeHtml(sourceStatus)}</strong></div>
          <div><span>Queued Jobs</span><strong>${queuedJobCount}</strong></div>
          <div><span>Running Jobs</span><strong>${runningJobCount}</strong></div>
        </div>
      </div>
    `;
  });
}

function renderProjectPipelineReadiness(project) {
  const view = document.getElementById('view-project');
  if (!view) return;

  const panel = ensureLifecyclePanel(view);
  const title = document.getElementById('projectViewTitle');
  const subtitle = document.getElementById('projectViewSubtitle');

  if (project) {
    view.classList.remove('stage-blocked');
    panel.hidden = true;
    return;
  }

  if (title) title.textContent = 'Project Pipeline';
  if (subtitle) subtitle.textContent = 'Create or select a project to load its migration control-plane state.';

  view.classList.add('stage-blocked');
  panel.hidden = false;
  panel.innerHTML = `
    <div class="lifecycle-state-content">
      <span class="surface-kicker">Project Required</span>
      <h3>No migration project selected</h3>
      <p>Create a migration project first. A project becomes the business wrapper for Oracle source connections, assessment jobs, target planning, conversion, load, CDC, validation, and cutover evidence.</p>
      <div class="lifecycle-readiness-grid">
        <div><span>Project</span><strong>Not created</strong></div>
        <div><span>Source</span><strong>No source connection</strong></div>
        <div><span>Target</span><strong>Optional for assessment</strong></div>
        <div><span>Next Step</span><strong>New Project</strong></div>
      </div>
    </div>
  `;
}

function ensureLifecyclePanel(view) {
  let panel = view.querySelector(':scope > .lifecycle-state');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.className = 'lifecycle-state glass-card';
  const header = view.querySelector('.view-header');
  if (header?.nextSibling) {
    view.insertBefore(panel, header.nextSibling);
  } else {
    view.appendChild(panel);
  }
  return panel;
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

function humanizeJobType(jobType) {
  return humanizeStatus(jobType || 'job');
}

function activityIcon(tone) {
  const icons = {
    green: '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>',
    blue: '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"/><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"/></svg>',
    amber: '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>'
  };
  return icons[tone] || icons.blue;
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
    <span class="col">created_date</span>    <span class="typ">TIMESTAMP</span>         <span class="kw">DEFAULT</span> <span class="fn">LOCALTIMESTAMP</span>, <span class="cmt">-- ⚡ DATE+SYSDATE → TIMESTAMP+LOCALTIMESTAMP</span>
    <span class="col">modified_date</span>   <span class="typ">TIMESTAMP</span>,
    <span class="col">modified_by</span>     <span class="typ">VARCHAR</span>(60),
    <span class="col">remarks</span>         <span class="typ">TEXT</span>,             <span class="cmt">-- ⚡ CLOB → TEXT</span>
    <span class="kw">CONSTRAINT</span> <span class="obj">pk_accounts</span> <span class="kw">PRIMARY KEY</span> (<span class="col">account_id</span>),
    <span class="kw">CONSTRAINT</span> <span class="obj">fk_acct_parent</span> <span class="kw">FOREIGN KEY</span> (<span class="col">parent_id</span>)
        <span class="kw">REFERENCES</span> <span class="obj">finance_core</span>.<span class="obj">accounts</span>(<span class="col">account_id</span>),
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
    <span class="col">txn_date</span>        <span class="typ">TIMESTAMP</span>         <span class="kw">NOT NULL</span>,
    <span class="col">amount</span>          <span class="typ">NUMERIC</span>(38,10),   <span class="cmt">-- ⚠ Verify precision requirements</span>
    <span class="col">currency</span>        <span class="typ">CHAR</span>(3)           <span class="kw">DEFAULT</span> <span class="str">'USD'</span>,
    <span class="col">description</span>     <span class="typ">VARCHAR</span>(4000),
    <span class="col">status</span>          <span class="typ">VARCHAR</span>(20)       <span class="kw">DEFAULT</span> <span class="str">'PENDING'</span>,
    <span class="col">created_by</span>      <span class="typ">VARCHAR</span>(60),
    <span class="col">created_date</span>    <span class="typ">TIMESTAMP</span>         <span class="kw">DEFAULT</span> <span class="fn">LOCALTIMESTAMP</span>,
    <span class="kw">CONSTRAINT</span> <span class="obj">pk_txn</span> <span class="kw">PRIMARY KEY</span> (<span class="col">txn_id</span>, <span class="col">txn_date</span>),
    <span class="kw">CONSTRAINT</span> <span class="obj">fk_txn_acct</span> <span class="kw">FOREIGN KEY</span> (<span class="col">account_id</span>)
        <span class="kw">REFERENCES</span> <span class="obj">finance_core</span>.<span class="obj">accounts</span>(<span class="col">account_id</span>)
) <span class="kw">PARTITION BY RANGE</span> (<span class="col">txn_date</span>);

<span class="cmt">-- ⚡ Partitions converted with Oracle LESS THAN semantics preserved</span>
<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">finance_core</span>.<span class="obj">transactions_p_2024</span> <span class="kw">PARTITION OF</span> <span class="obj">finance_core</span>.<span class="obj">transactions</span>
    <span class="kw">FOR VALUES FROM</span> (<span class="fn">MINVALUE</span>) <span class="kw">TO</span> (<span class="str">'2025-01-01'</span>);
<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">finance_core</span>.<span class="obj">transactions_p_2025</span> <span class="kw">PARTITION OF</span> <span class="obj">finance_core</span>.<span class="obj">transactions</span>
    <span class="kw">FOR VALUES FROM</span> (<span class="str">'2025-01-01'</span>) <span class="kw">TO</span> (<span class="str">'2026-01-01'</span>);
<span class="kw">CREATE</span> <span class="kw">TABLE</span> <span class="obj">finance_core</span>.<span class="obj">transactions_p_max</span> <span class="kw">PARTITION OF</span> <span class="obj">finance_core</span>.<span class="obj">transactions</span>
    <span class="kw">FOR VALUES FROM</span> (<span class="str">'2026-01-01'</span>) <span class="kw">TO</span> (<span class="fn">MAXVALUE</span>);
<span class="cmt">-- ⚡ 7 rules applied · Confidence: MEDIUM (review PK and partition strategy)</span>`
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
    <span class="col">p_start_date</span>  <span class="typ">TIMESTAMP</span>,
    <span class="col">p_end_date</span>    <span class="typ">TIMESTAMP</span>
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

  const createProjectSubmit = document.getElementById('createProjectSubmit');
  if (createProjectSubmit) {
    createProjectSubmit.addEventListener('click', submitProjectCreate);
  }

  const createConnectionSubmit = document.getElementById('createConnectionSubmit');
  if (createConnectionSubmit) {
    createConnectionSubmit.addEventListener('click', submitConnectionCreate);
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

async function submitProjectCreate() {
  const submitBtn = document.getElementById('createProjectSubmit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const body = {
      businessUnit: getInputValue('projectBusinessUnit'),
      projectCode: getInputValue('projectCodeInput'),
      name: getInputValue('projectNameInput'),
      applicationOwner: getInputValue('projectOwnerInput'),
      businessCriticality: getInputValue('projectCriticalityInput'),
      engagementMode: document.querySelector('input[name="mode"]:checked')?.value || 'assessment',
      initialSourceDatabase: getInputValue('projectInitialSourceInput'),
      schemaScope: getInputValue('projectSchemaScopeInput'),
      plannedStartWindow: getInputValue('projectStartWindowInput'),
      primaryAssessmentGoal: getInputValue('projectAssessmentGoalInput'),
      preferredAgentZone: getInputValue('projectAgentZoneInput')
    };

    if (!body.projectCode || !body.name) {
      throw new Error('Project code and project name are required');
    }

    const response = await apiFetch('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to create project');
    }

    appState.selectedProjectId = payload.project.projectId;
    closeModal();
    await initDashboardApi();
    await loadProjectOverview(payload.project.projectId, { navigate: true });
  } catch (error) {
    window.alert(error.message || 'Unable to create project');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function submitConnectionCreate() {
  const submitBtn = document.getElementById('createConnectionSubmit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const projectId = getInputValue('connectionProjectSelect') || appState.selectedProjectId;
    if (!projectId) {
      throw new Error('Create and select a project before creating a database connection');
    }

    const body = {
      projectId,
      businessUnit: getInputValue('connectionBusinessUnit'),
      connectionRole: getInputValue('connectionRoleInput'),
      engine: getInputValue('connectionEngineInput'),
      host: getInputValue('connectionHostInput'),
      port: getInputValue('connectionPortInput'),
      serviceName: getInputValue('connectionServiceInput'),
      schemaScope: getInputValue('connectionSchemaScopeInput'),
      credentialReference: getInputValue('connectionCredentialInput'),
      agentNetworkZone: getInputValue('connectionAgentZoneInput'),
      startAssessment: true
    };

    const response = await apiFetch('/api/v1/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to create connection');
    }

    appState.selectedProjectId = payload.project.projectId;
    closeConnectionModal();
    await initDashboardApi();
    await loadProjectOverview(payload.project.projectId, { navigate: true });
  } catch (error) {
    window.alert(error.message || 'Unable to create connection');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function getInputValue(id) {
  const element = document.getElementById(id);
  return String(element?.value || '').trim();
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
