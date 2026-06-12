// Auto-filled custom-form fields. The value is resolved from submission context
// (current date/time and the logged-in user / factory) when the form is filled,
// not typed by the user. Keep AUTO_SOURCE_KEYS in sync with the edge validator
// (supabase/functions/_shared/actions/forms.ts).

export type AutoSource =
  | "submission_date"
  | "submission_time"
  | "submission_datetime"
  | "current_month"
  | "current_year"
  | "user_name"
  | "user_email"
  | "factory_name";

export const AUTO_SOURCES: { key: AutoSource; label: string; hint: string }[] = [
  { key: "submission_date", label: "Submission date", hint: "Date the form is filled (today)" },
  { key: "submission_time", label: "Submission time", hint: "Time the form is filled" },
  { key: "submission_datetime", label: "Submission date & time", hint: "Date and time the form is filled" },
  { key: "current_month", label: "Current month", hint: "Month name, e.g. June" },
  { key: "current_year", label: "Current year", hint: "Year, e.g. 2026" },
  { key: "user_name", label: "Your name", hint: "Name of the person filling the form" },
  { key: "user_email", label: "Your email", hint: "Email of the person filling the form" },
  { key: "factory_name", label: "Factory name", hint: "The factory's name" },
];

export const AUTO_SOURCE_KEYS = AUTO_SOURCES.map((s) => s.key) as string[];

export interface AutoContext {
  userName?: string | null;
  userEmail?: string | null;
  factoryName?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Resolve an auto-field's value. `now` is passed in so submit-time and render-time
 *  callers control the clock (the final value is resolved fresh at submission). */
export function resolveAutoValue(source: string, ctx: AutoContext, now: Date): string {
  switch (source) {
    case "submission_date": return localDate(now);
    case "submission_time": return localTime(now);
    case "submission_datetime": return `${localDate(now)} ${localTime(now)}`;
    case "current_month": return now.toLocaleString("en-US", { month: "long" });
    case "current_year": return String(now.getFullYear());
    case "user_name": return ctx.userName ?? "";
    case "user_email": return ctx.userEmail ?? "";
    case "factory_name": return ctx.factoryName ?? "";
    default: return "";
  }
}
