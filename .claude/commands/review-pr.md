Review the current pull request or branch diff.

1. **Get diff**: Run `git diff main...HEAD` (or `git diff origin/main...HEAD`) to see all changes.

2. **Get commits**: Run `git log main...HEAD --oneline` to see the commit history.

3. **Summarize changes**:
   - What was added, modified, or deleted?
   - Which files were touched and why?
   - What is the intent/goal of this change?

4. **Review checklist** — evaluate each point:
   - [ ] Code follows project conventions and is readable
   - [ ] No obvious bugs, edge cases, or regressions
   - [ ] No security vulnerabilities (injection, XSS, exposed secrets, unvalidated input)
   - [ ] No hardcoded credentials or API keys
   - [ ] Error handling is adequate
   - [ ] Tests exist for new functionality (where applicable)
   - [ ] No breaking changes without version bump or migration
   - [ ] Docker/systemd config updated if service structure changed
   - [ ] AGENTS.md / WORKSPACE.md updated if workspace changed
   - [ ] Typecheck passes: `pnpm -r typecheck` (for TS projects)
   - [ ] Tests pass: `pnpm test:run` (for TS projects)

5. **Verdict**: Clear recommendation:
   - ✅ **Approve** — ready to merge
   - ⚠️ **Approve with comments** — minor issues, can merge after addressing
   - ❌ **Request changes** — must fix before merging

Keep the review concise and actionable. For each checklist failure, explain what is wrong and suggest a fix.
