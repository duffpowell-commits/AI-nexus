import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
from improvement_report import summarize


class ImprovementReportTests(unittest.TestCase):
    def setUp(self):
        self.end = dt.datetime(2026, 11, 27, tzinfo=dt.timezone.utc)

    def test_empty_is_unknown(self):
        self.assertEqual(summarize([], [], self.end)["agents"], {})

    def test_windows_and_small_sample(self):
        rows = [
            {"ts": "2026-11-20T00:00:00Z", "agent": "claude", "result": "pass"},
            {"ts": "2026-11-27T00:00:00Z", "agent": "claude", "result": "fail"},
            {"ts": "2026-11-19T23:59:59Z", "agent": "claude", "result": "fail"},
        ]
        a = summarize(rows, [], self.end)["agents"]["claude"]
        self.assertEqual(a["outcome_entries"], 1)
        self.assertIsNone(a["pass_rate"])
        self.assertEqual(a["ci_known"], 0)
        self.assertIsNone(a["review_blockers"])

    def test_known_counts(self):
        base = {"ts": "2026-11-24T00:00:00Z", "agent": "codex"}
        rows = [dict(base, result="pass", ci_first_try=True, review_blockers=0),
                dict(base, result="pass", ci_first_try=False, review_blockers=2),
                dict(base, result="fail")]
        a = summarize(rows, [], self.end)["agents"]["codex"]
        self.assertAlmostEqual(a["pass_rate"], 2 / 3)
        self.assertEqual((a["ci_known"], a["ci_first_try_passes"]), (2, 1))
        self.assertEqual((a["review_known"], a["review_blockers"]), (2, 2))

    def test_cost_sources_stay_separate(self):
        base = {"ts": "2026-11-24T00:00:00Z", "agent": "chatgpt"}
        usage = [dict(base, source="invoice", usd=1),
                 dict(base, source="estimate", usd=2),
                 dict(base, source="app-meter")]
        a = summarize([], usage, self.end)["agents"]["chatgpt"]
        self.assertEqual(a["outcome_entries"], 0)
        self.assertEqual(a["usage_by_source"]["invoice"]["usd"], 1)
        self.assertEqual(a["usage_by_source"]["estimate"]["usd"], 2)
        self.assertIsNone(a["usage_by_source"]["app-meter"]["usd"])


if __name__ == "__main__":
    unittest.main()
