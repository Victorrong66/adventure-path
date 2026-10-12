# Start here: prompt for a new Claude Code chat

Start a new Claude Code chat on your new GitHub repo, attach this zip file
(victors-world.zip), and paste everything below the line.

---

I've attached victors-world.zip. It's my finished browser game "Victor's World" (a pixel-art co-op monster-swarm game with peer-to-peer multiplayer). Put this exact game into this repository and publish it with GitHub Pages. Don't rewrite or redesign anything; I want the same code.

1. Unzip the attached file. It contains one top-level folder (named "victors-world" or "victors-world-claude-isometric-swarm-game"). Move everything inside that folder, including the hidden .github folder, to the root of this repo. Don't nest it in a subfolder.
2. Check these files are all there: START-HERE-PROMPT.md, index.html, style.css, README.md, .github/workflows/pages.yml, docs/rebuild-prompt.md, docs/new-chat-prompt.md, and in js/: main.js, game.js, sim.js, world.js, render.js, scenery.js, sprites.js, audio.js, input.js, net.js, save.js, util.js, vendor/peerjs.min.js, vendor/PEERJS_LICENSE.
3. Update the README's website link to match this repo's name: https://<my-github-username>.github.io/<this-repo-name>/
4. Test it before pushing. Serve the folder with a static server, run a local PeerJS server (the "peer" npm package), and use headless Chromium (Playwright) to have one browser host a world and a second browser join with the room code. Load the page with ?peerhost=127.0.0.1&peerport=9000 so it uses the local server. Both should ready up and fight a wave. Fix anything that's broken, and show me a screenshot.
5. Commit and push to main. If you can't push to main, open a pull request and tell me to merge it.
6. Then walk me through turning on the website, step by step. I'm usually on my phone. Go to Settings → Pages → Source → "GitHub Actions". If the first "Deploy to GitHub Pages" run failed because Pages wasn't on yet, re-run it. Finally, give me the live link.

Notes:
- The ExpressTURN relay username and password in js/net.js are mine and are meant to be in the code. Leave them.
- Never commit any photos. The Monster Face Photo feature keeps the picture only in the host's browser.
- If you can't open the zip, tell me, and copy the files from my old repo Victorrong66/victors-world (branch claude/isometric-swarm-game) instead.
