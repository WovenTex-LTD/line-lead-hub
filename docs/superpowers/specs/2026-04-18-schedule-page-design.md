# Schedule Page — Design Spec

## Overview

A premium production planning interface for garment factory admins. Not a calendar — a production control board. Admins assign POs to lines with start dates, view the full production plan over time, spot deadline risks, and manage unscheduled work.

**Target quality:** Match the Insights page — polished, spacious, intentional, premium enterprise SaaS.

## Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Header: icon badge + "Production Schedule" + controls       │
├─────────────────────────────────────────────────────────────┤
│  KPI Strip: 5 summary cards (responsive grid)                │
├──────────────────────────────────────────┬──────────────────┤
│                                          │                  │
│  Timeline Planner                        │  Unscheduled     │
│  (scrollable, line-based)                │  Orders Queue    │
│                                          │  (sticky)        │
│                                          │                  │
├──────────────────────────────────────────┴──────────────────┤
│  Modals: Schedule PO (create/edit)                           │
│  Drawer: Schedule Detail (inspect)                           │
└─────────────────────────────────────────────────────────────┘
```

## 1. Header & Controls

Single row layout matching Insights/Lines page pattern.

**Left side:**
- Icon badge (h-10 w-10 rounded-xl, CalendarRange icon)
- Title: "Production Schedule"
- Subtitle: brief contextual text

**Right side controls:**
- **View toggle:** Week / Month segmented control (two buttons, one active)
- **Today button:** Jumps timeline to center on today
- **Filters:** Line, Buyer, Risk Status — using existing Select component pattern
- **Search:** Optional text search for PO number

**Week view:** Shows 7 days. **Month view:** Shows 30–31 days.

Navigation arrows (← →) shift by one week or one month respectively.

## 2. KPI Strip

Five summary cards in responsive grid: `grid-cols-1 xs:grid-cols-2 lg:grid-cols-5`.

| # | Card | Metric | Icon | Gradient |
|---|------|--------|------|----------|
| 1 | Scheduled POs | Count of POs with at least one schedule entry | CalendarCheck | Blue |
| 2 | Unscheduled POs | Active POs with no schedule entry | AlertTriangle | Amber |
| 3 | Lines in Use | Active lines with at least one schedule in visible period | Activity | Emerald |
| 4 | Idle Lines | Active lines with zero schedules in visible period | Pause | Slate |
| 5 | Ex-Factory Risks | POs where schedule end_date > planned_ex_factory | ShieldAlert | Red |

**Visual treatment:** Gradient backgrounds, decorative blobs, AnimatedNumber values, staggered fade-in (50ms increments), hover lift with shadow transition. Matches Insights KPI card pattern exactly.

## 3. Timeline Planner

The core of the page. A horizontal, scrollable, line-based Gantt-style planner.

### Layout

- **Fixed left column:** ~160–180px. Shows line label (`line_id`, optionally line name below in muted text). Vertically centered in each row.
- **Scrollable right area:** Date grid. Each column = 1 day.
- **Row height:** 64–72px. Generous breathing room — this is a premium planning surface, not a compressed spreadsheet.

### X-Axis (date columns)

- **Column headers:** Day number with weekday abbreviation (e.g., "Mon 21"). Two-line header: month/year label row above, day cells below.
- **Weekend columns:** Subtle background tint (`bg-slate-50` or similar) to distinguish non-working days.
- **Week view:** 7 day columns visible.
- **Month view:** 30–31 day columns, compressed width per column.

### Y-Axis (line rows)

- One row per active line.
- Sorted using existing line sort logic (numeric then alphabetical: Line 1, 2, 3, 1A, 1B, 2A).
- Alternating row backgrounds with very subtle differentiation.
- Horizontal grid lines: subtle `border-b border-slate-100`.

### Schedule Bars

Horizontal bars spanning `start_date` → `end_date` within a line's row.

**Dimensions:** ~44px height within the 64–72px row, vertically centered. Rounded corners (`rounded-md`), subtle shadow (`shadow-sm`).

**Content:** PO number (semibold) + buyer name (regular weight, truncated). Left-aligned text with padding.

**Color coding (restrained, semantic):**
- **Normal:** `bg-blue-500/90 text-white` — brand blue
- **Near deadline (≤7 days to ex-factory):** `bg-amber-500/90 text-white`
- **At risk (end_date > planned_ex_factory):** `bg-red-500/90 text-white`
- **Completed status:** `bg-slate-200 text-slate-500` — heavily muted, semi-transparent
- **Custom color:** If `colour` field is set, use that as bar background

**Completed schedules:** Shown by default but heavily de-emphasised (muted colors, reduced opacity ~60%). They must not compete with active planning. A toggle to hide them entirely may be added if the view feels cluttered.

**Hover state:** Slight brightness increase, elevated shadow. Tooltip showing: PO number, buyer, style, start → end dates, days remaining to ex-factory, status.

**Click:** Opens Schedule Detail Drawer (section 6).

### Ex-Factory Deadline Marker

A thin vertical tick mark or small downward-pointing triangle positioned at the `planned_ex_factory` date column within the bar's row. Rendered in a muted red/amber tone.

Extremely minimal — 2–3px wide, subtle. Must not compete with the schedule bars. It is a precise reference mark, not a decorative element. Only rendered when the ex-factory date falls within the visible date range.

### Today Marker

A thin vertical line (1–2px) in brand color spanning the full planner height. Subtle glow or slightly higher opacity than grid lines. Positioned at today's date column.

### Row-Level Risk Signals

Inline visual signals on each line row, not just in the KPI strip:

- **Idle line:** Faint dashed horizontal center-line across the row, very subtle. No text repetition across rows — the visual emptiness itself communicates availability.
- **Overlap risk:** Where two bars overlap on the same line and date range, show a small warning indicator (⚠ amber dot or border highlight) at the overlap zone.
- **Delayed schedule:** If a schedule has `status: 'delayed'`, the bar gets a left border accent in red (`border-l-4 border-red-500`).

### Vertical Grid Lines

Subtle vertical lines between day columns: `border-r border-slate-100/60`. Must not overpower the schedule bars.

## 4. Unscheduled Orders Sidebar

**Width:** ~320px on desktop. **Sticky** — stays visible while the planner scrolls vertically.

**Collapsible** on smaller screens (below lg breakpoint) via a toggle button.

### Header

"Unscheduled Orders" title with count badge. Minimal.

### Grouping by Urgency

Orders are grouped into three visual sections:

| Group | Condition | Visual |
|-------|-----------|--------|
| **At Risk** | `planned_ex_factory` is within 14 days or already passed | Red accent header, red-tinted cards |
| **Upcoming** | `planned_ex_factory` is 15–30 days away | Amber accent header |
| **Later** | `planned_ex_factory` is >30 days away or null | Neutral header |

Within each group, sorted by `planned_ex_factory` ascending (most urgent first). POs with no ex-factory date go to the bottom of "Later."

### Card Design

Compact, refined list items:
- **PO number** (semibold) — primary identifier
- **Buyer** + style (secondary text, muted)
- **Order qty** (small, muted)
- **Ex-factory date** with contextual color (red if ≤14d, amber if ≤30d, muted otherwise)
- **"Schedule" button** — small, outlined style, right-aligned

Cards have subtle hover state, clean borders, minimal padding. They must feel operationally useful, not decorative.

### Empty State

When all POs are scheduled: centered icon (CheckCircle2), "All orders scheduled" text, muted subtitle. Clean and elegant.

## 5. Schedule Modal (Create / Edit)

Triggered by:
- "Schedule" button on an unscheduled PO card (create mode)
- "Edit Schedule" action in the detail drawer (edit mode)

### Layout

Clean modal with clear visual hierarchy.

**Header section (read-only context):**
- PO number, buyer, style, order quantity
- Displayed as a compact info strip at the top of the modal, not as form fields
- In edit mode, also shows current line assignment

**Form fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Line | Select dropdown (active lines) | Yes | Shows line_id + name |
| Start Date | Date picker | Yes | Defaults to today |
| End Date | Date picker | Yes | Auto-derived: `start_date + ceil(target_qty / daily_target)` if daily_target is set, otherwise manual. Always editable. |
| Target Quantity | Number input | No | Defaults to `order_qty` from the work order |
| Daily Target | Number input | No | Defaults to line's `target_per_day` if set |
| Notes | Textarea | No | Optional scheduling notes |

**Priority and custom color are omitted from v1.** They exist in the database schema and can be added later as advanced options. The goal is a fast, clean scheduling flow.

**Validation:**
- Line, start date, end date are required
- End date ≥ start date
- **Overlap warning (non-blocking):** If the selected line already has a schedule in the chosen date range, show an amber warning: "Line {X} has {PO} scheduled from {date} to {date}." Does not block submission.
- **Ex-factory warning (non-blocking):** If end_date > planned_ex_factory, show amber warning: "End date is after the ex-factory deadline ({date})."

**Actions:**
- Primary: "Schedule PO" (create) / "Update Schedule" (edit)
- Secondary: "Cancel"
- Destructive (edit mode only): "Remove from Schedule" with confirmation dialog

**Auto-derive end date logic:**
When start_date and daily_target and target_qty are all present:
```
end_date = start_date + ceil(target_qty / daily_target) - 1 days
```
This updates reactively as inputs change but can be manually overridden.

## 6. Schedule Detail Drawer

Triggered by clicking a schedule bar in the timeline.

**Component:** Right-side Sheet (existing shadcn Sheet component).

**Content sections:**

**Header:**
- PO number (large, semibold)
- Status badge (not_started | in_progress | completed | delayed)

**Details grid:**
| Label | Value |
|-------|-------|
| Buyer | buyer name |
| Style | style name |
| Color | color (if set) |
| Item | item (if set) |
| Line | line_id + name |
| Start Date | formatted date |
| End Date | formatted date |
| Duration | X days |
| Ex-Factory | date + risk indicator if at risk |
| Target Qty | quantity |
| Daily Target | quantity |
| Order Qty | total order quantity |
| Notes | text (if set) |

**Actions:**
- "Edit Schedule" — opens Schedule Modal in edit mode
- "Remove from Schedule" — confirmation dialog, then deletes the schedule entry

## 7. Data Architecture

### Custom Hook: `useProductionSchedule()`

Centralizes all data fetching, derived state, and mutations.

**Queries (via React Query):**
- `production_schedule` entries for the factory (with joined work_order and line data)
- `work_orders` (active, non-deleted) for the factory
- `lines` (active) for the factory

**Derived state:**
- `scheduledPOs` — work orders that have at least one schedule entry
- `unscheduledPOs` — active work orders with no schedule entry, grouped by urgency
- `kpiMetrics` — computed: scheduled count, unscheduled count, lines in use, idle lines, ex-factory risks
- `timelineData` — schedule entries organized by line for rendering

**Mutations:**
- `createSchedule(data)` — insert into production_schedule
- `updateSchedule(id, data)` — update production_schedule entry
- `deleteSchedule(id)` — delete production_schedule entry

All mutations invalidate the schedule query on success.

**Parameters:**
- `visibleDateRange` — { start: Date, end: Date } from the timeline view controls
- `filters` — { lineId?, buyer?, riskStatus?, search? }

### Timeline State: `useTimelineState()`

Manages the timeline view state separately from data:
- `viewMode` — 'week' | 'month'
- `currentDate` — the anchor date for the visible range
- `navigateForward()` / `navigateBack()` — shift by view increment
- `jumpToToday()` — reset to today
- `visibleRange` — computed { start, end } based on viewMode and currentDate

## 8. Component Tree

```
src/pages/Schedule.tsx                      — layout coordinator
src/hooks/useProductionSchedule.ts          — data fetching + mutations
src/hooks/useTimelineState.ts               — timeline view state
src/components/schedule/
  ├── ScheduleKPIStrip.tsx                  — 5 KPI cards
  ├── ScheduleControls.tsx                  — filters, view toggle, navigation
  ├── TimelinePlanner.tsx                   — main planner container
  │   ├── TimelineHeader.tsx                — date column headers
  │   ├── TimelineRow.tsx                   — single line row
  │   ├── ScheduleBar.tsx                   — single PO bar
  │   └── TodayMarker.tsx                   — vertical today indicator
  ├── UnscheduledSidebar.tsx                — sticky sidebar
  │   └── UnscheduledPOCard.tsx             — single unscheduled PO card
  ├── ScheduleModal.tsx                     — create/edit schedule
  └── ScheduleDetailDrawer.tsx              — inspect schedule
```

## 9. Route & Navigation

- **Route:** `/schedule` — protected, admin-or-higher only
- **Nav item:** Added to admin/owner nav group in `constants.ts`, using CalendarRange icon
- **Lazy loaded** in App.tsx matching existing pattern

## 10. Database

The `production_schedule` table already exists (migration `20260417120000_production_schedule.sql`). Schema matches all requirements.

**TypeScript types** need to be regenerated via `mcp__supabase__generate_typescript_types` to include the production_schedule table in `src/integrations/supabase/types.ts`.

No additional migrations needed for v1.

## 11. Scope Boundaries — What v1 Does NOT Include

- Drag-and-drop rescheduling
- Multi-line PO splitting UI (table supports it, UI is one-PO-one-line for v1)
- Print or PDF export of the schedule
- Undo/redo
- Real-time collaboration indicators
- Priority or custom color fields in the modal (exist in DB, omitted from v1 UI)
- Mobile-optimized planner layout (functional but not specifically designed for mobile in v1)

## 12. Visual Language Summary

| Element | Treatment |
|---------|-----------|
| Schedule bars | Rounded, shadowed, 44px height, semantic color, white text |
| Grid lines | `border-slate-100/60`, must not overpower bars |
| Today marker | 1–2px brand color vertical line, full height |
| Ex-factory marker | 2–3px tick/triangle, muted red/amber, minimal |
| Empty rows | Faint dashed center-line, no text |
| Overlaps | Amber warning dot at overlap zone |
| Delayed | Red left border accent on bar |
| Completed | Muted slate, ~60% opacity |
| Hover | Brightness + shadow lift + tooltip |
| Weekend columns | Subtle slate-50 background tint |
| Row alternation | Very subtle background differentiation |
