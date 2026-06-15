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

type DashboardPayload = {
  tenant: Tenant;
  summary: {
    activeProjects: number;
    discoveredObjects: number;
    averageConversionRatePct: number;
    dataMigratedTb: number;
    queuedJobs: number;
    runningJobs: number;
  };
  projects: Project[];
  jobs: Job[];
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

type ViewKey = 'dashboard' | 'project' | 'assessment' | 'converter' | 'dataload' | 'cdc' | 'validation' | 'cutover';
type ReadinessViewKey = Exclude<ViewKey, 'dashboard' | 'project'>;

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
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Synqora API request failed');
  }
  return payload;
}

function App() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSession().then(setSession).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    refreshDashboard().catch((err: Error) => setError(err.message));
  }, [session?.authenticated]);

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
        <Topbar view={activeView} />
        {error && <div className="alert">{error}</div>}
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
        {activeView === 'project' && <ProjectView project={selectedProject} jobs={projectJobs} onCreateConnection={handleCreateConnection} />}
        {activeView !== 'dashboard' && activeView !== 'project' && <ReadinessView view={activeView as ReadinessViewKey} project={selectedProject} jobs={projectJobs} />}
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
    { label: 'Overview', items: [['dashboard', 'Dashboard'], ['project', 'Project Pipeline']] },
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

function Topbar({ view }: { view: ViewKey }) {
  return (
    <header className="topbar">
      <span>Synqora</span>
      <span>/</span>
      <strong>{viewLabels[view]}</strong>
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
  project: 'Project Pipeline',
  assessment: 'Assessment',
  converter: 'Schema Converter',
  dataload: 'Data Load',
  cdc: 'CDC / Replication',
  validation: 'Validation',
  cutover: 'Cutover Control'
};

const readinessCopy: Record<Exclude<ViewKey, 'dashboard' | 'project'>, { title: string; projectText: string; gate: string }> = {
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
    projectText: 'Attach a PostgreSQL target, approve chunking, and generate load jobs before monitoring throughput.',
    gate: 'Target + load plan'
  },
  cdc: {
    title: 'CDC is disabled until replication prerequisites are approved',
    projectText: 'Validate supplemental logging, source privileges, target apply schema, and rollback strategy before starting CDC.',
    gate: 'CDC prerequisites'
  },
  validation: {
    title: 'Validation runs after schema deployment and data load',
    projectText: 'Run schema, row-count, checksum, semantic, and performance validations after target deployment.',
    gate: 'Deployment + data load'
  },
  cutover: {
    title: 'Cutover controls remain locked until gates pass',
    projectText: 'Complete validation, CDC catch-up, approvals, rollback package, and freeze confirmation before cutover.',
    gate: 'Cutover gates'
  }
};

function humanizeStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeStage(value: string) {
  return humanizeStatus(value || 'connectivity');
}

createRoot(document.getElementById('root')!).render(<App />);
