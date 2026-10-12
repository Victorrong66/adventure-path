# Start here: prompt for a new Claude Code chat

Start a new Claude Code chat on your new GitHub repo, attach this zip file
(victors-world.zip), and paste everything below the line.

---

I've attached victors-world.zip. It's my finished browser game "Victor's World" (a pixel-art co-op monster-swarm game with peer-to-peer multiplayer). Put this exact game into this repository and publish it with GitHub Pages. Don't rewrite or redesign anything; I want the same code.

1. Unzip the attached file. It contains one top-level folder (named "victors-world" or "victors-world-claude-isometric-swarm-game"). Move everything inside that folder, including the hidden .github folder, to the root of this repo. Don't nest it in a subfolder.
2. Check these files are all there: START-HERE-PROMPT.md, index.html, style.css, README.md, package.json, package-lock.json, wrangler.jsonc, .assetsignore, .gitignore, .github/workflows/deploy.yml, server/worker.js, docs/rebuild-prompt.md, docs/new-chat-prompt.md, and in js/: main.js, game.js, sim.js, world.js, render.js, scenery.js, sprites.js, audio.js, input.js, net.js, save.js, util.js.
3. The game is hosted on Cloudflare Workers (free plan): one Worker serves the website and runs the game server (a Durable Object per room code). Deploys happen through .github/workflows/deploy.yml, which needs the repository secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
4. Test it before pushing. Run `npm install` and `npx wrangler dev --port 8787 --persist-to <a folder outside the repo>` (state inside the repo makes the dev server reload in a loop), then use headless Chromium (Playwright) to have one browser host a world and a second browser join with the room code. Both should ready up and fight a wave. Fix anything that's broken, and show me a screenshot.
5. Commit and push to main. If you can't push to main, open a pull request and tell me to merge it.
6. Then walk me through setting up Cloudflare step by step (I'm usually on my phone): make a free Cloudflare account, create an API token from the "Edit Cloudflare Workers" template, copy the Account ID, add both as GitHub repository secrets, and re-run the "Deploy to Cloudflare" workflow. Finally, give me the live link (https://victors-world.<subdomain>.workers.dev).

Notes:
- Never commit any photos. The Monster Face Photo feature keeps the picture only in the host's browser.
- If you can't open the zip, tell me, and copy the files from my old repo Victorrong66/victors-world (branch claude/isometric-swarm-game) instead.
