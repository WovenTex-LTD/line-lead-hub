---
name: Line sort order - numeric then alphabetic
description: Lines must be sorted numerically first (Line 1, 2, 3...) then alphabetically (1A, 1B, 2A...) everywhere except Dashboard and Today Updates which sort by latest submitted
type: feedback
---

Lines should always be organized primarily numerically and secondarily alphabetically: Line 1, Line 2, Line 3 or Line 1A, Line 1B, Line 2A, Line 2B, Line 3A, etc.

**Why:** Natural reading order for factory operators — they expect lines in numeric sequence, not random/alphabetic order.

**How to apply:** Use a natural sort function that extracts the leading number, then compares the remaining suffix alphabetically. Apply this sort everywhere lines appear: dropdowns, tables, charts, line performance views, submission lists, CSV exports, PDF reports. The only exceptions are Dashboard and Today Updates where lines are ordered by latest submission time.
