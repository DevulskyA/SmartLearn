---
name: pr-review
description: Review pull requests against team standards and best practices
phases: [R, V]
---

# Pull Request Review

## When to Use
Use this skill when reviewing a pull request or when asked to review changes.

## Review Checklist

### 1. Context Understanding
- [ ] PR description explains the "why"
- [ ] Linked issue or ticket exists
- [ ] Scope is appropriate (not too large)

### 2. Code Quality
- [ ] Code follows project conventions
- [ ] No unnecessary complexity
- [ ] DRY principle respected
- [ ] Error handling is appropriate

### 3. Testing
- [ ] Tests cover new functionality
- [ ] Edge cases are handled
- [ ] No flaky tests introduced

### 4. Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] No SQL injection risks
- [ ] Authentication/authorization correct

### 5. Performance
- [ ] No N+1 queries
- [ ] Appropriate caching
- [ ] No memory leaks

## Review Format
```markdown
## Summary
[1-2 sentence overview]

## What I Reviewed
- [List of files/areas reviewed]

## Findings
### Must Fix
- [ ] Issue 1
- [ ] Issue 2

### Suggestions
- Consider...
- Nice to have...

## Verdict
[APPROVE / REQUEST_CHANGES / COMMENT]
```