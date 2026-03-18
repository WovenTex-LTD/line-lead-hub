---
name: Sewing-only financials
description: Only sewing counts for cost and revenue calculations — no cutting or finishing
type: feedback
---

Financial calculations must only include sewing:
- **Output Value**: sewing output × (cm_per_dozen × 0.70 / 12)
- **Operating Cost**: sewing manpower × hours × headcount rate (only sewing department)
- No cutting or finishing costs should appear anywhere in financial calculations or breakdowns

**Why:** User explicitly stated "only sewing counts as cost" and "any mention of other departments should be removed from everywhere."

**How to apply:** When building or modifying any financial display or calculation, exclude cutting and finishing entirely. Do not show department breakdowns (Sewing/Cutting/Finishing bars). The constant `PRODUCTION_CM_SHARE = 0.70` from `@/lib/sewing-financials` must be used in output value calculations.
