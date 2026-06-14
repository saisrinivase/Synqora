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
