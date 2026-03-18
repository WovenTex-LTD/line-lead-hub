---
name: Work patterns from SuperClaude
description: Techniques for confidence checking, hallucination prevention, and parallel execution patterns
type: feedback
---

## Confidence-First Implementation
Before starting non-trivial work, quickly assess confidence:
- **≥90%**: Proceed directly
- **70-89%**: Present alternatives, investigate more
- **<70%**: STOP — ask questions first

Spending 100-200 tokens on a confidence check prevents 5,000-50,000 tokens on wrong-direction work. Always check for existing patterns/duplicates before implementing new code.

**Why:** Prevents wasted effort on wrong approaches, duplicate implementations, or architecture mismatches.

**How to apply:** Before implementing a feature or fix, do a quick Glob/Grep for existing patterns. If unsure about approach, state confidence level and ask rather than guessing.

## Anti-Hallucination: Evidence-Based Responses
Never claim something works without evidence. Red flags to avoid:
- "Tests pass" without showing output
- "Everything works" without evidence
- "Implementation complete" with no verification
- "Probably works" language

**How to apply:** After making changes, run type checks or tests when appropriate. Show actual output. When claiming something is fixed, provide evidence (the specific change and why it resolves the issue).

## Parallel Execution: Wave → Checkpoint → Wave
```
Wave 1: [Read file1, Read file2, Read file3] (parallel)
   ↓
Checkpoint: Analyze all results together
   ↓
Wave 2: [Edit file1, Edit file2, Edit file3] (parallel)
```

**When to use:** Reading multiple independent files, editing multiple unrelated files, running multiple independent searches.

**When NOT to use:** Operations with dependencies, sequential analysis needing prior results.

**How to apply:** Batch independent tool calls together in single messages. Don't read files one by one when they're independent.

## Investigation Before Implementation
For new features or unfamiliar code:
1. Search for existing patterns (Glob/Grep)
2. Read related files to understand conventions
3. Verify architecture assumptions
4. Then implement

**Why:** Prevents building things that already exist or don't match the project's patterns.
