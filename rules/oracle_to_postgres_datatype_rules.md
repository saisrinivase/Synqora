# Oracle to PostgreSQL Datatype Rules

## Purpose

This folder contains deterministic datatype conversion rules for Synqora.

The goal is not to blindly rewrite Oracle types into PostgreSQL types. The goal is to generate the safest possible PostgreSQL artifact, capture rule-hit evidence, and tell the migration engineer when a mapping is safe, reviewable, manual, or blocking.

## Product Principle

Datatype conversion must be:

- evidence-driven
- versioned
- traceable to official database documentation
- validated against PostgreSQL before deployment
- conservative when behavior differs between Oracle and PostgreSQL

AI can explain or assist, but it must not be the primary datatype conversion engine.

## Automation Classes

- `AUTO_SAFE`
  - deterministic mapping with low semantic risk after syntax validation
- `AUTO_REVIEW`
  - generated mapping is useful, but a migration engineer must approve it
- `MANUAL_REQUIRED`
  - safe conversion requires design input
- `BLOCKER`
  - migration cannot proceed until the issue is resolved

## Why Conservative Rules Matter

Some Oracle types look simple but are not safe to auto-convert without context.

Examples:

- `DATE`
  - Oracle stores date and time without timezone.
  - PostgreSQL `date` is date-only.
  - PostgreSQL `timestamptz` applies timezone semantics.
  - Default rule: `timestamp without time zone`, with review for timezone policy and date-only business columns.

- `NUMBER(1)`
  - Sometimes it means boolean.
  - Sometimes it means a numeric code.
  - Default rule: review data and constraints before mapping to boolean.

- `VARCHAR2(n BYTE)`
  - Oracle can enforce byte length.
  - PostgreSQL `varchar(n)` enforces character length.
  - Default rule: review charset and byte-length needs.

- `BLOB` and `CLOB`
  - SQL type mapping may be simple.
  - Application LOB APIs and streaming behavior may not be simple.
  - Default rule: review application LOB usage.

- `TIMESTAMP WITH LOCAL TIME ZONE`
  - Oracle session-local display behavior is application-visible.
  - Default rule: manual review.

## Rule Lifecycle

1. Add or modify a rule in `oracle_to_postgres_datatypes.v1.json`.
2. Include source pattern, target type, automation class, confidence, severity, evidence requirements, review triggers, recommendation, and reference keys.
3. Add official documentation references when a new reference family is needed.
4. Run tests with `npm test`.
5. Promote rules only after PostgreSQL validation fixtures pass.

## Next Engine Step

The converter should produce a rule-hit record for every converted column:

```json
{
  "object_name": "FINANCE_CORE.TRANSACTIONS.TXN_DATE",
  "rule_code": "DT_TMP_001",
  "source_type": "DATE",
  "target_type": "timestamp without time zone",
  "automation_class": "AUTO_REVIEW",
  "confidence": "HIGH",
  "evidence": {
    "time_component_profile": "unknown",
    "timezone_policy": "not_configured"
  },
  "recommendation": "Confirm whether this is a true timestamp or business date-only field before deployment."
}
```

