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
	if len(jobs) != 1 {
		t.Fatalf("expected 1 queued job, got %d", len(jobs))
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
