#!/usr/bin/env python3
"""Read-only weekly scorecard from the existing Nexus outcome and usage ledgers."""
import argparse
import datetime as dt
import json

import nexus


def summarize(outcomes, usage, end, days=7):
    """Count ledger entries in [end - days, end), with explicit unknown counts."""
    start = end - dt.timedelta(days=days)
    def window(rows):
        return [r for r in rows if start <= nexus.parse_iso(r["ts"]) < end]
    outcomes, usage = window(outcomes), window(usage)
    result = {}
    for agent in sorted({r["agent"] for r in outcomes + usage}):
        o = [r for r in outcomes if r["agent"] == agent]
        u = [r for r in usage if r["agent"] == agent]
        known_ci = [r for r in o if isinstance(r.get("ci_first_try"), bool)]
        known_review = [r for r in o if isinstance(r.get("review_blockers"), int)
                        and not isinstance(r.get("review_blockers"), bool)]
        costs = {}
        for r in u:
            source = r["source"]
            bucket = costs.setdefault(source, {"rows": 0, "usd_rows": 0, "usd": None})
            bucket["rows"] += 1
            if r.get("usd") is not None:
                bucket["usd_rows"] += 1
                bucket["usd"] = round((bucket["usd"] or 0) + float(r["usd"]), 6)
        passes = sum(r["result"] == "pass" for r in o)
        result[agent] = {
            "outcome_entries": len(o),
            "passes": passes,
            "pass_rate": passes / len(o) if len(o) >= 3 else None,
            "ci_known": len(known_ci),
            "ci_first_try_passes": sum(r["ci_first_try"] for r in known_ci),
            "review_known": len(known_review),
            "review_blockers": sum(r["review_blockers"] for r in known_review) if known_review else None,
            "usage_by_source": costs,
        }
    return {"start": nexus.iso(start), "end": nexus.iso(end), "agents": result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", help="Exclusive UTC cutoff: YYYY-MM-DDTHH:MM:SSZ")
    args = parser.parse_args()
    end = nexus.parse_iso(args.as_of) if args.as_of else nexus.now()
    outcomes = nexus.load_jsonl("ledger/outcomes.jsonl")
    usage = nexus.load_jsonl("ledger/usage.jsonl")
    report = {
        "current_week": summarize(outcomes, usage, end),
        "previous_week": summarize(outcomes, usage, end - dt.timedelta(days=7)),
        "interpretation": "Empty agents means no recorded data, not zero failures. Entries are not unique tasks. "
                          "Pass rates require at least three entries; compare only like tasks and evidence. "
                          "Only invoice USD is actual cost. Other sources may overlap; never sum them together.",
    }
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
