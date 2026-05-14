# mytimes

mytimes is a separate workspace app for the booking MVP. It can share the same visual language as the broader product without coupling this booking flow to the main web app.

## Workspace Boundary

This app lives at `apps/slots` and is registered through the root npm workspace glob:

```txt
apps/
  web/       main web app
  slots/     mytimes booking app
```

The current scaffold is intentionally isolated:

- It has its own `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, and `src/`.
- It copies the mytimes token and material recipes into `src/styles.css` instead of importing `apps/web/src/styles.css`.
- It runs on port `5174` with `strictPort: true`, so it will not silently fall back to another port.

## Why This Shape

mytimes is part of the same product ecosystem, but its core interaction is different: a one-off scheduling board. Keeping it as a sibling app gives us three advantages:

- The main app can keep evolving without breaking the booking MVP.
- The booking app can use the same letterpress materials, motion, and tone.
- Removing the experiment is clean: delete `apps/slots` and run `npm install` to refresh workspace links.

## Design Foundation

The app keeps the mytimes letterpress grammar:

- `material-panel` for the paper event surface.
- `material-panel-mini` for day groups, builder controls, and compact admin sections.
- `material-wax-seal` for slot chips, state marks, and confirmation seals.
- `material-stamp-dark` for the one primary action on a screen.
- `material-stamp-light` for secondary actions such as copy, cancel, export, and close.

The front-end route and component plan is in [FRONTEND_PLAN.md](./FRONTEND_PLAN.md).

The backend boundary lives in `apps/slots-api`; its implementation plan is in `apps/slots-api/BACKEND_PLAN.md`.

## Commands

```sh
npm run dev --workspace @fresh-feel/slots
npm run typecheck --workspace @fresh-feel/slots
npm run build --workspace @fresh-feel/slots
```
