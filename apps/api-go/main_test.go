package main

import "testing"

func TestOracleConnectionQueuesAssessment(t *testing.T) {
	store := NewStore()
	ctx, err := store.Authenticate(demoEmail, demoPassword)
	if err != nil {
		t.Fatalf("authenticate demo user: %v", err)
	}

	project, err := store.CreateProject(ctx, map[string]interface{}{
		"projectCode":           "FIN-ORA-001",
		"name":                  "Finance Oracle Assessment",
		"primaryAssessmentGoal": "Oracle compatibility assessment",
	})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	payload, err := store.CreateConnection(ctx, map[string]interface{}{
		"projectId":           project.ProjectID,
		"connectionRole":      "source_assessment",
		"engine":              "Oracle 19c",
		"host":                "oracle.example.internal",
		"port":                "1521",
		"serviceName":         "FINPROD",
		"schemaScope":         "FINANCE_CORE",
		"credentialReference": "vault://finance/oracle/readonly",
		"startAssessment":     true,
	})
	if err != nil {
		t.Fatalf("create connection: %v", err)
	}
	if payload["assessment"] == nil {
		t.Fatalf("expected assessment payload")
	}

	dashboard := store.Dashboard(ctx)
	jobs := dashboard["jobs"].([]Job)
	connections := dashboard["connections"].([]Connection)
	summary := dashboard["summary"].(map[string]interface{})
	if len(jobs) != 1 {
		t.Fatalf("expected 1 queued job, got %d", len(jobs))
	}
	if len(connections) != 1 {
		t.Fatalf("expected 1 database connection, got %d", len(connections))
	}
	if summary["databaseConnections"] != 1 {
		t.Fatalf("expected dashboard database connection count of 1, got %#v", summary["databaseConnections"])
	}
	if jobs[0].JobType != "validate_oracle_connection" {
		t.Fatalf("unexpected job type: %s", jobs[0].JobType)
	}
	if jobs[0].CapabilityRequired != "connectivity" {
		t.Fatalf("unexpected capability: %s", jobs[0].CapabilityRequired)
	}
}

func TestTenantDashboardsAreIsolated(t *testing.T) {
	store := NewStore()
	demoCtx, err := store.Authenticate(demoEmail, demoPassword)
	if err != nil {
		t.Fatalf("authenticate demo user: %v", err)
	}
	customerCtx, err := store.Signup(map[string]string{
		"email":            "owner@customer-a.example",
		"password":         "CustomerA_123",
		"displayName":      "Customer A Owner",
		"organizationName": "Customer A",
	})
	if err != nil {
		t.Fatalf("signup customer: %v", err)
	}

	demoProject, err := store.CreateProject(demoCtx, map[string]interface{}{
		"projectCode": "DEMO-ORA-001",
		"name":        "Demo Oracle Assessment",
	})
	if err != nil {
		t.Fatalf("create demo project: %v", err)
	}
	customerProject, err := store.CreateProject(customerCtx, map[string]interface{}{
		"projectCode": "CUSTA-ORA-001",
		"name":        "Customer A Oracle Assessment",
	})
	if err != nil {
		t.Fatalf("create customer project: %v", err)
	}

	demoDashboard := store.Dashboard(demoCtx)
	customerDashboard := store.Dashboard(customerCtx)

	demoProjects := demoDashboard["projects"].([]Project)
	customerProjects := customerDashboard["projects"].([]Project)
	if len(demoProjects) != 1 || demoProjects[0].ProjectID != demoProject.ProjectID {
		t.Fatalf("demo dashboard leaked or missed projects: %#v", demoProjects)
	}
	if len(customerProjects) != 1 || customerProjects[0].ProjectID != customerProject.ProjectID {
		t.Fatalf("customer dashboard leaked or missed projects: %#v", customerProjects)
	}
	if _, err := store.ProjectOverview(customerCtx, demoProject.ProjectID); err == nil {
		t.Fatalf("customer should not access demo tenant project overview")
	}
}

func TestAgentLifecycleLeasesAndCompletesAssessmentWork(t *testing.T) {
	store := NewStore()
	ctx, err := store.Authenticate(demoEmail, demoPassword)
	if err != nil {
		t.Fatalf("authenticate demo user: %v", err)
	}
	project, err := store.CreateProject(ctx, map[string]interface{}{
		"projectCode": "FIN-ORA-002",
		"name":        "Finance Oracle Assessment",
		"schemaScope": "FINANCE_CORE",
	})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	if _, err := store.CreateConnection(ctx, map[string]interface{}{
		"projectId":           project.ProjectID,
		"connectionRole":      "source_assessment",
		"host":                "oracle.example.internal",
		"serviceName":         "FINPROD",
		"schemaScope":         "FINANCE_CORE",
		"credentialReference": "vault://finance/oracle/readonly",
		"startAssessment":     true,
	}); err != nil {
		t.Fatalf("create connection: %v", err)
	}

	registered, err := store.RegisterAgent(map[string]interface{}{
		"registrationToken": demoAgentToken,
		"agentName":         "customer-east-agent",
		"capabilities":      []interface{}{"connectivity", "discovery", "assessment"},
	})
	if err != nil {
		t.Fatalf("register agent: %v", err)
	}
	agentPayload := registered["agent"].(Agent)
	agent, err := store.AuthenticateAgent(registered["accessToken"].(string))
	if err != nil {
		t.Fatalf("authenticate agent: %v", err)
	}
	if agent.AgentID != agentPayload.AgentID {
		t.Fatalf("authenticated wrong agent: %#v", agent)
	}

	heartbeat, err := store.HeartbeatAgent(agent, map[string]interface{}{"healthStatus": "healthy"})
	if err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	if heartbeat.AgentID != agent.AgentID {
		t.Fatalf("heartbeat agent mismatch")
	}

	jobs := store.PollJobs(agent, 1)
	if len(jobs) != 1 {
		t.Fatalf("expected one leased job, got %d", len(jobs))
	}
	if jobs[0].Status != "leased" || jobs[0].LeasedToAgentID != agent.AgentID {
		t.Fatalf("job was not leased to agent: %#v", jobs[0])
	}
	started, err := store.StartJob(agent, jobs[0].JobRunID)
	if err != nil {
		t.Fatalf("start job: %v", err)
	}
	if started.Status != "running" {
		t.Fatalf("expected running job, got %s", started.Status)
	}
	checkpoint, err := store.CheckpointJob(agent, jobs[0].JobRunID, map[string]interface{}{
		"checkpointType":  "oracle_connection_validation",
		"checkpointKey":   "network:ok",
		"checkpointState": map[string]interface{}{"networkReachable": true, "dictionaryAccess": true},
	})
	if err != nil {
		t.Fatalf("checkpoint job: %v", err)
	}
	if checkpoint.CheckpointType != "oracle_connection_validation" {
		t.Fatalf("unexpected checkpoint: %#v", checkpoint)
	}
	completed, err := store.CompleteJob(agent, jobs[0].JobRunID, map[string]interface{}{"summary": "Oracle connection validated"})
	if err != nil {
		t.Fatalf("complete job: %v", err)
	}
	if completed.Status != "succeeded" {
		t.Fatalf("expected succeeded job, got %s", completed.Status)
	}

	tenantJobs := store.ListJobs(ctx)
	if !hasJobType(tenantJobs, "discover_source_inventory") {
		t.Fatalf("expected discovery follow-up job, got %#v", tenantJobs)
	}
	overview, err := store.ProjectOverview(ctx, project.ProjectID)
	if err != nil {
		t.Fatalf("project overview: %v", err)
	}
	summary := overview["summary"].(map[string]interface{})
	if summary["activeStageLabel"] != "Discover" {
		t.Fatalf("expected project to advance to Discover, got %#v", summary["activeStageLabel"])
	}
}

func TestAgentCapabilitiesAndTenantBoundaryProtectJobs(t *testing.T) {
	store := NewStore()
	demoCtx, err := store.Authenticate(demoEmail, demoPassword)
	if err != nil {
		t.Fatalf("authenticate demo user: %v", err)
	}
	customerCtx, err := store.Signup(map[string]string{
		"email":            "owner@customer-b.example",
		"password":         "CustomerB_123",
		"displayName":      "Customer B Owner",
		"organizationName": "Customer B",
	})
	if err != nil {
		t.Fatalf("signup customer: %v", err)
	}
	demoProject, err := store.CreateProject(demoCtx, map[string]interface{}{"projectCode": "DEMO-002", "name": "Demo Assessment"})
	if err != nil {
		t.Fatalf("create demo project: %v", err)
	}
	if _, err := store.CreateConnection(demoCtx, map[string]interface{}{
		"projectId":       demoProject.ProjectID,
		"host":            "oracle.demo.internal",
		"serviceName":     "DEMO",
		"startAssessment": true,
	}); err != nil {
		t.Fatalf("create demo connection: %v", err)
	}
	customerProject, err := store.CreateProject(customerCtx, map[string]interface{}{"projectCode": "CUSTB-001", "name": "Customer B Assessment"})
	if err != nil {
		t.Fatalf("create customer project: %v", err)
	}
	if _, err := store.CreateConnection(customerCtx, map[string]interface{}{
		"projectId":       customerProject.ProjectID,
		"host":            "oracle.customer.internal",
		"serviceName":     "CUSTB",
		"startAssessment": true,
	}); err != nil {
		t.Fatalf("create customer connection: %v", err)
	}

	registered, err := store.RegisterAgent(map[string]interface{}{
		"registrationToken": demoAgentToken,
		"agentName":         "limited-agent",
		"capabilities":      []interface{}{"discovery"},
	})
	if err != nil {
		t.Fatalf("register agent: %v", err)
	}
	agent, err := store.AuthenticateAgent(registered["accessToken"].(string))
	if err != nil {
		t.Fatalf("authenticate agent: %v", err)
	}
	jobs := store.PollJobs(agent, 5)
	if len(jobs) != 0 {
		t.Fatalf("limited discovery agent should not lease connectivity jobs: %#v", jobs)
	}
	if customerJobs := store.ListJobs(customerCtx); len(customerJobs) != 1 {
		t.Fatalf("customer jobs should remain isolated and queued, got %#v", customerJobs)
	}
}

func hasJobType(jobs []Job, jobType string) bool {
	for _, job := range jobs {
		if job.JobType == jobType {
			return true
		}
	}
	return false
}
