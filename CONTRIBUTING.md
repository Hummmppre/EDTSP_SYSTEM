# Contributing to EDTSP

## Setup

```bash
cp backend/.env.example backend/.env
npm --prefix backend install
npm install
npm run dev
```

## Workflow

1. Create a branch for the change.
2. Keep the single-origin model: browser code calls relative `/api` paths only.
3. Run `npm run lint` and `npm test` before opening a pull request.
4. Describe the trainee- or admin-facing effect in the pull request.

## Conventions

- **Backend:** CommonJS, one controller per resource, shared helpers in
  `backend/utils`. List endpoints accept `page`, `limit`, `search`, and a resource
  filter, and return `count/total/page/pages/limit`.
- **Errors:** respond with `{ success: false, message, field?, code? }` and let the
  central error handler map unexpected failures.
- **Frontend:** plain scripts that attach to `window.EDTSP`. Use `EDTSP.api` for
  requests, `EDTSP.session` for the guard, and `EDTSP.ui` for formatting, states, and
  modals. Never hardcode an API host.
- **UI:** follow `DESIGN.md`. No gradients, no panel shadows, hay accent only for the
  active nav marker / focus cell / focus ring, SVG icons only, and every state must
  name the cause and the next action.
- **Accessibility:** every modal gets a label, focus trap, Escape handling, and focus
  return. Never ship an unlabeled input.
- **No `alert()` / `confirm()`** in the portal.

## Tests

Add a test in `backend/test/` for new behaviour. The suite runs against
`mongodb-memory-server` and must not use the Atlas URI.
