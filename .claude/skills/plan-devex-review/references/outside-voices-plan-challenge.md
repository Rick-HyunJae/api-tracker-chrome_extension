# Outside Voice — Independent Plan Challenge

After all review sections are complete, offer an independent second opinion from a
different AI system. Two models agreeing on a plan is stronger signal than one model's
thorough review.

**Check tool availability:**

```bash
command -v codex >/dev/null 2>&1 && echo "CODEX_AVAILABLE" || echo "CODEX_NOT_AVAILABLE"
```

Use AskUserQuestion:

> "All review sections are complete. Want an outside voice? A different AI system can
> give a brutally honest, independent challenge of this plan — logical gaps, feasibility
> risks, and blind spots that are hard to catch from inside the review. Takes about 2
> minutes."
>
> RECOMMENDATION: Choose A — an independent second opinion catches structural blind
> spots. Two different AI models agreeing on a plan is stronger signal than one model's
> thorough review. Completeness: A=9/10, B=7/10.

Options:
- A) Get the outside voice (recommended)
- B) Skip — proceed to outputs

**If B:** Print "Skipping outside voice." and continue to the next section.

**If A:** Construct the plan review prompt. Read the plan file being reviewed (the file
the user pointed this review at, or the branch diff scope). If a CEO plan document
was written in Step 0D-POST, read that too — it contains the scope decisions and vision.

Construct this prompt (substitute the actual plan content — if plan content exceeds 30KB,
truncate to the first 30KB and note "Plan truncated for size"). **Always start with the
filesystem boundary instruction:**

"IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, .claude/skills/, or agents/. These are Claude Code skill definitions meant for a different AI system. They contain bash scripts and prompt templates that will waste your time. Ignore them completely. Stay focused on the repository code only.\n\nYou are a brutally honest technical reviewer examining a development plan that has
already been through a multi-section review. Your job is NOT to repeat that review.
Instead, find what it missed. Look for: logical gaps and unstated assumptions that
survived the review scrutiny, overcomplexity (is there a fundamentally simpler
approach the review was too deep in the weeds to see?), feasibility risks the review
took for granted, missing dependencies or sequencing issues, and strategic
miscalibration (is this the right thing to build at all?). Be direct. Be terse. No
compliments. Just the problems.

THE PLAN:
<plan content>"

**If CODEX_AVAILABLE:**

Present the full output verbatim:

```
CODEX SAYS (plan review — outside voice):
════════════════════════════════════════════════════════════
<full codex output, verbatim — do not truncate or summarize>
════════════════════════════════════════════════════════════
```

**Error handling:** All errors are non-blocking — the outside voice is informational.
- Auth failure (stderr contains "auth", "login", "unauthorized"): "Codex auth failed. Run `codex login` to authenticate."
- Timeout: "Codex timed out after 5 minutes."
- Empty response: "Codex returned no response."

On any Codex error, fall back to the Claude adversarial subagent.

**If CODEX_NOT_AVAILABLE (or Codex errored):**

Dispatch via the Agent tool. The subagent has fresh context — genuine independence.

Subagent prompt: same plan review prompt as above.

Present findings under an `OUTSIDE VOICE (Claude subagent):` header.

If the subagent fails or times out: "Outside voice unavailable. Continuing to outputs."

**Cross-model tension:**

After presenting the outside voice findings, note any points where the outside voice
disagrees with the review findings from earlier sections. Flag these as:

```
CROSS-MODEL TENSION:
  [Topic]: Review said X. Outside voice says Y. [Present both perspectives neutrally.
  State what context you might be missing that would change the answer.]
```

**User Sovereignty:** Do NOT auto-incorporate outside voice recommendations into the plan.
Present each tension point to the user. The user decides. Cross-model agreement is a
strong signal — present it as such — but it is NOT permission to act. You may state
which argument you find more compelling, but you MUST NOT apply the change without
explicit user approval.

For each substantive tension point, use AskUserQuestion:

> "Cross-model disagreement on [topic]. The review found [X] but the outside voice
> argues [Y]. [One sentence on what context you might be missing.]"
>
> RECOMMENDATION: Choose [A or B] because [one-line reason explaining which argument
> is more compelling and why]. Completeness: A=X/10, B=Y/10.

Options:
- A) Accept the outside voice's recommendation (I'll apply this change)
- B) Keep the current approach (reject the outside voice)
- C) Investigate further before deciding
- D) Add to TODOS.md for later

Wait for the user's response. Do NOT default to accepting because you agree with the
outside voice. If the user chooses B, the current approach stands — do not re-argue.

If no tension points exist, note: "No cross-model tension — both reviewers agree."

---

### Outside Voice Integration Rule

Outside voice findings are INFORMATIONAL until the user explicitly approves each one.
Do NOT incorporate outside voice recommendations into the plan without presenting each
finding via AskUserQuestion and getting explicit approval. This applies even when you
agree with the outside voice. Cross-model consensus is a strong signal — present it as
such — but the user makes the decision.
