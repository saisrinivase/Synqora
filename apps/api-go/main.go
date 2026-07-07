package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	sessionCookieName = "synqora_session"
	demoEmail         = "sai@example.com"
	demoPassword      = "Synqora_123"
	demoTenantName    = "Synqora Demo Tenant"
	demoAgentToken    = "synqora-demo-token"
)

type Server struct {
	store    *Store
	sessions map[string]Session
	mu       sync.Mutex
}

type Session struct {
	Context   AuthContext `json:"context"`
	ExpiresAt time.Time   `json:"expiresAt"`
}

type Store struct {
	mu          sync.Mutex
	tenants     []Tenant
	users       []User
	credentials map[string]string
	userTenant  map[string]string
	userRole    map[string]string
	projects    []Project
	connections []Connection
	agentPools  []AgentPool
	agentTokens map[string]string
	agents      []Agent
	heartbeats  []AgentHeartbeat
	workflows   []Workflow
	jobs        []Job
	checkpoints []JobCheckpoint
	transitions []StateTransition
}

type AuthContext struct {
	User   User   `json:"user"`
	Tenant Tenant `json:"tenant"`
	Role   string `json:"role"`
}

type Tenant struct {
	TenantID       string `json:"tenantId"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	Status         string `json:"status"`
	DeploymentTier string `json:"deploymentTier"`
	RegionHome     string `json:"regionHome"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type User struct {
	UserID      string `json:"userId"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Status      string `json:"status"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type Project struct {
	ProjectID           string  `json:"projectId"`
	TenantID            string  `json:"tenantId"`
	ProjectCode         string  `json:"projectCode"`
	Name                string  `json:"name"`
	Description         string  `json:"description"`
	Status              string  `json:"status"`
	SourceEngine        string  `json:"sourceEngine"`
	TargetEngine        string  `json:"targetEngine"`
	EngagementMode      string  `json:"engagementMode"`
	DeploymentMode      string  `json:"deploymentMode"`
	OwnerUserID         string  `json:"ownerUserId"`
	DiscoveredObjects   int     `json:"discoveredObjects"`
	ConversionRatePct   int     `json:"conversionRatePct"`
	DataMigratedTB      float64 `json:"dataMigratedTb"`
	CriticalIssues      int     `json:"criticalIssues"`
	WarningIssues       int     `json:"warningIssues"`
	PipelineStage       string  `json:"pipelineStage"`
	BusinessUnit        string  `json:"businessUnit"`
	ApplicationOwner    string  `json:"applicationOwner"`
	BusinessCriticality string  `json:"businessCriticality"`
	SchemaScope         string  `json:"schemaScope"`
	PreferredAgentZone  string  `json:"preferredAgentZone"`
	CreatedAt           string  `json:"createdAt"`
	UpdatedAt           string  `json:"updatedAt"`
}

type Connection struct {
	EnvironmentID   string                 `json:"environmentId"`
	TenantID        string                 `json:"tenantId"`
	ProjectID       string                 `json:"projectId"`
	EnvironmentName string                 `json:"environmentName"`
	EnvironmentType string                 `json:"environmentType"`
	Status          string                 `json:"status"`
	CloudProvider   string                 `json:"cloudProvider"`
	RegionName      string                 `json:"regionName"`
	NetworkZone     string                 `json:"networkZone"`
	Settings        map[string]interface{} `json:"settingsJson"`
	CreatedAt       string                 `json:"createdAt"`
	UpdatedAt       string                 `json:"updatedAt"`
}

type AgentPool struct {
	AgentPoolID  string   `json:"agentPoolId"`
	TenantID     string   `json:"tenantId"`
	PoolName     string   `json:"poolName"`
	PoolType     string   `json:"poolType"`
	RegionName   string   `json:"regionName"`
	Status       string   `json:"status"`
	Capabilities []string `json:"capabilities"`
	CreatedAt    string   `json:"createdAt"`
	UpdatedAt    string   `json:"updatedAt"`
}

type Agent struct {
	AgentID         string   `json:"agentId"`
	TenantID        string   `json:"tenantId"`
	AgentPoolID     string   `json:"agentPoolId"`
	AgentName       string   `json:"agentName"`
	AgentVersion    string   `json:"agentVersion"`
	PlatformType    string   `json:"platformType"`
	RuntimeMode     string   `json:"runtimeMode"`
	Status          string   `json:"status"`
	RegisteredAt    string   `json:"registeredAt"`
	LastHeartbeatAt string   `json:"lastHeartbeatAt,omitempty"`
	Capabilities    []string `json:"capabilities"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
}

type AgentHeartbeat struct {
	HeartbeatID    string                 `json:"heartbeatId"`
	TenantID       string                 `json:"tenantId"`
	AgentID        string                 `json:"agentId"`
	HeartbeatAt    string                 `json:"heartbeatAt"`
	HealthStatus   string                 `json:"healthStatus"`
	ActiveJobCount int                    `json:"activeJobCount"`
	Metrics        map[string]interface{} `json:"metricsJson"`
	CreatedAt      string                 `json:"createdAt"`
}

type Workflow struct {
	WorkflowRunID string `json:"workflowRunId"`
	TenantID      string `json:"tenantId"`
	ProjectID     string `json:"projectId"`
	WorkflowType  string `json:"workflowType"`
	Status        string `json:"status"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

type Job struct {
	JobRunID           string                 `json:"jobRunId"`
	TenantID           string                 `json:"tenantId"`
	ProjectID          string                 `json:"projectId"`
	WorkflowRunID      string                 `json:"workflowRunId"`
	JobType            string                 `json:"jobType"`
	JobVersion         string                 `json:"jobVersion"`
	Status             string                 `json:"status"`
	Priority           string                 `json:"priority"`
	CapabilityRequired string                 `json:"capabilityRequired"`
	LeaseExpiresAt     string                 `json:"leaseExpiresAt,omitempty"`
	LeasedToAgentID    string                 `json:"leasedToAgentId,omitempty"`
	AttemptCount       int                    `json:"attemptCount"`
	MaxAttempts        int                    `json:"maxAttempts"`
	Payload            map[string]interface{} `json:"payload"`
	Result             map[string]interface{} `json:"result,omitempty"`
	Failure            map[string]interface{} `json:"failure,omitempty"`
	StartedAt          string                 `json:"startedAt,omitempty"`
	CompletedAt        string                 `json:"completedAt,omitempty"`
	CreatedAt          string                 `json:"createdAt"`
	UpdatedAt          string                 `json:"updatedAt"`
}

type JobCheckpoint struct {
	CheckpointID    string                 `json:"checkpointId"`
	TenantID        string                 `json:"tenantId"`
	JobRunID        string                 `json:"jobRunId"`
	CheckpointType  string                 `json:"checkpointType"`
	CheckpointKey   string                 `json:"checkpointKey"`
	CheckpointState map[string]interface{} `json:"checkpointState"`
	CapturedAt      string                 `json:"capturedAt"`
	CreatedAt       string                 `json:"createdAt"`
}

type StateTransition struct {
	EventID    string                 `json:"eventId"`
	TenantID   string                 `json:"tenantId"`
	EntityType string                 `json:"entityType"`
	EntityID   string                 `json:"entityId"`
	FromStatus string                 `json:"fromStatus,omitempty"`
	ToStatus   string                 `json:"toStatus"`
	ReasonCode string                 `json:"reasonCode,omitempty"`
	Details    map[string]interface{} `json:"detailsJson"`
	OccurredAt string                 `json:"occurredAt"`
}

func main() {
	port := getenv("SYNQORA_PORT", "8787")
	host := getenv("SYNQORA_HOST", "127.0.0.1")
	server := &Server{
		store:    NewStore(),
		sessions: map[string]Session{},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", server.handleHealth)
	mux.HandleFunc("/api/v1/auth/session", server.handleSession)
	mux.HandleFunc("/api/v1/auth/login", server.handleLogin)
	mux.HandleFunc("/api/v1/auth/signup", server.handleSignup)
	mux.HandleFunc("/api/v1/auth/logout", server.handleLogout)
	mux.HandleFunc("/api/v1/dashboard", server.withAuth(server.handleDashboard))
	mux.HandleFunc("/api/v1/projects", server.withAuth(server.handleProjects))
	mux.HandleFunc("/api/v1/connections", server.withAuth(server.handleConnections))
	mux.HandleFunc("/api/v1/projects/", server.withAuth(server.handleProjectRoutes))
	mux.HandleFunc("/api/v1/agents", server.withAuth(server.handleAgents))
	mux.HandleFunc("/api/v1/jobs", server.withAuth(server.handleJobs))
	mux.HandleFunc("/api/v1/agent/register", server.handleAgentRegister)
	mux.HandleFunc("/api/v1/agent/heartbeat", server.withAgent(server.handleAgentHeartbeat))
	mux.HandleFunc("/api/v1/agent/jobs/poll", server.withAgent(server.handleAgentJobsPoll))
	mux.HandleFunc("/api/v1/agent/jobs/", server.withAgent(server.handleAgentJobRoutes))

	addr := host + ":" + port
	log.Printf("Synqora Go API listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}

func NewStore() *Store {
	now := nowISO()
	tenant := Tenant{
		TenantID:       newID("tenant"),
		Name:           demoTenantName,
		Slug:           "synqora-demo",
		Status:         "active",
		DeploymentTier: "saas_standard",
		RegionHome:     "us-east-1",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	user := User{
		UserID:      newID("user"),
		Email:       demoEmail,
		DisplayName: "Sai Endla",
		Status:      "active",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	agentPool := AgentPool{
		AgentPoolID:  newID("agentpool"),
		TenantID:     tenant.TenantID,
		PoolName:     "customer-prod-east",
		PoolType:     "shared",
		RegionName:   "us-east-1",
		Status:       "active",
		Capabilities: defaultCapabilities(),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	return &Store{
		tenants:     []Tenant{tenant},
		users:       []User{user},
		credentials: map[string]string{demoEmail: hashPassword(demoPassword)},
		userTenant:  map[string]string{demoEmail: tenant.TenantID},
		userRole:    map[string]string{demoEmail: "admin"},
		projects:    []Project{},
		connections: []Connection{},
		agentPools:  []AgentPool{agentPool},
		agentTokens: map[string]string{demoAgentToken: agentPool.AgentPoolID},
		agents:      []Agent{},
		heartbeats:  []AgentHeartbeat{},
		workflows:   []Workflow{},
		jobs:        []Job{},
		checkpoints: []JobCheckpoint{},
		transitions: []StateTransition{},
	}
}

func (s *Store) Authenticate(email, password string) (AuthContext, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalized := strings.ToLower(strings.TrimSpace(email))
	hash, ok := s.credentials[normalized]
	if !ok || subtle.ConstantTimeCompare([]byte(hash), []byte(hashPassword(password))) != 1 {
		return AuthContext{}, errors.New("invalid email or password")
	}
	for _, user := range s.users {
		if strings.EqualFold(user.Email, normalized) {
			tenant, ok := s.findTenantByID(s.userTenant[normalized])
			if !ok {
				return AuthContext{}, errors.New("tenant membership not found")
			}
			return AuthContext{User: user, Tenant: tenant, Role: firstNonEmpty(s.userRole[normalized], "member")}, nil
		}
	}
	return AuthContext{}, errors.New("invalid email or password")
}

func (s *Store) Signup(input map[string]string) (AuthContext, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	email := strings.ToLower(strings.TrimSpace(input["email"]))
	password := input["password"]
	if email == "" || len(password) < 8 {
		return AuthContext{}, errors.New("a valid email and password with at least 8 characters are required")
	}
	if _, exists := s.credentials[email]; exists {
		return AuthContext{}, errors.New("an account with this email already exists")
	}

	now := nowISO()
	displayName := strings.TrimSpace(input["displayName"])
	if displayName == "" {
		displayName = strings.Split(email, "@")[0]
	}
	orgName := strings.TrimSpace(input["organizationName"])
	if orgName == "" {
		orgName = displayName + "'s Organization"
	}

	tenant := Tenant{
		TenantID:       newID("tenant"),
		Name:           orgName,
		Slug:           slugify(orgName),
		Status:         "active",
		DeploymentTier: "saas_trial",
		RegionHome:     "us-east-1",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	user := User{UserID: newID("user"), Email: email, DisplayName: displayName, Status: "active", CreatedAt: now, UpdatedAt: now}

	s.tenants = append(s.tenants, tenant)
	s.users = append(s.users, user)
	s.credentials[email] = hashPassword(password)
	s.userTenant[email] = tenant.TenantID
	s.userRole[email] = "owner"
	return AuthContext{User: user, Tenant: tenant, Role: "owner"}, nil
}

func (s *Store) Dashboard(ctx AuthContext) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	projects := s.tenantProjects(ctx.Tenant.TenantID)
	jobs := s.tenantJobs(ctx.Tenant.TenantID)
	connections := s.tenantConnections(ctx.Tenant.TenantID)
	discovered := 0
	converted := 0
	dataTB := 0.0
	for _, project := range projects {
		discovered += project.DiscoveredObjects
		converted += project.ConversionRatePct
		dataTB += project.DataMigratedTB
	}
	avgConversion := 0
	if len(projects) > 0 {
		avgConversion = converted / len(projects)
	}
	return map[string]interface{}{
		"tenant": ctx.Tenant,
		"summary": map[string]interface{}{
			"activeProjects":           len(projects),
			"discoveredObjects":        discovered,
			"averageConversionRatePct": avgConversion,
			"dataMigratedTb":           dataTB,
			"queuedJobs":               countJobs(jobs, "queued"),
			"runningJobs":              countJobs(jobs, "running"),
			"databaseConnections":      len(connections),
			"sourceConnections":        countConnections(connections, "source"),
			"targetConnections":        countConnections(connections, "target"),
		},
		"projects":    projects,
		"jobs":        jobs,
		"connections": connections,
	}
}

func (s *Store) ListProjects(ctx AuthContext) []Project {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.tenantProjects(ctx.Tenant.TenantID)
}

func (s *Store) ListAgents(ctx AuthContext) []Agent {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := []Agent{}
	for _, agent := range s.agents {
		if agent.TenantID == ctx.Tenant.TenantID && agent.Status != "retired" {
			items = append(items, agent)
		}
	}
	return items
}

func (s *Store) ListJobs(ctx AuthContext) []Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.tenantJobs(ctx.Tenant.TenantID)
}

func (s *Store) CreateProject(ctx AuthContext, input map[string]interface{}) (Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	code := strings.TrimSpace(stringValue(input, "projectCode"))
	name := strings.TrimSpace(firstNonEmpty(stringValue(input, "name"), stringValue(input, "projectName")))
	if code == "" || name == "" {
		return Project{}, errors.New("project code and project name are required")
	}

	now := nowISO()
	mode := normalizeMode(firstNonEmpty(stringValue(input, "engagementMode"), stringValue(input, "projectMode"), "assessment"))
	project := Project{
		ProjectID:           newID("project"),
		TenantID:            ctx.Tenant.TenantID,
		ProjectCode:         code,
		Name:                name,
		Description:         firstNonEmpty(stringValue(input, "description"), stringValue(input, "primaryAssessmentGoal"), "Oracle source assessment project."),
		Status:              "draft",
		SourceEngine:        "oracle",
		TargetEngine:        "not_selected",
		EngagementMode:      mode,
		DeploymentMode:      "saas_standard",
		OwnerUserID:         ctx.User.UserID,
		PipelineStage:       "connectivity",
		BusinessUnit:        firstNonEmpty(stringValue(input, "businessUnit"), "Unassigned"),
		ApplicationOwner:    stringValue(input, "applicationOwner"),
		BusinessCriticality: stringValue(input, "businessCriticality"),
		SchemaScope:         stringValue(input, "schemaScope"),
		PreferredAgentZone:  stringValue(input, "preferredAgentZone"),
		CreatedAt:           now,
		UpdatedAt:           now,
	}
	s.projects = append(s.projects, project)
	s.recordTransitionLocked(ctx.Tenant.TenantID, "migration_project", project.ProjectID, "", "draft", "project_created", map[string]interface{}{
		"projectCode":    code,
		"engagementMode": mode,
	})
	return project, nil
}

func (s *Store) CreateConnection(ctx AuthContext, input map[string]interface{}) (map[string]interface{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	project, index, err := s.findProject(ctx.Tenant.TenantID, stringValue(input, "projectId"))
	if err != nil {
		return nil, err
	}

	role := firstNonEmpty(stringValue(input, "connectionRole"), "source_assessment")
	isSource := !strings.HasPrefix(role, "target")
	host := strings.TrimSpace(stringValue(input, "host"))
	port := firstNonEmpty(stringValue(input, "port"), func() string {
		if isSource {
			return "1521"
		}
		return "5432"
	}())
	serviceName := strings.TrimSpace(stringValue(input, "serviceName"))
	if host == "" || serviceName == "" {
		return nil, errors.New("host and service/database name are required")
	}

	now := nowISO()
	engine := firstNonEmpty(stringValue(input, "engine"), "Oracle 19c")
	connection := Connection{
		EnvironmentID:   newID("env"),
		TenantID:        ctx.Tenant.TenantID,
		ProjectID:       project.ProjectID,
		EnvironmentName: fmt.Sprintf("%s-%s", project.ProjectCode, map[bool]string{true: "oracle-source", false: "postgres-target"}[isSource]),
		EnvironmentType: map[bool]string{true: "source", false: "target"}[isSource],
		Status:          "pending_validation",
		CloudProvider:   firstNonEmpty(stringValue(input, "cloudProvider"), "onprem"),
		NetworkZone:     firstNonEmpty(stringValue(input, "agentNetworkZone"), stringValue(input, "preferredAgentZone")),
		Settings: map[string]interface{}{
			"engineVersion":            engine,
			"host":                     host + ":" + port,
			"hostName":                 host,
			"port":                     port,
			"serviceName":              serviceName,
			"schemaScope":              splitCSV(stringValue(input, "schemaScope")),
			"credentialReference":      stringValue(input, "credentialReference"),
			"connectionRole":           role,
			"validationMode":           "agent_executed",
			"storesRawPasswordInCloud": false,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.connections = append(s.connections, connection)
	s.recordTransitionLocked(ctx.Tenant.TenantID, "environment", connection.EnvironmentID, "", "pending_validation", "connection_profile_created", map[string]interface{}{
		"projectId":      project.ProjectID,
		"connectionRole": role,
	})

	project.Status = "connection_pending"
	project.PipelineStage = "connectivity"
	project.UpdatedAt = now
	s.projects[index] = project

	var assessment interface{}
	if boolValue(input, "startAssessment") {
		assessment = s.startOracleAssessmentLocked(ctx, project, connection)
	}
	return map[string]interface{}{"connection": connection, "project": project, "assessment": assessment}, nil
}

func (s *Store) ProjectOverview(ctx AuthContext, projectID string) (map[string]interface{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	project, _, err := s.findProject(ctx.Tenant.TenantID, projectID)
	if err != nil {
		return nil, err
	}
	var source *Connection
	var target *Connection
	for index, connection := range s.connections {
		if connection.ProjectID != projectID {
			continue
		}
		if connection.EnvironmentType == "source" && source == nil {
			source = &s.connections[index]
		}
		if connection.EnvironmentType == "target" && target == nil {
			target = &s.connections[index]
		}
	}
	projectJobs := []Job{}
	for _, job := range s.jobs {
		if job.ProjectID == projectID {
			projectJobs = append(projectJobs, job)
		}
	}
	return map[string]interface{}{
		"project":           project,
		"sourceEnvironment": source,
		"targetEnvironment": target,
		"jobs":              projectJobs,
		"agents":            []interface{}{},
		"summary": map[string]interface{}{
			"sourceEngineLabel": "Oracle",
			"targetEngineLabel": humanizeEngine(project.TargetEngine),
			"modeLabel":         humanizeMode(project.EngagementMode),
			"activeStageLabel":  humanizeStage(project.PipelineStage),
			"completionPct":     pipelineProgress(project.PipelineStage),
			"criticalIssues":    project.CriticalIssues,
			"warningIssues":     project.WarningIssues,
			"startedAt":         project.CreatedAt,
		},
		"pipeline": buildPipeline(project.PipelineStage, project.Status),
	}, nil
}

func (s *Store) RegisterAgent(input map[string]interface{}) (map[string]interface{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	registrationToken := strings.TrimSpace(stringValue(input, "registrationToken"))
	agentPoolID, ok := s.agentTokens[registrationToken]
	if registrationToken == "" || !ok {
		return nil, errors.New("registration token is invalid, expired, or exhausted")
	}
	var pool AgentPool
	for _, item := range s.agentPools {
		if item.AgentPoolID == agentPoolID && item.Status == "active" {
			pool = item
			break
		}
	}
	if pool.AgentPoolID == "" {
		return nil, errors.New("agent pool is not active")
	}

	now := nowISO()
	capabilities := stringSliceValue(input["capabilities"])
	if len(capabilities) == 0 {
		capabilities = append([]string{}, pool.Capabilities...)
	}
	agentID := newID("agent")
	accessToken := newID("synqora_agent")
	agent := Agent{
		AgentID:      agentID,
		TenantID:     pool.TenantID,
		AgentPoolID:  pool.AgentPoolID,
		AgentName:    firstNonEmpty(stringValue(input, "agentName"), "agent-"+agentID[len(agentID)-8:]),
		AgentVersion: firstNonEmpty(stringValue(input, "agentVersion"), "0.1.0"),
		PlatformType: firstNonEmpty(stringValue(input, "platformType"), "unknown"),
		RuntimeMode:  firstNonEmpty(stringValue(input, "runtimeMode"), "docker"),
		Status:       "active",
		RegisteredAt: now,
		Capabilities: capabilities,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.agents = append(s.agents, agent)
	s.agentTokens[accessToken] = agent.AgentID
	s.recordTransitionLocked(agent.TenantID, "agent_instance", agent.AgentID, "", "active", "agent_registered", map[string]interface{}{
		"agentPoolId": agent.AgentPoolID,
	})

	return map[string]interface{}{
		"agent":                    agent,
		"accessToken":              accessToken,
		"pollIntervalSeconds":      10,
		"heartbeatIntervalSeconds": 30,
	}, nil
}

func (s *Store) AuthenticateAgent(accessToken string) (Agent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	agentID, ok := s.agentTokens[strings.TrimSpace(accessToken)]
	if !ok || agentID == "" {
		return Agent{}, errors.New("missing or invalid agent access token")
	}
	for _, agent := range s.agents {
		if agent.AgentID == agentID && agent.Status == "active" {
			return agent, nil
		}
	}
	return Agent{}, errors.New("agent is not active")
}

func (s *Store) HeartbeatAgent(agent Agent, input map[string]interface{}) (AgentHeartbeat, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index, ok := s.findAgentIndexLocked(agent.AgentID)
	if !ok {
		return AgentHeartbeat{}, errors.New("agent not found")
	}
	now := nowISO()
	activeJobs := 0
	for _, job := range s.jobs {
		if job.LeasedToAgentID == agent.AgentID && (job.Status == "leased" || job.Status == "running") {
			activeJobs++
		}
	}
	heartbeat := AgentHeartbeat{
		HeartbeatID:    newID("heartbeat"),
		TenantID:       agent.TenantID,
		AgentID:        agent.AgentID,
		HeartbeatAt:    now,
		HealthStatus:   firstNonEmpty(stringValue(input, "healthStatus"), "healthy"),
		ActiveJobCount: activeJobs,
		Metrics:        mapValue(input, "metrics"),
		CreatedAt:      now,
	}
	s.heartbeats = append(s.heartbeats, heartbeat)
	s.agents[index].LastHeartbeatAt = now
	s.agents[index].UpdatedAt = now
	return heartbeat, nil
}

func (s *Store) PollJobs(agent Agent, maxJobs int) []Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	if maxJobs <= 0 || maxJobs > 10 {
		maxJobs = 1
	}
	now := nowISO()
	leaseExpiresAt := time.Now().UTC().Add(5 * time.Minute).Format(time.RFC3339Nano)
	jobs := []Job{}
	for index, job := range s.jobs {
		if len(jobs) >= maxJobs {
			break
		}
		if job.TenantID != agent.TenantID || job.Status != "queued" || !contains(agent.Capabilities, job.CapabilityRequired) {
			continue
		}
		previousStatus := job.Status
		job.Status = "leased"
		job.LeasedToAgentID = agent.AgentID
		job.LeaseExpiresAt = leaseExpiresAt
		job.AttemptCount++
		job.UpdatedAt = now
		s.jobs[index] = job
		s.recordTransitionLocked(job.TenantID, "job_run", job.JobRunID, previousStatus, "leased", "job_leased", map[string]interface{}{
			"agentId": agent.AgentID,
		})
		jobs = append(jobs, job)
	}
	return jobs
}

func (s *Store) StartJob(agent Agent, jobRunID string) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index, err := s.assertAgentJobLocked(agent, jobRunID, "leased")
	if err != nil {
		return Job{}, err
	}
	job := s.jobs[index]
	previousStatus := job.Status
	now := nowISO()
	job.Status = "running"
	job.StartedAt = firstNonEmpty(job.StartedAt, now)
	job.UpdatedAt = now
	s.jobs[index] = job
	s.recordTransitionLocked(job.TenantID, "job_run", job.JobRunID, previousStatus, "running", "job_started", map[string]interface{}{"agentId": agent.AgentID})
	return job, nil
}

func (s *Store) CheckpointJob(agent Agent, jobRunID string, input map[string]interface{}) (JobCheckpoint, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index, err := s.assertAgentJobLocked(agent, jobRunID, "running")
	if err != nil {
		return JobCheckpoint{}, err
	}
	now := nowISO()
	checkpoint := JobCheckpoint{
		CheckpointID:    newID("checkpoint"),
		TenantID:        agent.TenantID,
		JobRunID:        jobRunID,
		CheckpointType:  firstNonEmpty(stringValue(input, "checkpointType"), "progress"),
		CheckpointKey:   firstNonEmpty(stringValue(input, "checkpointKey"), fmt.Sprintf("%s:%d", s.jobs[index].JobType, time.Now().Unix())),
		CheckpointState: mapValue(input, "checkpointState"),
		CapturedAt:      now,
		CreatedAt:       now,
	}
	s.checkpoints = append(s.checkpoints, checkpoint)
	s.jobs[index].LeaseExpiresAt = time.Now().UTC().Add(5 * time.Minute).Format(time.RFC3339Nano)
	s.jobs[index].UpdatedAt = now
	return checkpoint, nil
}

func (s *Store) CompleteJob(agent Agent, jobRunID string, input map[string]interface{}) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index, err := s.assertAgentJobLocked(agent, jobRunID, "running")
	if err != nil {
		return Job{}, err
	}
	job := s.jobs[index]
	previousStatus := job.Status
	now := nowISO()
	job.Status = "succeeded"
	job.Result = mapValueOrWhole(input, "result")
	job.CompletedAt = now
	job.UpdatedAt = now
	s.jobs[index] = job
	s.recordTransitionLocked(job.TenantID, "job_run", job.JobRunID, previousStatus, "succeeded", "job_completed", map[string]interface{}{"agentId": agent.AgentID})
	s.enqueueFollowUpJobsLocked(job)
	return job, nil
}

func (s *Store) FailJob(agent Agent, jobRunID string, input map[string]interface{}) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index, err := s.assertAgentJobLocked(agent, jobRunID, "running")
	if err != nil {
		return Job{}, err
	}
	job := s.jobs[index]
	previousStatus := job.Status
	now := nowISO()
	job.Status = "failed"
	job.Failure = mapValueOrWhole(input, "failure")
	job.CompletedAt = now
	job.UpdatedAt = now
	s.jobs[index] = job
	s.recordTransitionLocked(job.TenantID, "job_run", job.JobRunID, previousStatus, "failed", "job_failed", map[string]interface{}{"agentId": agent.AgentID})
	return job, nil
}

func (s *Store) startOracleAssessmentLocked(ctx AuthContext, project Project, source Connection) map[string]interface{} {
	now := nowISO()
	workflow := Workflow{
		WorkflowRunID: newID("workflow"),
		TenantID:      ctx.Tenant.TenantID,
		ProjectID:     project.ProjectID,
		WorkflowType:  "oracle_assessment",
		Status:        "queued",
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	job := Job{
		JobRunID:           newID("job"),
		TenantID:           ctx.Tenant.TenantID,
		ProjectID:          project.ProjectID,
		WorkflowRunID:      workflow.WorkflowRunID,
		JobType:            "validate_oracle_connection",
		JobVersion:         "v1",
		Status:             "queued",
		Priority:           "high",
		CapabilityRequired: "connectivity",
		MaxAttempts:        3,
		Payload: map[string]interface{}{
			"sourceEnvironmentId": source.EnvironmentID,
			"host":                source.Settings["host"],
			"serviceName":         source.Settings["serviceName"],
			"schemaScope":         source.Settings["schemaScope"],
			"credentialReference": source.Settings["credentialReference"],
			"validations":         []string{"network_reachability", "authentication_reference", "least_privilege", "dictionary_access"},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.workflows = append(s.workflows, workflow)
	s.jobs = append(s.jobs, job)
	for index, item := range s.projects {
		if item.ProjectID == project.ProjectID {
			item.Status = "assessment_queued"
			item.PipelineStage = "connectivity"
			item.UpdatedAt = now
			s.projects[index] = item
			project = item
			break
		}
	}
	return map[string]interface{}{"workflowRunId": workflow.WorkflowRunID, "jobs": []Job{job}, "project": project}
}

func (s *Store) tenantProjects(tenantID string) []Project {
	items := []Project{}
	for _, project := range s.projects {
		if project.TenantID == tenantID && project.Status != "archived" {
			items = append(items, project)
		}
	}
	return items
}

func (s *Store) tenantJobs(tenantID string) []Job {
	items := []Job{}
	for _, job := range s.jobs {
		if job.TenantID == tenantID {
			items = append(items, job)
		}
	}
	return items
}

func (s *Store) tenantConnections(tenantID string) []Connection {
	items := []Connection{}
	for _, connection := range s.connections {
		if connection.TenantID == tenantID {
			items = append(items, connection)
		}
	}
	return items
}

func (s *Store) findProject(tenantID, projectID string) (Project, int, error) {
	for index, project := range s.projects {
		if project.ProjectID == projectID && project.TenantID == tenantID {
			return project, index, nil
		}
	}
	return Project{}, -1, errors.New("project not found")
}

func (s *Store) findTenantByID(tenantID string) (Tenant, bool) {
	for _, tenant := range s.tenants {
		if tenant.TenantID == tenantID {
			return tenant, true
		}
	}
	return Tenant{}, false
}

func (s *Store) findAgentIndexLocked(agentID string) (int, bool) {
	for index, agent := range s.agents {
		if agent.AgentID == agentID {
			return index, true
		}
	}
	return -1, false
}

func (s *Store) assertAgentJobLocked(agent Agent, jobRunID, expectedStatus string) (int, error) {
	for index, job := range s.jobs {
		if job.JobRunID != jobRunID {
			continue
		}
		if job.TenantID != agent.TenantID {
			return -1, errors.New("job not found")
		}
		if job.LeasedToAgentID != agent.AgentID {
			return -1, errors.New("job is not leased to this agent")
		}
		if job.Status != expectedStatus {
			return -1, fmt.Errorf("job must be %s before this action", expectedStatus)
		}
		return index, nil
	}
	return -1, errors.New("job not found")
}

func (s *Store) enqueueFollowUpJobsLocked(completedJob Job) {
	nextType := map[string]string{
		"validate_oracle_connection": "discover_source_inventory",
		"discover_source_inventory":  "assess_oracle_migration_risk",
	}[completedJob.JobType]
	if nextType == "" {
		return
	}
	now := nowISO()
	job := Job{
		JobRunID:           newID("job"),
		TenantID:           completedJob.TenantID,
		ProjectID:          completedJob.ProjectID,
		WorkflowRunID:      completedJob.WorkflowRunID,
		JobType:            nextType,
		JobVersion:         "v1",
		Status:             "queued",
		Priority:           completedJob.Priority,
		CapabilityRequired: capabilityForJob(nextType),
		MaxAttempts:        3,
		Payload: map[string]interface{}{
			"parentJobRunId":      completedJob.JobRunID,
			"projectId":           completedJob.ProjectID,
			"sourceEnvironmentId": completedJob.Payload["sourceEnvironmentId"],
			"schemaScope":         completedJob.Payload["schemaScope"],
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.jobs = append(s.jobs, job)
	s.recordTransitionLocked(job.TenantID, "job_run", job.JobRunID, "", "queued", "follow_up_job_queued", map[string]interface{}{
		"parentJobRunId": completedJob.JobRunID,
	})
	for index, project := range s.projects {
		if project.ProjectID != completedJob.ProjectID || project.TenantID != completedJob.TenantID {
			continue
		}
		if nextType == "discover_source_inventory" {
			project.PipelineStage = "discovery"
			project.Status = "discovery_queued"
		}
		if nextType == "assess_oracle_migration_risk" {
			project.PipelineStage = "assessment"
			project.Status = "assessment_running"
		}
		project.UpdatedAt = now
		s.projects[index] = project
	}
}

func (s *Store) recordTransitionLocked(tenantID, entityType, entityID, fromStatus, toStatus, reasonCode string, details map[string]interface{}) {
	s.transitions = append(s.transitions, StateTransition{
		EventID:    newID("event"),
		TenantID:   tenantID,
		EntityType: entityType,
		EntityID:   entityID,
		FromStatus: fromStatus,
		ToStatus:   toStatus,
		ReasonCode: reasonCode,
		Details:    details,
		OccurredAt: nowISO(),
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "service": "synqora-api-go", "version": "0.2.0", "time": nowISO()})
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	ctx, ok := s.sessionContext(r)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]interface{}{"authenticated": false, "demoLogin": map[string]string{"email": demoEmail, "password": demoPassword}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"authenticated": true, "user": ctx.User, "tenant": ctx.Tenant, "role": ctx.Role})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var input map[string]string
	if err := readJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	ctx, err := s.store.Authenticate(input["email"], input["password"])
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	s.createSession(w, ctx)
	writeJSON(w, http.StatusOK, map[string]interface{}{"authenticated": true, "user": ctx.User, "tenant": ctx.Tenant, "role": ctx.Role})
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var input map[string]string
	if err := readJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	ctx, err := s.store.Signup(input)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	s.createSession(w, ctx)
	writeJSON(w, http.StatusOK, map[string]interface{}{"authenticated": true, "user": ctx.User, "tenant": ctx.Tenant, "role": ctx.Role})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		s.mu.Lock()
		delete(s.sessions, cookie.Value)
		s.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
}

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request, ctx AuthContext) {
	writeJSON(w, http.StatusOK, s.store.Dashboard(ctx))
}

func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request, ctx AuthContext) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]interface{}{"projects": s.store.ListProjects(ctx)})
	case http.MethodPost:
		var input map[string]interface{}
		if err := readJSON(r, &input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		project, err := s.store.CreateProject(ctx, input)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, map[string]Project{"project": project})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) handleConnections(w http.ResponseWriter, r *http.Request, ctx AuthContext) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var input map[string]interface{}
	if err := readJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	payload, err := s.store.CreateConnection(ctx, input)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, payload)
}

func (s *Server) handleAgents(w http.ResponseWriter, r *http.Request, ctx AuthContext) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"agents": s.store.ListAgents(ctx)})
}

func (s *Server) handleJobs(w http.ResponseWriter, r *http.Request, ctx AuthContext) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"jobs": s.store.ListJobs(ctx)})
}

func (s *Server) handleAgentRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var input map[string]interface{}
	if err := readJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	payload, err := s.store.RegisterAgent(input)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, payload)
}

func (s *Server) handleAgentHeartbeat(w http.ResponseWriter, r *http.Request, agent Agent) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var input map[string]interface{}
	if err := readJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	heartbeat, err := s.store.HeartbeatAgent(agent, input)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"heartbeat": heartbeat, "agent": agent})
}

func (s *Server) handleAgentJobsPoll(w http.ResponseWriter, r *http.Request, agent Agent) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var input map[string]interface{}
	if err := readJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"jobs": s.store.PollJobs(agent, intValue(input, "maxJobs"))})
}

func (s *Server) handleAgentJobRoutes(w http.ResponseWriter, r *http.Request, agent Agent) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/agent/jobs/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) != 2 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	jobRunID, action := parts[0], parts[1]
	var input map[string]interface{}
	if err := readJSON(r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	switch action {
	case "start":
		job, err := s.store.StartJob(agent, jobRunID)
		writeJobOrError(w, job, err)
	case "checkpoint":
		checkpoint, err := s.store.CheckpointJob(agent, jobRunID, input)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"checkpoint": checkpoint})
	case "complete":
		job, err := s.store.CompleteJob(agent, jobRunID, input)
		writeJobOrError(w, job, err)
	case "fail":
		job, err := s.store.FailJob(agent, jobRunID, input)
		writeJobOrError(w, job, err)
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (s *Server) handleProjectRoutes(w http.ResponseWriter, r *http.Request, ctx AuthContext) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/projects/")
	if strings.HasSuffix(path, "/overview") && r.Method == http.MethodGet {
		projectID := strings.TrimSuffix(path, "/overview")
		projectID = strings.TrimSuffix(projectID, "/")
		payload, err := s.store.ProjectOverview(ctx, projectID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func (s *Server) withAuth(next func(http.ResponseWriter, *http.Request, AuthContext)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, ok := s.sessionContext(r)
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		next(w, r, ctx)
	}
}

func (s *Server) withAgent(next func(http.ResponseWriter, *http.Request, Agent)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agent, err := s.store.AuthenticateAgent(bearerToken(r))
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}
		next(w, r, agent)
	}
}

func (s *Server) sessionContext(r *http.Request) (AuthContext, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return AuthContext{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[cookie.Value]
	if !ok || time.Now().After(session.ExpiresAt) {
		delete(s.sessions, cookie.Value)
		return AuthContext{}, false
	}
	return session.Context, true
}

func bearerToken(r *http.Request) string {
	value := r.Header.Get("Authorization")
	parts := strings.SplitN(value, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func (s *Server) createSession(w http.ResponseWriter, ctx AuthContext) {
	token := newID("session")
	s.mu.Lock()
	s.sessions[token] = Session{Context: ctx, ExpiresAt: time.Now().Add(8 * time.Hour)}
	s.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: token, Path: "/", MaxAge: int((8 * time.Hour).Seconds()), HttpOnly: true, SameSite: http.SameSiteLaxMode})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://127.0.0.1:5173" || origin == "http://localhost:5173" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func readJSON(r *http.Request, target interface{}) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(target)
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeJobOrError(w http.ResponseWriter, job Job, err error) {
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"job": job})
}

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func newID(prefix string) string {
	bytes := make([]byte, 12)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	return prefix + "_" + hex.EncodeToString(bytes)
}

func hashPassword(password string) string {
	sum := sha256.Sum256([]byte(password))
	return hex.EncodeToString(sum[:])
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func stringValue(input map[string]interface{}, key string) string {
	value, ok := input[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func boolValue(input map[string]interface{}, key string) bool {
	value, ok := input[key]
	if !ok {
		return false
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return strings.EqualFold(typed, "true")
	default:
		return false
	}
}

func intValue(input map[string]interface{}, key string) int {
	value, ok := input[key]
	if !ok {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	case string:
		var output int
		_, _ = fmt.Sscanf(typed, "%d", &output)
		return output
	default:
		return 0
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func stringSliceValue(value interface{}) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []interface{}:
		items := []string{}
		for _, item := range typed {
			if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
				items = append(items, text)
			}
		}
		return items
	case string:
		return splitCSV(typed)
	default:
		return []string{}
	}
}

func mapValue(input map[string]interface{}, key string) map[string]interface{} {
	value, ok := input[key]
	if !ok || value == nil {
		return map[string]interface{}{}
	}
	if typed, ok := value.(map[string]interface{}); ok {
		return typed
	}
	return map[string]interface{}{"value": value}
}

func mapValueOrWhole(input map[string]interface{}, key string) map[string]interface{} {
	if nested := mapValue(input, key); len(nested) > 0 {
		return nested
	}
	if input == nil {
		return map[string]interface{}{}
	}
	return input
}

func contains(items []string, expected string) bool {
	for _, item := range items {
		if item == expected {
			return true
		}
	}
	return false
}

func defaultCapabilities() []string {
	return []string{"connectivity", "discovery", "assessment", "conversion", "deployment", "load", "cdc", "validation"}
}

func capabilityForJob(jobType string) string {
	switch jobType {
	case "validate_oracle_connection":
		return "connectivity"
	case "discover_source_inventory":
		return "discovery"
	case "assess_oracle_migration_risk":
		return "assessment"
	default:
		return "validation"
	}
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	items := []string{}
	for _, part := range parts {
		if item := strings.TrimSpace(part); item != "" {
			items = append(items, item)
		}
	}
	return items
}

func normalizeMode(mode string) string {
	switch strings.ToLower(mode) {
	case "factory", "migration_factory":
		return "migration_factory"
	case "cdc", "migration_cdc":
		return "migration_cdc"
	case "replication", "continuous_replication":
		return "continuous_replication"
	default:
		return "assessment"
	}
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var builder strings.Builder
	previousDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
			previousDash = false
			continue
		}
		if !previousDash {
			builder.WriteRune('-')
			previousDash = true
		}
	}
	return strings.Trim(builder.String(), "-")
}

func countJobs(jobs []Job, status string) int {
	count := 0
	for _, job := range jobs {
		if job.Status == status {
			count++
		}
	}
	return count
}

func countConnections(connections []Connection, environmentType string) int {
	count := 0
	for _, connection := range connections {
		if connection.EnvironmentType == environmentType {
			count++
		}
	}
	return count
}

func humanizeEngine(engine string) string {
	switch strings.ToLower(engine) {
	case "not_selected":
		return "Target TBD"
	case "oracle":
		return "Oracle"
	case "postgresql":
		return "PostgreSQL"
	default:
		return firstNonEmpty(engine, "Unknown")
	}
}

func humanizeMode(mode string) string {
	switch mode {
	case "migration_cdc":
		return "Migration + CDC"
	case "migration_factory":
		return "Migration Factory"
	case "continuous_replication":
		return "Continuous Replication"
	default:
		return "Assessment Only"
	}
}

func humanizeStage(stage string) string {
	labels := map[string]string{
		"connectivity": "Connect",
		"discovery":    "Discover",
		"assessment":   "Assess",
		"conversion":   "Convert",
		"deployment":   "Deploy",
		"data_load":    "Full Load",
		"cdc":          "CDC",
		"validation":   "Validate",
		"cutover":      "Cutover",
	}
	return firstNonEmpty(labels[stage], "Connect")
}

func pipelineProgress(stage string) int {
	order := []string{"connectivity", "discovery", "assessment", "conversion", "deployment", "data_load", "cdc", "validation", "cutover"}
	for index, item := range order {
		if item == stage {
			return int(float64(index+1) / float64(len(order)) * 100)
		}
	}
	return 0
}

func buildPipeline(stage, projectStatus string) []map[string]string {
	order := []struct {
		Key   string
		Label string
	}{
		{"connectivity", "Connect"},
		{"discovery", "Discover"},
		{"assessment", "Assess"},
		{"conversion", "Convert"},
		{"deployment", "Deploy"},
		{"data_load", "Full Load"},
		{"cdc", "CDC"},
		{"validation", "Validate"},
		{"cutover", "Cutover"},
	}
	activeIndex := 0
	for index, item := range order {
		if item.Key == stage {
			activeIndex = index
			break
		}
	}
	pipeline := []map[string]string{}
	for index, item := range order {
		status := "pending"
		if index < activeIndex {
			status = "completed"
		}
		if index == activeIndex {
			status = "active"
		}
		if projectStatus == "completed" {
			status = "completed"
		}
		pipeline = append(pipeline, map[string]string{"key": item.Key, "label": item.Label, "status": status, "timeLabel": strings.Title(status)})
	}
	return pipeline
}
