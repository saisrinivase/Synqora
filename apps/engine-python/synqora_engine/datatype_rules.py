from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import re
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class ColumnProfile:
    owner: str
    table_name: str
    column_name: str
    oracle_type: str
    data_precision: Optional[int] = None
    data_scale: Optional[int] = None
    char_used: Optional[str] = None
    char_length: Optional[int] = None
    nullable: bool = True
    distinct_values: Optional[List[str]] = None


@dataclass(frozen=True)
class DatatypeAssessment:
    object_name: str
    source_type: str
    target_type: str
    automation_class: str
    severity: str
    confidence: str
    recommendation: str
    evidence_required: List[str]


@dataclass(frozen=True)
class Ruleset:
    metadata: Dict[str, Any]
    rules: List[Dict[str, Any]]


def load_ruleset(path: str | Path) -> Ruleset:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return Ruleset(metadata=payload["ruleset"], rules=payload["rules"])


def assess_column(profile: ColumnProfile, ruleset: Ruleset) -> DatatypeAssessment:
    rule = _match_rule(profile, ruleset.rules)
    return DatatypeAssessment(
        object_name=f"{profile.owner}.{profile.table_name}.{profile.column_name}",
        source_type=_source_type(profile),
        target_type=rule["targetType"],
        automation_class=rule["automationClass"],
        severity=rule["severity"],
        confidence=rule["confidence"],
        recommendation=rule["recommendation"],
        evidence_required=list(rule.get("requiresEvidence", [])),
    )


def _match_rule(profile: ColumnProfile, rules: List[Dict[str, Any]]) -> Dict[str, Any]:
    normalized = profile.oracle_type.upper().strip()
    precision = profile.data_precision
    scale = profile.data_scale

    if normalized == "NUMBER":
        if precision == 1 and (scale is None or scale == 0):
            return _rule(rules, "DT_NUM_007")
        if precision is None and scale is None:
            return _rule(rules, "DT_NUM_006")
        if scale and scale > 0:
            return _rule(rules, "DT_NUM_005")
        if precision is not None:
            if precision <= 4:
                return _rule(rules, "DT_NUM_001")
            if precision <= 9:
                return _rule(rules, "DT_NUM_002")
            if precision <= 18:
                return _rule(rules, "DT_NUM_003")
            return _rule(rules, "DT_NUM_004")

    if normalized in {"FLOAT", "BINARY_FLOAT", "BINARY_DOUBLE"}:
        return _rule(rules, "DT_NUM_008")
    if normalized == "VARCHAR2" and profile.char_used == "C":
        return _rule(rules, "DT_CHR_001")
    if normalized == "VARCHAR2":
        return _rule(rules, "DT_CHR_002")
    if normalized == "CHAR":
        return _rule(rules, "DT_CHR_003")
    if normalized in {"NVARCHAR2", "NCHAR"}:
        return _rule(rules, "DT_CHR_004")
    if normalized in {"CLOB", "NCLOB"}:
        return _rule(rules, "DT_CHR_005")
    if normalized == "LONG":
        return _rule(rules, "DT_CHR_006")
    if normalized == "RAW":
        return _rule(rules, "DT_BIN_001")
    if normalized == "BLOB":
        return _rule(rules, "DT_BIN_002")
    if normalized == "DATE":
        return _first_pattern(rules, r"DATE")

    return {
        "targetType": "manual_review",
        "automationClass": "MANUAL_REQUIRED",
        "severity": "WARNING",
        "confidence": "LOW",
        "recommendation": f"No deterministic mapping registered for Oracle type {normalized}. Add a versioned rule before auto-conversion.",
        "requiresEvidence": ["source_type", "usage_context"],
    }


def _rule(rules: List[Dict[str, Any]], code: str) -> Dict[str, Any]:
    for rule in rules:
        if rule.get("ruleCode") == code:
            return rule
    raise KeyError(f"Rule {code} not found")


def _first_pattern(rules: List[Dict[str, Any]], pattern: str) -> Dict[str, Any]:
    regex = re.compile(pattern, re.IGNORECASE)
    for rule in rules:
        if regex.search(rule.get("sourcePattern", "")):
            return rule
    raise KeyError(f"No rule matching {pattern}")


def _source_type(profile: ColumnProfile) -> str:
    if profile.data_precision is None and profile.data_scale is None:
        return profile.oracle_type.upper()
    if profile.data_scale is None:
        return f"{profile.oracle_type.upper()}({profile.data_precision})"
    return f"{profile.oracle_type.upper()}({profile.data_precision},{profile.data_scale})"
