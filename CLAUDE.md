This repository is a watch-first outfit planning application.

The watch is the center of the system.

The app recommends:
1. today's watch
2. an outfit built around that watch

The seeded watch collection in src/data/watchSeed.js must never be replaced.

Architecture rules:
- business logic lives in src/engine
- services handle sync, cache, and pipelines
- UI components must remain thin

The main user context is "hospital smart casual".

Performance rules:
- UI must render immediately on startup
- cloud sync must run in background
- image processing must never block the UI thread
