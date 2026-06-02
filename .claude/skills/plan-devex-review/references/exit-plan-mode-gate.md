# EXIT PLAN MODE GATE (BLOCKING)

Before calling ExitPlanMode, run this self-check. If any item fails, do the
missing work — do NOT call ExitPlanMode:

1. Read the plan file with the Read tool (after your most recent write to it).
2. Confirm the LAST `## ` heading in the file is `## REVIEW REPORT`.
   In-body prose that mentions "outside voice", "codex findings", or similar
   does NOT count — only the structured `## REVIEW REPORT` section
   satisfies this check.
3. Confirm the report contains: a Runs / Status / Findings table, a VERDICT
   line, and absorbs CROSS-MODEL / UNRESOLVED lines if applicable.
4. If a plan file is in context for this skill invocation: confirm
   once. If no plan file is in context, this check short-circuits —
   checks 1-3 already short-circuit when no plan file exists.

Failing this gate and calling ExitPlanMode anyway is a contract violation —
the user will see a plan whose review report is missing or stale, and will
(correctly) reject it. Self-deception failure mode to watch for: feeling
"done" after writing review prose into the plan body. The body prose is not
the report. The report is a separate, structured, table-bearing section that
must be the file's terminal heading.
