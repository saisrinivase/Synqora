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
	tenant      Tenant
	users       []User
	credentials map[string]string
	projects    []Project
	connections []Connection
	workflows   []Workflow
	jobs        []Job
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
	AttemptCount       int                    `json:"attemptCount"`
	MaxAttempts        int                    `json:"maxAttempts"`
	Payload            map[string]interface{} `json:"payload"`
	CreatedAt          string                 `json:"createdAt"`
	UpdatedAt          string                 `json:"updatedAt"`
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
	return &Store{
		tenant:      tenant,
		users:       []User{user},
		credentials: map[string]string{demoEmail: hashPassword(demoPassword)},
		projects:    []Project{},
		connections: []Connection{},
		workflows:   []Workflow{},
		jobs:        []Job{},
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
			return AuthContext{User: user, Tenant: s.tenant, Role: "admin"}, nil
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

	s.tenant = tenant
	s.users = append(s.users, user)
	s.credentials[email] = hashPassword(password)
	return AuthContext{User: user, Tenant: tenant, Role: "owner"}, nil
}

func (s *Store) Dashboard(ctx AuthContext) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	projects := s.tenantProjects(ctx.Tenant.TenantID)
	jobs := s.tenantJobs(ctx.Tenant.TenantID)
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
		},
		"projects": projects,
		"jobs":     jobs,
	}
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

func (s *Store) findProject(tenantID, projectID string) (Project, int, error) {
	for index, project := range s.projects {
		if project.ProjectID == projectID && project.TenantID == tenantID {
			return project, index, nil
		}
	}
	return Project{}, -1, errors.New("project not found")
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
		writeJSON(w, http.StatusOK, map[string]interface{}{"projects": s.store.tenantProjects(ctx.Tenant.TenantID)})
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

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
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
