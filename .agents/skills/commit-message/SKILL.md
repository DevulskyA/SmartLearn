---
name: commit-message
description: Generate commit messages following conventional commits with scope detection
phases: [E, C]
---

# Commit Message Generator

## When to Use
Use this skill when creating commit messages or when the user asks to commit changes.

## Instructions
1. Analyze staged changes with `git diff --staged`
2. Identify the type: feat, fix, refactor, docs, test, chore, style, perf
3. Detect scope from the most changed directory or module
4. Write a concise message focusing on "why" not "what"

## Format
```
<type>(<scope>): <description>

[optional body explaining why, not what]

[optional footer: BREAKING CHANGE, Closes #issue]
```

## Examples
- `feat(auth): add OAuth2 login with Google provider`
- `fix(api): handle null response from payment gateway`
- `refactor(db): extract connection pooling to separate module`
- `docs(readme): add installation instructions for Windows`

## Guidelines
- Keep subject line under 72 characters
- Use imperative mood ("add" not "added")
- Don't end subject with period
- Separate subject from body with blank line