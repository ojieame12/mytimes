Archived visual assets
======================

This folder keeps generated brand visuals that are not currently referenced by
the runtime app. They are intentionally outside `public/` so Vite/Railway do not
ship them as static assets.

Move an asset back into `apps/slots/public/assets/bg/` only when a page imports
or references it directly.
