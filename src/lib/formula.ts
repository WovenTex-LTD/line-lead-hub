// Safe arithmetic evaluator for computed form fields. Formulas reference other
// fields by their key and support + - * / and parentheses. No eval(): a small
// recursive-descent parser over a fixed grammar.
//   expr   := term (('+'|'-') term)*
//   term   := factor (('*'|'/') factor)*
//   factor := number | identifier | '(' expr ')' | '-' factor
// Keep in sync with supabase/functions/_shared/actions/formula.ts.

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] | null {
  const re = /[0-9]*\.?[0-9]+|[a-zA-Z_][a-zA-Z0-9_]*|[()+\-*/]|\s+/g;
  const toks: Tok[] = [];
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index !== pos) return null; // gap = illegal character
    pos = re.lastIndex;
    const s = m[0];
    if (/^\s+$/.test(s)) continue;
    if (/^[0-9.]/.test(s)) toks.push({ t: "num", v: Number(s) });
    else if (/^[a-zA-Z_]/.test(s)) toks.push({ t: "id", v: s });
    else toks.push({ t: "op", v: s });
  }
  if (pos !== src.length) return null;
  return toks;
}

class Parser {
  i = 0;
  constructor(private toks: Tok[], private resolve: (id: string) => number) {}
  private peek(): Tok | undefined { return this.toks[this.i]; }
  private eat(): Tok { return this.toks[this.i++]; }
  expr(): number {
    let v = this.term();
    let t = this.peek();
    while (t && t.t === "op" && (t.v === "+" || t.v === "-")) {
      this.eat();
      const r = this.term();
      v = t.v === "+" ? v + r : v - r;
      t = this.peek();
    }
    return v;
  }
  private term(): number {
    let v = this.factor();
    let t = this.peek();
    while (t && t.t === "op" && (t.v === "*" || t.v === "/")) {
      this.eat();
      const r = this.factor();
      if (t.v === "/") { if (r === 0) throw new Error("div0"); v = v / r; }
      else v = v * r;
      t = this.peek();
    }
    return v;
  }
  private factor(): number {
    const t = this.peek();
    if (!t) throw new Error("unexpected end");
    if (t.t === "op" && t.v === "-") { this.eat(); return -this.factor(); }
    if (t.t === "op" && t.v === "(") {
      this.eat();
      const v = this.expr();
      const close = this.eat();
      if (!close || close.t !== "op" || close.v !== ")") throw new Error("expected )");
      return v;
    }
    if (t.t === "num") { this.eat(); return t.v; }
    if (t.t === "id") { this.eat(); return this.resolve(t.v); }
    throw new Error("unexpected token");
  }
  done(): boolean { return this.i === this.toks.length; }
}

/** Every distinct field key referenced by the formula. */
export function extractRefs(formula: string): string[] {
  const toks = tokenize(formula);
  if (!toks) return [];
  return [...new Set(toks.filter((t): t is { t: "id"; v: string } => t.t === "id").map((t) => t.v))];
}

/** True if the formula is syntactically valid arithmetic (references aside). */
export function isValidFormula(formula: string): boolean {
  const toks = tokenize(formula);
  if (!toks || toks.length === 0) return false;
  try {
    const p = new Parser(toks, () => 1);
    const v = p.expr();
    return p.done() && Number.isFinite(v);
  } catch { return false; }
}

/** Evaluate against a values map. Returns null if any referenced field is
 *  empty/non-numeric, on divide-by-zero, or on a malformed formula. */
export function evaluateFormula(formula: string, values: Record<string, unknown>): number | null {
  const toks = tokenize(formula);
  if (!toks || toks.length === 0) return null;
  try {
    const p = new Parser(toks, (id) => {
      const raw = values[id];
      const n = typeof raw === "number" ? raw : raw === "" || raw == null ? NaN : Number(raw);
      if (!Number.isFinite(n)) throw new Error("missing:" + id);
      return n;
    });
    const v = p.expr();
    if (!p.done() || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch { return null; }
}
