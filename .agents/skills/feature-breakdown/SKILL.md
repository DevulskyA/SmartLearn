---
name: feature-breakdown
description: Break down features into implementable tasks
phases: [P]
---

# Feature Breakdown

## When to Use
Use this skill when planning a new feature or breaking down requirements.

## Breakdown Process

### 1. Understand the Goal
- What problem does this solve?
- Who is the user?
- What does success look like?

### 2. Identify Components
- UI changes needed
- API endpoints required
- Database changes
- External integrations
- Background jobs

### 3. Define Tasks
Each task should be:
- **Small**: Completable in <4 hours
- **Independent**: Minimal dependencies
- **Testable**: Clear acceptance criteria
- **Valuable**: Delivers partial value

### 4. Order by Dependencies
```
1. Database schema changes
2. Backend API endpoints
3. Frontend components
4. Integration tests
5. Documentation
```

## Task Template
```markdown
### Task: [Name]

**Description**: [What to implement]

**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2

**Technical Notes**:
- Approach: [How to implement]
- Files: [Which files to modify]
- Dependencies: [What must be done first]

**Estimate**: [S/M/L]
```

## Sizing Guide
- **S (Small)**: <2 hours, single file change
- **M (Medium)**: 2-4 hours, few files
- **L (Large)**: 4-8 hours, multiple components