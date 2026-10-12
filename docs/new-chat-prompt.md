# Prompt to set up Victor's World in a new repo

Use this when you've made a new GitHub repo and want a new Claude Code chat to put
this exact game in it (same code, nothing rebuilt). Paste everything below the line.

---

Set up my browser game **Victor's World** in this repository and publish it with GitHub Pages.

The game is already finished; I want the exact same code, not a rewrite. It's a static
website (plain HTML, CSS and JavaScript ES modules, no build step). Get the files from
whichever of these is available:

1. They're already in this repo (I may have uploaded them from `victors-world.zip`), or
2. They're in my old repo **Victorrong66/victors-world** (branch `main`). If so, add that repo
   to this session and copy every file over except the `.git` folder.

The files should be:
- `index.html`, `style.css`, `README.md`
- `js/`: `main.js`, `game.js`, `sim.js`, `world.js`, `render.js`, `scenery.js`, `sprites.js`, `audio.js`, `input.js`, `net.js`, `save.js`, `util.js`
- `js/vendor/peerjs.min.js` and `js/vendor/PEERJS_LICENSE`
- `.github/workflows/pages.yml` (deploys the repo root to GitHub Pages on every push to `main`)
- `docs/rebuild-prompt.md` and `docs/new-chat-prompt.md`

Then:
1. Check that all the files are there, and update the README if the repo name or website link changed.
2. Test it: serve the folder locally, run a local PeerJS server (the `peer` npm package), and use
   headless Chromium (Playwright) to have one browser host a world and another join with the room code.
   Both should ready up and fight a wave. Load the page with
   `?peerhost=127.0.0.1&peerport=9000` so it uses the local server. Fix anything that's broken.
3. Commit and push to `main` (or open a pull request for me to merge, if you can't push to `main`).
4. Tell me step by step how to turn on the website: **Settings → Pages → Source → GitHub Actions**.
   Then re-run the "Deploy to GitHub Pages" workflow if its first run failed (it fails if Pages
   wasn't turned on yet). Give me the final link, which will look like
   `https://<my-username>.github.io/<repo-name>/`.

Things to know:
- The multiplayer relay credentials in `js/net.js` (ExpressTURN) are mine and are meant to be in the code.
- Never commit any photos. The Monster Face Photo option keeps the picture only in the host's browser.
- Saved worlds live in each player's browser (localStorage), and that storage is tied to the
  website address. A new address starts with no saves. To keep a world, the host uses
  **Export Save File** on the old site, then **Import Save** on the new one.
