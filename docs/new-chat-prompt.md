# Prompt to set up Adventure Path in a new repo

Use this when you've made a new GitHub repo and want a new Claude Code chat to put
this exact game in it (same code, nothing rebuilt). Paste everything below the line.

---

Set up my browser game **Adventure Path** in this repository and publish it with Cloudflare Workers.

The game is already finished; I want the exact same code, not a rewrite. It's a static
website (plain HTML, CSS and JavaScript ES modules, no build step). Get the files from
whichever of these is available:

1. They're already in this repo (I may have uploaded them from `adventure-path.zip`), or
2. They're in my repo **Victorrong66/adventure-path** (branch `main`). If so, add that repo
   to this session and copy every file over except the `.git` folder.

The files should be:
- `index.html`, `style.css`, `README.md`
- `js/`: `main.js`, `game.js`, `sim.js`, `world.js`, `render.js`, `scenery.js`, `sprites.js`, `audio.js`, `input.js`, `net.js`, `save.js`, `util.js`
- `server/worker.js` (the Cloudflare Worker + Durable Object game server)
- `wrangler.jsonc`, `.assetsignore`, `package.json`, `package-lock.json`, `.gitignore`
- `.github/workflows/deploy.yml` (deploys to Cloudflare on every push to `main`; needs the
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets)
- `docs/rebuild-prompt.md` and `docs/new-chat-prompt.md`

Then:
1. Check that all the files are there, and update the README if the repo name or website link changed.
2. Test it: run `npm install` and `npx wrangler dev --port 8787 --persist-to <a folder outside the repo>`
   (state inside the repo makes the dev server reload in a loop), then use headless Chromium
   (Playwright) to have one browser host a world and another join with the room code.
   Both should ready up and fight a wave. Fix anything that's broken.
3. Commit and push to `main` (or open a pull request for me to merge, if you can't push to `main`).
4. Tell me step by step how to set up Cloudflare (free plan): make an account, create an API token
   from the "Edit Cloudflare Workers" template, copy the Account ID, add both as GitHub repository
   secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), then re-run the "Deploy to Cloudflare"
   workflow. Give me the final link, which will look like `https://adventure-path.<subdomain>.workers.dev`.

Things to know:
- Never commit any photos. The Monster Face Photo option keeps the picture only in the host's browser.
- Saved worlds live in each player's browser (localStorage), and that storage is tied to the
  website address. A new address starts with no saves. To keep a world, the host uses
  **Export Save File** on the old site, then **Import Save** on the new one.
