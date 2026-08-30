---
name: api-design
description: Design RESTful APIs following best practices
phases: [P, R]
---

# API Design

## When to Use
Use this skill when designing new APIs or reviewing API designs.

## REST Principles

### 1. Resource Naming
- Use nouns, not verbs: `/users` not `/getUsers`
- Use plural: `/users` not `/user`
- Use hyphens: `/user-profiles` not `/userProfiles`
- Nest for relationships: `/users/{id}/orders`

### 2. HTTP Methods
| Method | Purpose | Idempotent |
|--------|---------|------------|
| GET | Read | Yes |
| POST | Create | No |
| PUT | Replace | Yes |
| PATCH | Update | Yes |
| DELETE | Remove | Yes |

### 3. Status Codes
- 200: OK
- 201: Created
- 204: No Content
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 409: Conflict
- 422: Unprocessable Entity
- 500: Internal Server Error

### 4. Response Format
```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "total": 100
  },
  "errors": []
}
```

### 5. Versioning
- URL path: `/v1/users`
- Header: `Accept: application/vnd.api+json;version=1`

## Design Checklist
- [ ] Resources clearly defined
- [ ] Consistent naming convention
- [ ] Proper HTTP methods used
- [ ] Error responses standardized
- [ ] Pagination implemented
- [ ] Authentication specified
- [ ] Rate limiting defined