---
name: Exclude zero-submission days from charts and stats
description: Days with 0 submissions for a section should be excluded from charts/insights/data — they indicate factory closure, not zero output
type: feedback
---

If a section (sewing, finishing, cutting) has 0 submissions for a given day, that day must NOT appear in charts, insights, or statistical calculations for that section.

**Why:** Zero-submission days mean the factory was closed, not that output was zero. Including them skews averages (efficiency, output/day, manpower) downward and creates misleading dips in trend charts.

**How to apply:** When building daily trend data, aggregating period stats, or computing averages, filter out days where the section has no submissions (no actuals AND no targets). This applies per-section — sewing may have data on a day when cutting doesn't, so filter independently per department.
