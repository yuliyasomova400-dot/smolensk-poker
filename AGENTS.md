# Smolensk Poker / Смоленский покер

- Current application: `app/`. Root-level HTML/JS/CSS are the older GitHub Pages site; preserve them unless explicitly asked to deploy/replace it.
- Read `README.md` and `docs/HANDOFF.md` before changing the application.
- Runtime: Node.js 22+, no npm dependencies. `npm test` runs offline validation; `npm start` serves `app/` on port 4173 and all interfaces. Default route is mode selection.
- Training is local. Online poker uses existing Supabase RPCs. Do not replace online play with bots as an error fallback.
- Never run `server/*.sql` automatically. They describe already-applied migrations and tests, not a fresh-database installer. Database changes require explicit task scope and appropriate Supabase access.
- Do not use production guest sign-ins for automated checks unless authorized: they create real users/rooms. Tests in `tests/` are offline and safe.
- Keep `service_role`, passwords, access/refresh tokens, database dumps, browser sessions and private keys out of Git. The frontend publishable key is intentionally public, not an admin credential.
- Preserve the green/gold Smolensk design, portrait layout, own player at the bottom, hidden opponent cards, and a server-authoritative game.
- Do not infer that email verification, production security, deployment or cloud-environment publication has been completed from the existence of these files.
- Communicate with the owner in Russian.
