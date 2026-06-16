import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Tenant = {
  tenantId: string;
  name: string;
  slug: string;
};

type User = {
  userId: string;
  email: string;
  displayName: string;
};

type Project = {
  projectId: string;
  projectCode: string;
  name: string;
  description: string;
  status: string;
  sourceEngine: string;
  targetEngine: string;
  engagementMode: string;
  pipelineStage: string;
  discoveredObjects: number;
  conversionRatePct: number;
  dataMigratedTb: number;
  criticalIssues: number;
  warningIssues: number;
};

type Job = {
  jobRunId: string;
  projectId: string;
  jobType: string;
  status: string;
  capabilityRequired: string;
  attemptCount: number;
  maxAttempts: number;
};

type Connection = {
  environmentId: string;
  projectId: string;
  environmentName: string;
  environmentType: string;
  status: string;
  networkZone: string;
  settingsJson: Record<string, unknown>;
};

type DashboardPayload = {
  tenant: Tenant;
  summary: {
    activeProjects: number;
    discoveredObjects: number;
    averageConversionRatePct: number;
    dataMigratedTb: number;
    queuedJobs: number;
    runningJobs: number;
    databaseConnections?: number;
    sourceConnections?: number;
    targetConnections?: number;
  };
  projects: Project[];
  jobs: Job[];
  connections?: Connection[];
};

type SessionPayload = {
  authenticated: boolean;
  user?: User;
  tenant?: Tenant;
  role?: string;
  demoLogin?: {
    email: string;
    password: string;
  };
};

type OrganizationTenant = {
  id: string;
  name: string;
  businessUnit: string;
  region: string;
  purpose: string;
  status: string;
};

type ViewKey = 'dashboard' | 'organizations' | 'services' | 'project' | 'assessment' | 'converter' | 'dataload' | 'cdc' | 'validation' | 'cutover';
type ReadinessViewKey = Exclude<ViewKey, 'dashboard' | 'organizations' | 'services' | 'project'>;
type ThemeMode = 'light' | 'dark';

const themeStorageKey = 'synqora-theme';
const organizationTenantsStorageKey = 'synqora-org-tenants';

const api = {
  async getSession(): Promise<SessionPayload> {
    return request('/api/v1/auth/session');
  },
  async login(email: string, password: string): Promise<SessionPayload> {
    return request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },
  async dashboard(): Promise<DashboardPayload> {
    return request('/api/v1/dashboard');
  },
  async createProject(input: Record<string, string>): Promise<{ project: Project }> {
    return request('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  async createConnection(input: Record<string, unknown>) {
    return request('/api/v1/connections', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error(formatNetworkError(error));
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Synqora API request failed');
  }
  return payload;
}

function formatNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message.includes('NetworkError') || message.includes('Failed to fetch') || message.includes('Load failed')) {
    return 'Synqora API is not reachable. Start the local server with npm run legacy:start:cloud and reload http://127.0.0.1:8787/.';
  }
  return message || 'Synqora API request failed.';
}

function loadStoredOrganizationTenants(): OrganizationTenant[] {
  try {
    return JSON.parse(localStorage.getItem(organizationTenantsStorageKey) || '[]') as OrganizationTenant[];
  } catch {
    return [];
  }
}

function App() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [organizationTenants, setOrganizationTenants] = useState<OrganizationTenant[]>(() => loadStoredOrganizationTenants());
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light'));
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    api.getSession().then(setSession).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    refreshDashboard().catch((err: Error) => setError(err.message));
  }, [session?.authenticated]);

  useEffect(() => {
    if (!session?.tenant || organizationTenants.length > 0) return;
    setOrganizationTenants([{
      id: session.tenant.tenantId,
      name: session.tenant.name,
      businessUnit: 'Shared Services',
      region: 'us-east-1',
      purpose: 'control-plane',
      status: 'active'
    }]);
  }, [session?.tenant, organizationTenants.length]);

  useEffect(() => {
    localStorage.setItem(organizationTenantsStorageKey, JSON.stringify(organizationTenants));
  }, [organizationTenants]);

  async function refreshDashboard() {
    const payload = await api.dashboard();
    setDashboard(payload);
    setSelectedProjectId((current) => {
      if (payload.projects.length === 0) return null;
      if (current && payload.projects.some((project) => project.projectId === current)) return current;
      return payload.projects[0].projectId;
    });
  }

  async function handleLogin(email: string, password: string) {
    setError('');
    const payload = await api.login(email, password);
    setSession(payload);
  }

  async function handleCreateProject(input: Record<string, string>) {
    setError('');
    const payload = await api.createProject(input);
    setSelectedProjectId(payload.project.projectId);
    await refreshDashboard();
    setActiveView('project');
  }

  async function handleCreateConnection(input: Record<string, string>) {
    if (!selectedProjectId) {
      setError('Create or select a project first.');
      return;
    }
    await api.createConnection({
      ...input,
      projectId: selectedProjectId,
      connectionRole: 'source_assessment',
      engine: 'Oracle 19c',
      startAssessment: true
    });
    await refreshDashboard();
    setActiveView('project');
  }

  if (!session) {
    return <Shell message="Loading Synqora workspace..." />;
  }

  if (!session.authenticated) {
    return <LoginPage demoEmail={session.demoLogin?.email || ''} demoPassword={session.demoLogin?.password || ''} onLogin={handleLogin} error={error} />;
  }

  const selectedProject = dashboard?.projects.find((project) => project.projectId === selectedProjectId) || dashboard?.projects[0] || null;
  const projectJobs = dashboard?.jobs.filter((job) => job.projectId === selectedProject?.projectId) || [];

  return (
    <div className="app-shell">
      <Sidebar tenant={session.tenant} user={session.user} activeView={activeView} setActiveView={setActiveView} />
      <main className="workspace">
        <Topbar view={activeView} theme={theme} onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))} />
        {error && <div className="alert">{error}</div>}
        {activeView === 'organizations' && (
          <OrganizationsView
            payload={dashboard}
            session={session}
            tenants={organizationTenants}
            onCreateTenant={(tenant) => setOrganizationTenants((current) => [...current, tenant])}
          />
        )}
        {activeView === 'dashboard' && (
          <DashboardView
            payload={dashboard}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
            onOpenProject={(projectId) => {
              setSelectedProjectId(projectId);
              setActiveView('project');
            }}
            onCreateProject={handleCreateProject}
            onCreateConnection={handleCreateConnection}
          />
        )}
        {activeView === 'services' && <ServicesView payload={dashboard} setActiveView={setActiveView} onCreateConnection={handleCreateConnection} />}
        {activeView === 'project' && <ProjectView project={selectedProject} jobs={projectJobs} onCreateConnection={handleCreateConnection} />}
        {activeView !== 'dashboard' && activeView !== 'organizations' && activeView !== 'services' && activeView !== 'project' && <ReadinessView view={activeView as ReadinessViewKey} project={selectedProject} jobs={projectJobs} />}
      </main>
    </div>
  );
}

function LoginPage({ demoEmail, demoPassword, onLogin, error }: { demoEmail: string; demoPassword: string; onLogin: (email: string, password: string) => Promise<void>; error: string }) {
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState(demoPassword);

  return (
    <div className="public-page">
      <section className="public-hero">
        <p className="eyebrow">Oracle to PostgreSQL Migration Operating System</p>
        <h1>Synqora</h1>
        <p>Plan, assess, convert, load, replicate, validate, and cut over with evidence-first automation.</p>
      </section>
      <form
        className="login-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(email, password).catch(() => undefined);
        }}
      >
        <h2>Sign in</h2>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <div className="alert">{error}</div>}
        <button type="submit">Open Workspace</button>
        <small>Demo: {demoEmail} / {demoPassword}</small>
      </form>
    </div>
  );
}

function Shell({ message }: { message: string }) {
  return <div className="shell-loading">{message}</div>;
}

function Sidebar({ tenant, user, activeView, setActiveView }: { tenant?: Tenant; user?: User; activeView: ViewKey; setActiveView: (view: ViewKey) => void }) {
  const groups: Array<{ label: string; items: Array<[ViewKey, string]> }> = [
    { label: 'Overview', items: [['dashboard', 'Dashboard'], ['organizations', 'Organizations'], ['services', 'Services'], ['project', 'Project Pipeline']] },
    { label: 'Migration', items: [['assessment', 'Assessment'], ['converter', 'Schema Converter'], ['dataload', 'Data Load'], ['cdc', 'CDC / Replication']] },
    { label: 'Operations', items: [['validation', 'Validation'], ['cutover', 'Cutover Control']] }
  ];

  return (
    <aside className="sidebar">
      <div className="brand-mark">S</div>
      <strong>Synqora</strong>
      {groups.map((group) => (
        <nav key={group.label}>
          <span>{group.label}</span>
          {group.items.map(([key, label]) => (
            <button key={key} className={activeView === key ? 'active' : ''} onClick={() => setActiveView(key)}>
              {label}
            </button>
          ))}
        </nav>
      ))}
      <div className="tenant-chip">{tenant?.name || 'Tenant'}</div>
      <div className="user-chip">{user?.displayName || user?.email || 'User'}</div>
    </aside>
  );
}

function OrganizationsView({ payload, session, tenants, onCreateTenant }: {
  payload: DashboardPayload | null;
  session: SessionPayload;
  tenants: OrganizationTenant[];
  onCreateTenant: (tenant: OrganizationTenant) => void;
}) {
  const [form, setForm] = useState({ name: '', businessUnit: '', region: 'us-east-1', purpose: 'assessment' });
  const organizationName = session.tenant?.name || 'Synqora Organization';
  const accountId = session.tenant?.tenantId || 'acct-local';

  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1>Organizations & Accounts</h1>
          <p>Customer isolation starts here. Each organization owns accounts, tenants, workspaces, users, policies, and migration inventory.</p>
        </div>
      </div>
      <section className="org-hero panel">
        <div>
          <span className="eyebrow">Customer organization</span>
          <h2>{organizationName}</h2>
          <p>Use this like AWS Organizations: a customer organization can own multiple isolated Synqora accounts or tenants for business units, regions, portfolios, and environments.</p>
        </div>
        <div className="org-id-card">
          <span>Organization Account ID</span>
          <strong>{accountId}</strong>
          <small>Support, audit, billing, troubleshooting, and policy boundary.</small>
        </div>
      </section>
      <div className="org-metric-grid">
        <div className="panel"><strong>{tenants.length}</strong><span>Accounts / Tenants</span></div>
        <div className="panel"><strong>{payload?.projects.length || 0}</strong><span>Migration Projects</span></div>
        <div className="panel"><strong>{payload?.connections?.length || 0}</strong><span>Database Connections</span></div>
        <div className="panel"><strong>{payload?.jobs.length || 0}</strong><span>Workflow Jobs</span></div>
      </div>
      <div className="org-layout">
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            if (!form.name.trim()) return;
            onCreateTenant({
              id: `acct-${Date.now().toString(36)}`,
              name: form.name,
              businessUnit: form.businessUnit || 'Unassigned',
              region: form.region || 'us-east-1',
              purpose: form.purpose || 'assessment',
              status: 'active'
            });
            setForm({ name: '', businessUnit: '', region: 'us-east-1', purpose: 'assessment' });
          }}
        >
          <h2>Create Account / Tenant</h2>
          <p className="muted">Model separate business units, regions, portfolios, or environments under the same customer organization.</p>
          <Field label="Account / Tenant Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Business Unit" value={form.businessUnit} onChange={(value) => setForm({ ...form, businessUnit: value })} />
          <Field label="Home Region" value={form.region} onChange={(value) => setForm({ ...form, region: value })} />
          <Field label="Purpose" value={form.purpose} onChange={(value) => setForm({ ...form, purpose: value })} />
          <button type="submit">Create Tenant</button>
        </form>
        <section className="panel">
          <h2>Organization Account Hierarchy</h2>
          <p className="muted">Customers see only accounts under their own organization. Operators troubleshoot by organization account ID, then account/tenant ID.</p>
          <div className="org-account-grid">
            {tenants.map((tenant) => (
              <div className="org-account-card" key={tenant.id}>
                <span>{tenant.id}</span>
                <strong>{tenant.name}</strong>
                <p>{tenant.businessUnit}</p>
                <small>{tenant.region} / {tenant.purpose} / {humanizeStatus(tenant.status)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ServicesView({ payload, setActiveView, onCreateConnection }: { payload: DashboardPayload | null; setActiveView: (view: ViewKey) => void; onCreateConnection: (input: Record<string, string>) => Promise<void> }) {
  const projects = payload?.projects || [];
  const jobs = payload?.jobs || [];
  const connections = payload?.connections || [];
  const projectById = new Map(projects.map((project) => [project.projectId, project]));
  const services: Array<{ name: string; description: string; metric: string; view: ViewKey }> = [
    { name: 'Database Connections', description: 'Reusable Oracle and PostgreSQL endpoints scoped to this tenant.', metric: `${connections.length} endpoints`, view: 'services' },
    { name: 'Migration Projects', description: 'Business wrappers for assessment, conversion, load, CDC, validation, and cutover.', metric: `${projects.length} projects`, view: 'dashboard' },
    { name: 'Agents & Connectivity', description: 'Customer-side execution plane for network checks, secrets, discovery, and validation.', metric: 'Agent ready', view: 'services' },
    { name: 'Assessment', description: 'Oracle source discovery, risk detection, and evidence snapshots.', metric: `${jobs.filter((job) => job.jobType.includes('assessment') || job.jobType.includes('discover')).length} jobs`, view: 'assessment' },
    { name: 'Schema Conversion', description: 'DDL, datatype, PL/SQL, trigger, sequence, and partition conversion.', metric: `${payload?.summary.averageConversionRatePct || 0}%`, view: 'converter' },
    { name: 'Transport Providers', description: 'AWS DMS, Qlik/HVR, GoldenGate, Debezium, ora2pg, pgloader, or custom unload/load under one protocol.', metric: 'Bring your tool', view: 'dataload' },
    { name: 'Data Load & CDC', description: 'Snapshot boundary, chunk plan, CDC start point, lag tracking, retries, and validation gates.', metric: `${payload?.summary.dataMigratedTb || 0} TB`, view: 'dataload' },
    { name: 'Validation', description: 'Schema, code, row-count, checksum, and business-rule comparison.', metric: `${jobs.filter((job) => job.jobType.includes('validation')).length} checks`, view: 'validation' },
    { name: 'Evidence & Audit', description: 'Issue history, rule decisions, approvals, cutover gates, and remediation notes.', metric: `${jobs.length} events`, view: 'cutover' }
  ];

  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1>Synqora Services</h1>
          <p>One product console for all migration databases, projects, jobs, agents, and evidence under this customer tenant.</p>
        </div>
      </div>
      <section className="services-hero panel">
        <div>
          <span className="eyebrow">Tenant service catalog</span>
          <h2>Everything is scoped to your organization.</h2>
          <p>Create many database endpoints under the same account, then attach them to migration projects when needed.</p>
        </div>
        <div className="services-counts">
          <div><strong>{connections.length}</strong><span>Database endpoints</span></div>
          <div><strong>{projects.length}</strong><span>Projects</span></div>
          <div><strong>{payload?.summary.queuedJobs || 0}</strong><span>Queued jobs</span></div>
        </div>
      </section>
      <div className="services-grid">
        {services.map((service) => (
          <button key={service.name} type="button" className="service-card" onClick={() => setActiveView(service.view)}>
            <span>{service.metric}</span>
            <strong>{service.name}</strong>
            <p>{service.description}</p>
          </button>
        ))}
      </div>
      <ProtocolSurface />
      <section className="panel">
        <h2>Database Inventory</h2>
        <p className="muted">Reusable Oracle and PostgreSQL connection profiles for this tenant. Troubleshooting starts here.</p>
        {!connections.length && <EmptyState text="No database connections yet. Create a project, then add an Oracle source connection." />}
        {connections.map((connection) => {
          const settings = connection.settingsJson || {};
          const project = projectById.get(connection.projectId);
          return (
            <div className="inventory-row" key={connection.environmentId}>
              <strong>{connection.environmentName}</strong>
              <span>{humanizeStatus(connection.environmentType)}</span>
              <span>{humanizeStatus(connection.status)}</span>
              <span>{project?.projectCode || 'Unassigned'}</span>
              <span>{String(settings.host || settings.hostName || 'Host pending')}</span>
              <span>{connection.networkZone || 'Agent zone pending'}</span>
            </div>
          );
        })}
      </section>
      <div className="workspace-grid">
        <ConnectionCreatePanel disabled={!projects.length} onCreateConnection={onCreateConnection} />
      </div>
    </section>
  );
}

function Topbar({ view, theme, onToggleTheme }: { view: ViewKey; theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <header className="topbar">
      <span>Synqora</span>
      <span>/</span>
      <strong>{viewLabels[view]}</strong>
      <button type="button" className="theme-switch" onClick={onToggleTheme}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
    </header>
  );
}

function DashboardView({ payload, selectedProjectId, setSelectedProjectId, onOpenProject, onCreateProject, onCreateConnection }: {
  payload: DashboardPayload | null;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string) => void;
  onOpenProject: (id: string) => void;
  onCreateProject: (input: Record<string, string>) => Promise<void>;
  onCreateConnection: (input: Record<string, string>) => Promise<void>;
}) {
  const scrollToProjects = () => {
    document.getElementById('tenant-projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1>Migration Portfolio</h1>
          <p>One organization, many business units, many Oracle sources, governed from one control plane.</p>
        </div>
      </div>
      <div className="metric-row">
        <Metric label="Active Projects" value={payload?.summary.activeProjects || 0} hint={payload?.projects.length ? 'Open tenant project list' : 'No projects yet'} onClick={scrollToProjects} />
        <Metric label="Objects Discovered" value={payload?.summary.discoveredObjects || 0} hint="Awaiting Oracle discovery" />
        <Metric label="Conversion Rate %" value={payload?.summary.averageConversionRatePct || 0} hint="No conversion run" />
        <Metric label="Data Migrated TB" value={(payload?.summary.dataMigratedTb || 0).toFixed(1)} hint="No load started" />
      </div>
      <div className="workspace-grid">
        <ProjectCreatePanel onCreateProject={onCreateProject} />
        <ConnectionCreatePanel disabled={!selectedProjectId} onCreateConnection={onCreateConnection} />
      </div>
      <section id="tenant-projects" className="panel">
        <h2>Tenant Projects</h2>
        <p className="muted">Only projects owned by the current customer tenant are returned here. Other customer dashboards are isolated by the API tenant boundary.</p>
        {!payload?.projects.length && <EmptyState text="No migration projects yet. Create a project, then attach an Oracle source connection to start assessment." />}
        <div className="project-grid">
          {payload?.projects.map((project) => (
            <button key={project.projectId} className={`project-card ${selectedProjectId === project.projectId ? 'selected' : ''}`} onClick={() => onOpenProject(project.projectId)} onFocus={() => setSelectedProjectId(project.projectId)}>
              <span>{project.projectCode}</span>
              <strong>{project.name}</strong>
              <p>{project.description}</p>
              <small>{humanizeStatus(project.status)} / {humanizeStage(project.pipelineStage)}</small>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function ProjectView({ project, jobs, onCreateConnection }: { project: Project | null; jobs: Job[]; onCreateConnection: (input: Record<string, string>) => Promise<void> }) {
  if (!project) {
    return <ReadinessGate title="No migration project selected" text="Create a migration project first. A project becomes the business wrapper for source connections, assessment jobs, conversion, load, CDC, validation, and cutover evidence." />;
  }
  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1>{project.name}</h1>
          <p>{project.projectCode} / {humanizeStage(project.pipelineStage)} / {humanizeStatus(project.status)}</p>
        </div>
      </div>
      <div className="workspace-grid">
        <ConnectionCreatePanel onCreateConnection={onCreateConnection} />
        <section className="panel">
          <h2>Execution Queue</h2>
          {!jobs.length && <EmptyState text="No jobs exist for this project yet." />}
          {jobs.map((job) => (
            <div className="queue-row" key={job.jobRunId}>
              <strong>{job.jobType}</strong>
              <span>{job.capabilityRequired}</span>
              <span>{humanizeStatus(job.status)}</span>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}

function ReadinessView({ view, project, jobs }: { view: ReadinessViewKey; project: Project | null; jobs: Job[] }) {
  const state = readinessCopy[view];
  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1>{viewLabels[view]}</h1>
          <p>{project ? `${project.projectCode} readiness` : 'Select a project to continue'}</p>
        </div>
      </div>
      <ReadinessGate
        title={state.title}
        text={project ? state.projectText : 'Create a migration project, then attach an Oracle source connection.'}
        facts={[
          ['Project', project?.projectCode || 'Not created'],
          ['Source', project?.status === 'assessment_queued' ? 'Pending validation' : 'No source evidence'],
          ['Queued Jobs', String(jobs.filter((job) => job.status === 'queued').length)],
          ['Required Gate', state.gate]
        ]}
      />
      {(view === 'dataload' || view === 'cdc' || view === 'validation' || view === 'cutover') && <ProtocolSurface />}
    </section>
  );
}

function ProtocolSurface() {
  return (
    <section className="protocol-surface panel">
      <div>
        <span className="eyebrow">Synqora protocol</span>
        <h2>Choose the data transport. Synqora controls consistency.</h2>
        <p className="muted">Customers can use commercial, cloud-native, open-source, or custom movement tools. Synqora still enforces the migration contract: snapshot point, chunk plan, CDC start point, checkpoint evidence, validation, and cutover gates.</p>
      </div>
      <div className="protocol-grid">
        {consistencyModes.map((mode) => (
          <div className="protocol-card" key={mode.name}>
            <span>{mode.fit}</span>
            <strong>{mode.name}</strong>
            <p>{mode.description}</p>
          </div>
        ))}
      </div>
      <div className="transport-grid">
        {transportOptions.map((option) => (
          <div className="transport-card" key={option.name}>
            <span>{option.category}</span>
            <strong>{option.name}</strong>
            <p>{option.useCase}</p>
          </div>
        ))}
      </div>
      <div className="gate-strip">
        {protocolGates.map((gate) => <span key={gate}>{gate}</span>)}
      </div>
    </section>
  );
}

function ProjectCreatePanel({ onCreateProject }: { onCreateProject: (input: Record<string, string>) => Promise<void> }) {
  const [form, setForm] = useState({ projectCode: '', name: '', primaryAssessmentGoal: '', schemaScope: '', preferredAgentZone: '' });
  return (
    <form className="panel" onSubmit={(event) => { event.preventDefault(); onCreateProject(form).catch(() => undefined); }}>
      <h2>Create Project</h2>
      <Field label="Project Code" value={form.projectCode} onChange={(value) => setForm({ ...form, projectCode: value })} />
      <Field label="Project Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
      <Field label="Assessment Goal" value={form.primaryAssessmentGoal} onChange={(value) => setForm({ ...form, primaryAssessmentGoal: value })} />
      <Field label="Schema Scope" value={form.schemaScope} onChange={(value) => setForm({ ...form, schemaScope: value })} />
      <Field label="Agent Zone" value={form.preferredAgentZone} onChange={(value) => setForm({ ...form, preferredAgentZone: value })} />
      <button type="submit">Create Project</button>
    </form>
  );
}

function ConnectionCreatePanel({ disabled = false, onCreateConnection }: { disabled?: boolean; onCreateConnection: (input: Record<string, string>) => Promise<void> }) {
  const [form, setForm] = useState({ host: '', port: '1521', serviceName: '', schemaScope: '', credentialReference: '', agentNetworkZone: '' });
  return (
    <form className="panel" onSubmit={(event) => { event.preventDefault(); if (!disabled) onCreateConnection(form).catch(() => undefined); }}>
      <h2>Oracle Source Connection</h2>
      {disabled && <p className="muted">Create or select a project before adding a connection.</p>}
      <Field label="Host" value={form.host} onChange={(value) => setForm({ ...form, host: value })} />
      <Field label="Port" value={form.port} onChange={(value) => setForm({ ...form, port: value })} />
      <Field label="Service Name" value={form.serviceName} onChange={(value) => setForm({ ...form, serviceName: value })} />
      <Field label="Schema Scope" value={form.schemaScope} onChange={(value) => setForm({ ...form, schemaScope: value })} />
      <Field label="Credential Reference" value={form.credentialReference} onChange={(value) => setForm({ ...form, credentialReference: value })} />
      <Field label="Agent Zone" value={form.agentNetworkZone} onChange={(value) => setForm({ ...form, agentNetworkZone: value })} />
      <button type="submit" disabled={disabled}>Create Connection & Queue Assessment</button>
    </form>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Metric({ label, value, hint, onClick }: { label: string; value: string | number; hint: string; onClick?: () => void }) {
  if (onClick) {
    return <button type="button" className="metric-card metric-action" onClick={onClick}><strong>{value}</strong><span>{label}</span><small>{hint}</small></button>;
  }
  return <div className="metric-card"><strong>{value}</strong><span>{label}</span><small>{hint}</small></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function ReadinessGate({ title, text, facts = [] }: { title: string; text: string; facts?: Array<[string, string]> }) {
  return (
    <section className="readiness-gate">
      <span>Readiness Gate</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="fact-grid">
        {facts.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
      </div>
    </section>
  );
}

const viewLabels: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  organizations: 'Organizations',
  services: 'Services',
  project: 'Project Pipeline',
  assessment: 'Assessment',
  converter: 'Schema Converter',
  dataload: 'Data Load',
  cdc: 'CDC / Replication',
  validation: 'Validation',
  cutover: 'Cutover Control'
};

const readinessCopy: Record<ReadinessViewKey, { title: string; projectText: string; gate: string }> = {
  assessment: {
    title: 'Assessment waits for Oracle source evidence',
    projectText: 'An agent must validate connectivity and collect Oracle dictionary evidence before assessment results are shown.',
    gate: 'Oracle validation + discovery'
  },
  converter: {
    title: 'Schema conversion is locked until assessment completes',
    projectText: 'Complete Oracle assessment, confirm datatype policy, then run conversion rules against discovered objects.',
    gate: 'Assessment complete'
  },
  dataload: {
    title: 'Data load requires a target and approved load plan',
    projectText: 'Attach a PostgreSQL target, choose the transport provider, approve the consistency mode, capture the snapshot boundary, and generate resumable chunk jobs before loading.',
    gate: 'Target + protocol + load plan'
  },
  cdc: {
    title: 'CDC is disabled until replication prerequisites are approved',
    projectText: 'Validate archive logging, supplemental logging, source privileges, provider feasibility, checkpoint retention, target apply schema, and rollback strategy before starting CDC capture.',
    gate: 'CDC prerequisites + start checkpoint'
  },
  validation: {
    title: 'Validation runs after schema deployment and data load',
    projectText: 'Run schema, row-count, chunk checksum, CDC checkpoint, semantic, and business-rule validations after target deployment and before cutover eligibility.',
    gate: 'Deployment + load + CDC evidence'
  },
  cutover: {
    title: 'Cutover controls remain locked until gates pass',
    projectText: 'Complete validation, CDC catch-up, approvals, rollback package, and freeze confirmation before cutover.',
    gate: 'Cutover gates'
  }
};

const consistencyModes = [
  {
    name: 'Global Snapshot Mode',
    fit: 'Best correctness',
    description: 'One Oracle SCN/checkpoint for all schemas and tables. Simplest CDC contract, but requires enough undo/log retention for long loads.'
  },
  {
    name: 'Schema Wave Snapshot Mode',
    fit: 'Enterprise phased',
    description: 'One SCN/checkpoint per dependency-aware schema or application wave. Good for multi-schema programs migrated over weeks.'
  },
  {
    name: 'Table-Level Snapshot Mode',
    fit: 'Huge hot tables',
    description: 'Per-table or table-group checkpoints for very large/high-change objects. Most flexible, but requires stronger CDC and validation evidence.'
  }
];

const transportOptions = [
  { name: 'AWS DMS', category: 'Cloud native', useCase: 'Managed full-load plus CDC for AWS-centered migrations and fast operational startup.' },
  { name: 'Qlik Replicate / HVR', category: 'Commercial', useCase: 'High-throughput enterprise replication, heterogeneous sources, monitoring, and mature CDC operations.' },
  { name: 'Oracle GoldenGate', category: 'Commercial', useCase: 'Oracle-heavy estates needing proven redo-based replication and low-downtime migration patterns.' },
  { name: 'Debezium / Kafka', category: 'Open source', useCase: 'Event-streaming architecture, custom pipelines, and teams already running Kafka Connect.' },
  { name: 'ora2pg / pgloader', category: 'Open source', useCase: 'Schema/data migration for smaller or controlled workloads where CDC is not the main requirement.' },
  { name: 'Custom unload/load', category: 'Customer managed', useCase: 'Data Pump, external tables, files, object storage, COPY, partition exchange, or provider-specific bulk paths.' }
];

const protocolGates = [
  'Snapshot boundary captured',
  'Chunk plan approved',
  'CDC start checkpoint recorded',
  'Load checkpointed',
  'CDC caught up',
  'Validation passed',
  'Cutover approved'
];

function humanizeStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeStage(value: string) {
  return humanizeStatus(value || 'connectivity');
}

createRoot(document.getElementById('root')!).render(<App />);
