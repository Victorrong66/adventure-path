# Ember Arena

A pixel-art, top-down (three-quarter view) co-op monster-swarm game that runs in the browser.
Make your hero, host a world, and have your friends join with a room code to fight
waves of monsters together.

## Features

- **Character creator:** 6 skin tones, 8 hair styles, 8 hair colors, 6 outfits (Tunic, Knight,
  Wizard, Ninja, Hoodie, Overalls) and 8 outfit colors.
- **Co-op multiplayer (up to 8 players):** one person hosts a world and friends join with a
  5-letter room code or an invite link. The game itself runs on a small server on Cloudflare
  (free plan), so nobody connects to anybody else's device. Each world keeps its room code, so
  friends can rejoin with the same code next time.
- **Saves:** the host's worlds are saved in their browser and autosaved. Each friend's level,
  upgrades and gold are saved inside the host's world too. You can export a save to a file and
  import it on another computer, so someone else can take over hosting.
- **Swarm combat:** auto-firing weapons, waves that get harder, an Ogre King boss every 5 waves
  (beating it saves a checkpoint), level-up upgrades (level-ups add up during a wave and everyone picks them once it's cleared; the countdown to the next wave starts when everyone has picked), monsters drawn from tools/mobs.png (slimes, goblins, skeletons, shroomlings, bats and big rock golems), fireball-throwing Devils (tools/devil.png) and the Ogre King boss (tools/ogre.png), who charges with a club swing and stops to smash the ground when you get close, monsters that get tougher and hit harder every wave, reviving downed friends, and a merchant
  at camp who sells permanent upgrades for gold (the shop is private: the game keeps going for
  everyone else).
- **Joining mid-game:** someone who joins during a wave watches until it's over, then joins the
  party, catches up to the party's level and picks an upgrade for each level they missed.
- **Reviving:** in **Settings**, the host picks how downed friends come back: *Revive in Place*
  (stand next to them for 3 seconds) or *Reboot Van* (grab the player card they drop, carry it to
  the Reboot Van and drop it off, then stay by the van while it reboots them (walk away and the
  reboot pauses where it was). If you go down while carrying a card, it drops).
- **Monster Face Photo:** pick any photo in **Settings** on the title screen (or the host's pause
  menu). It's shrunk into a
  tiny pixel-art face and every monster wears it (with slime goo, bat wings, imp horns, a boss
  crown...). Only that tiny version is kept, in the host's world save, and it's sent straight to
  friends when they join. It's never uploaded anywhere else, and **Reset** puts the normal
  monsters back.
- **Sword:** slash with J/K, the mouse, or the Attack button. It levels up (longer reach, more
  damage, faster swings) through level-up picks. Walk up to the **Mystery Box** next to the Reboot
  Van spot at camp and press its glowing button (or F) to spin it for 30 gold. It rattles open and flicks
  through its prizes until it stops on a random one, which then slowly sinks back in: press the button
  again to take it before it's gone. Prizes (equal odds): **Hero Sword** (double damage, longer slashes,
  15s), **Battle Axe** (slashes hit all around you, 12s), **Thunder Hammer** (ground slams that knock
  monsters back, 12s), **Reaper Scythe** (wide slashes, kills heal you, 15s), **Plasma Blaster**
  (rapid-fire piercing shots, 10s) and the **Giant Sword** (an absurdly long blade, 9 tiles!, spins around
  you for 10s and cuts through everything).
- **Test Arena:** a button on the title screen opens a sandbox world (its own save, never in your
  world list) where monsters only come when you spawn them. Press **T** (or Arena Tools) to spawn any
  monster or the Ogre King, clear them, change the monster level, take any Mystery Box weapon, get gold
  or a level, heal, turn on god mode, knock yourself down, and switch between Revive in Place and the
  Reboot Van. Friends can join it with its room code to try things together.
- **Fair spawns:** monsters always appear just off every player's screen, never on top of anyone.
- **8-bit everything:** pixel art drawn in code, a pixel font, and chiptune music and sound effects.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrow keys | Move |
| J / K, or click/hold the mouse | Sword slash (aims at the mouse, or the way you're facing) |
| Space / Shift | Dash (short dodge, you can't be hurt while dashing) |
| R | Ready up (a wave starts when everyone at camp is ready) |
| E | Open the shop (stand next to the merchant) |
| 1 / 2 / 3 | Pick a level-up upgrade |
| Enter | Open chat (or tap **Chat**) |
| M | Mute |
| Esc | Menu (invite link, save, export, leave) |

On phones and tablets, drag anywhere on the left side of the screen to move (a joystick appears under your thumb), hold the big red **Attack** button to slash, and tap **Dash** to dodge. You can move and attack at the same time.

## Playing

The game is plain HTML, CSS and JavaScript (no build step) plus a small game server
(`server/worker.js`) that runs on Cloudflare Workers with Durable Objects. One Cloudflare Worker
serves both the website and the game server.

- **Online:** every push to `main` deploys to Cloudflare through `.github/workflows/deploy.yml`.
  It needs two repository secrets (Settings → Secrets and variables → Actions):
  `CLOUDFLARE_API_TOKEN` (made from the "Edit Cloudflare Workers" template) and
  `CLOUDFLARE_ACCOUNT_ID`. The game is then at `https://victors-world.<your-subdomain>.workers.dev`.
- **Locally:** `npm install`, then `npm run dev` and open http://localhost:8787.

### Multiplayer notes

- Each room code gets its own Durable Object on Cloudflare. It runs the game rules (`js/sim.js`)
  and sends everyone 20 updates a second over a WebSocket.
- The host's browser keeps the save. The server sends the host the latest copy every 30 seconds
  and after waves, and the host can **Save World** or **Export Save File** from the pause menu.
- If anyone drops (the host too), the world keeps going for everyone else and their game
  reconnects by itself for about a minute. An empty world waits 60 seconds, then closes.
- Each world keeps its room code. Anyone who has the code can join while the world is open, so
  use **New Code** in the world list to stop old codes working.
- Cloudflare's free plan gives Durable Objects a daily allowance (100,000 requests, reset at
  midnight UTC), and messages from players count toward it (see Cloudflare's Durable Objects
  pricing page for exactly how). To stay well inside it, the game only sends your position when
  you move, 15 times a second at most, plus a small keep-alive every couple of seconds.

## Moving to a new repo

`START-HERE-PROMPT.md` has a prompt to paste into a new Claude Code chat, along with this
game's zip file, to set the game up in a new repo.

## Rebuilding from scratch

`docs/rebuild-prompt.md` has a prompt you can paste into a new Claude Code chat to rebuild this
game.

## Code layout

| File | What it does |
| --- | --- |
| `js/main.js` | Menus, character creator, hosting and joining |
| `js/game.js` | A running session: game loop, networking glue, HUD |
| `js/sim.js` | The game rules (the host runs this): waves, monsters, weapons, upgrades, shop |
| `js/world.js` | The seeded map (ponds, paths, groves, camp) and collision |
| `js/render.js` | Top-down pixel renderer (depth sorting, effects, names) |
| `js/scenery.js` | Ground painting (grass, paths, ponds) and scenery art (trees, cottage, stall...) |
| `js/sprites.js` | All pixel art (characters, monsters, props, tiles) and the pixel font |
| `js/audio.js` | Chiptune sound effects and music |
| `js/net.js` | Connecting to a room on the game server |
| `server/worker.js` | Cloudflare Worker + Durable Object game server (one per room code) |
| `js/save.js` | Saves, profiles, import/export |
