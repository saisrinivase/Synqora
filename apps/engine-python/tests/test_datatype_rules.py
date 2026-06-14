from pathlib import Path
import unittest

from synqora_engine import ColumnProfile, assess_column, load_ruleset


ROOT = Path(__file__).resolve().parents[3]
RULESET = ROOT / "rules" / "oracle_to_postgres_datatypes.v1.json"


class DatatypeRulesTest(unittest.TestCase):
    def test_number_18_identifier_is_reviewed_as_bigint_candidate(self):
        ruleset = load_ruleset(RULESET)
        result = assess_column(
            ColumnProfile(
                owner="FINANCE_CORE",
                table_name="TRANSACTIONS",
                column_name="TXN_ID",
                oracle_type="NUMBER",
                data_precision=18,
                data_scale=0,
            ),
            ruleset,
        )

        self.assertEqual(result.target_type, "bigint")
        self.assertEqual(result.automation_class, "AUTO_REVIEW")
        self.assertIn("sequence_usage", result.evidence_required)

    def test_unbounded_number_is_not_auto_safe(self):
        ruleset = load_ruleset(RULESET)
        result = assess_column(
            ColumnProfile(
                owner="FINANCE_CORE",
                table_name="TRANSACTIONS",
                column_name="AMOUNT",
                oracle_type="NUMBER",
            ),
            ruleset,
        )

        self.assertEqual(result.target_type, "numeric")
        self.assertEqual(result.severity, "WARNING")
        self.assertNotEqual(result.automation_class, "AUTO_SAFE")


if __name__ == "__main__":
    unittest.main()
