# Contributing to Pawffice

Thanks for stopping by! Pawffice is small on purpose: plain Node.js, no dependencies, no build step. That makes it a friendly place for a first open source contribution.

한국어로 이슈와 PR을 써도 괜찮아요. Issues and PRs in Korean or English are both welcome.

## Run it locally

```bash
git clone https://github.com/dingcodingco/hermes-pawffice
cd hermes-pawffice
node bin/pawffice.js          # demo mode, no Hermes needed
npm test                      # node --test, about 3 seconds
```

You do **not** need Hermes or an API key to work on most things. Demo mode (`server/demo.js`) drives every state the office can show. Add `?scene=chat&agent=shiba`, `?scene=meeting`, `?scene=kanban` or `?scene=skills` to the URL to jump straight to a screen.

## Where things live

| Path | What it does |
|---|---|
| `bin/pawffice.js` | CLI entry (`--hermes`, `--port`) |
| `server/index.js` | HTTP server, static files, Server-Sent Events |
| `server/demo.js` | Demo mode with sample data |
| `server/hermes.js` | Hermes mode: reads the `hermes` CLI, talks to the API server |
| `server/layout.js` | Assigns characters and desks, opens building 2, 3… |
| `public/` | Browser app (`app.js`, `style.css`, sprites, background) |
| `office.config.json` | Coworker names, teams, desk positions |
| `test/` | `node:test` tests and a fake Hermes CLI |

## Good first contributions

- **English (or any language) UI.** All UI strings are Korean today. A small `i18n` table plus a `lang` option in `office.config.json` would help a lot of people.
- **A new character.** See below.
- **A new office theme** (night, rainy day, café). The background is one image plus desk positions in `office.config.json`.
- **Docs and screenshots** in your language.
- **Bug reports** with steps to reproduce. Please include your Node.js and Hermes versions.

Look for issues labeled `good first issue` or `help wanted`, or open an issue to say what you'd like to try.

## Adding a character

1. Make a sprite sheet PNG with a transparent background: **5 frames in one row, all the same width**, about 88 px tall, sitting on an office chair, facing slightly right.
   - frame 0 and 1: typing (they alternate while working)
   - frame 2: dozing (idle)
   - frame 3: hand raised (needs approval)
   - frame 4: happy (done)
2. Save it as `public/assets/sprites/<name>.png`.
3. Add `<name>` to `ROSTER` in `server/layout.js`.
4. Run the demo with `examples/crowd/office.config.json` (or set `"animal": "<name>"`) and check every state.
5. In the PR, say how the art was made and that you have the right to share it under MIT.

## Pull requests

- Keep PRs small and focused. One idea per PR is easiest to review.
- No new runtime dependencies, please. If you think one is needed, open an issue first.
- Run `npm test` before you push. Add a test when you fix a bug in `server/`.
- For visual changes, attach a before/after screenshot or GIF.
- Never commit `.env` or any API key.

## Code of conduct

Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
