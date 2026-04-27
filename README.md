# Insighta Portal

Web interface for Insighta Labs+.

---

## Pages

| Route | Description |
|---|---|
| `/login` | GitHub OAuth login |
| `/dashboard` | Overview and quick actions |
| `/profiles` | Browse, filter, and paginate profiles |
| `/profiles/:id` | Single profile detail |
| `/search` | Natural language search |
| `/account` | Current user info and logout |

---

## Security

- Tokens stored in **HTTP-only cookies** — not accessible via JavaScript
- CSRF token sent as a readable cookie, must be included as `X-CSRF-Token` header or `_csrf` form field on mutating requests
- Automatic token refresh — if access token is expired, the portal silently refreshes using the refresh token cookie

---

## Setup

```bash
npm install
npm start
```

### Environment Variables
```
PORT=3001
NODE_ENV=production
API_BASE_URL=""
```

<!-- Stage 3 complete -->