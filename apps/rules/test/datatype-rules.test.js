import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rulesetPath = resolve(__dirname, '../../../rules/oracle_to_postgres_datatypes.v1.json');
const ruleset = JSON.parse(readFileSync(rulesetPath, 'utf8'));

const validAutomationClasses = new Set(['AUTO_SAFE', 'AUTO_REVIEW', 'MANUAL_REQUIRED', 'BLOCKER']);
const validConfidence = new Set(['HIGH', 'MEDIUM', 'LOW']);
const validSeverity = new Set(['INFO', 'WARNING', 'CRITICAL']);

function referenceExists(referenceKey) {
  const [owner, key] = referenceKey.split('.');
  return Boolean(ruleset.officialReferences?.[owner]?.[key]);
}

test('datatype ruleset declares product-grade metadata', () => {
  assert.equal(ruleset.ruleset.id, 'oracle_to_postgres_datatypes');
  assert.equal(ruleset.ruleset.sourceEngine, 'oracle');
  assert.equal(ruleset.ruleset.targetEngine, 'postgresql');
  assert.match(ruleset.ruleset.version, /^\d+\.\d+\.\d+$/);
  assert.ok(ruleset.rules.length >= 25);
});

test('every datatype rule is traceable, classified, and evidence-aware', () => {
  const seenCodes = new Set();

  for (const rule of ruleset.rules) {
    assert.ok(rule.ruleCode, 'ruleCode is required');
    assert.equal(seenCodes.has(rule.ruleCode), false, `duplicate ruleCode ${rule.ruleCode}`);
    seenCodes.add(rule.ruleCode);

    assert.ok(rule.sourcePattern, `${rule.ruleCode} sourcePattern is required`);
    assert.ok(rule.targetType, `${rule.ruleCode} targetType is required`);
    assert.ok(validAutomationClasses.has(rule.automationClass), `${rule.ruleCode} invalid automationClass`);
    assert.ok(validConfidence.has(rule.confidence), `${rule.ruleCode} invalid confidence`);
    assert.ok(validSeverity.has(rule.severity), `${rule.ruleCode} invalid severity`);
    assert.ok(Array.isArray(rule.requiresEvidence), `${rule.ruleCode} requiresEvidence must be an array`);
    assert.ok(rule.requiresEvidence.length > 0, `${rule.ruleCode} must require evidence`);
    assert.ok(Array.isArray(rule.reviewRequiredWhen), `${rule.ruleCode} reviewRequiredWhen must be an array`);
    assert.ok(rule.reviewRequiredWhen.length > 0, `${rule.ruleCode} must define review triggers`);
    assert.ok(rule.recommendation, `${rule.ruleCode} recommendation is required`);
    assert.ok(Array.isArray(rule.referenceKeys), `${rule.ruleCode} referenceKeys must be an array`);
    assert.ok(rule.referenceKeys.length > 0, `${rule.ruleCode} must cite references`);

    for (const referenceKey of rule.referenceKeys) {
      assert.ok(referenceExists(referenceKey), `${rule.ruleCode} missing reference ${referenceKey}`);
    }
  }
});

test('risky datatype families cannot be marked blindly AUTO_SAFE', () => {
  const riskyPatterns = [/NUMBER\(1\)/, /DATE/, /TIMESTAMP WITH LOCAL TIME ZONE/, /ROWID/, /BFILE/, /OBJECT TYPE/, /SDO_GEOMETRY/];

  for (const rule of ruleset.rules) {
    if (riskyPatterns.some((pattern) => pattern.test(rule.sourcePattern))) {
      assert.notEqual(rule.automationClass, 'AUTO_SAFE', `${rule.ruleCode} should require review or manual conversion`);
    }
  }
});

