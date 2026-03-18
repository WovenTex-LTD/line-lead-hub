---
name: Exclude target-only submissions from statistics
description: Submissions with only a target and no EOD value must be excluded from all charts, calculations, and statistical fields
type: feedback
---

If a submission only has a target value but no EOD (End of Day) value, it must NOT be included in any statistical field, chart, or data calculation.

**Why:** Target-only submissions represent planned/expected values without actual results. Including them skews statistics and misrepresents actual performance data.

**How to apply:** Whenever filtering or aggregating submission data for display (charts, summaries, comparisons, dashboards), always filter out records where EOD is null/undefined/missing but target exists. This applies to all pages and components.
