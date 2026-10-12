# Victor's World

A pixel-art, top-down (three-quarter view) co-op monster-swarm game that runs in the browser.
Make your hero, host a world, and have your friends join with a room code to fight
waves of monsters together.

## Features

- **Character creator:** 6 skin tones, 8 hair styles, 8 hair colors, 6 outfits (Tunic, Knight,
  Wizard, Ninja, Hoodie, Overalls) and 8 outfit colors.
- **Co-op multiplayer (up to 8 players):** one person hosts in their browser and friends join
  with a 5-letter room code or an invite link. It's peer-to-peer over WebRTC (PeerJS), so you
  don't need to run a game server.
- **Saves:** the host's worlds are saved in their browser and autosaved. Each friend's level,
  upgrades and gold are saved inside the host's world too. You can export a save to a file and
  import it on another computer, so someone else can take over hosting.
- **Swarm combat:** auto-firing weapons, waves that get harder, an Ogre King boss every 5 waves
  (beating it saves a checkpoint), level-up upgrades (the game pauses until everyone has picked), reviving downed friends, and a merchant
  at camp who sells permanent upgrades for gold.
- **Monster Face Photo:** pick any photo in **Settings** on the title screen (or the host's pause
  menu). It's shrunk into a
  tiny pixel-art face and every monster wears it (with slime goo, bat wings, imp horns, a boss
  crown...). Only that tiny version is kept, in the host's world save, and it's sent straight to
  friends when they join. It's never uploaded anywhere else, and **Reset** puts the normal
  monsters back.
- **Sword:** slash with J/K, the mouse, or the Attack button. It levels up (longer reach, more
  damage, faster swings) through level-up picks. Monsters sometimes drop a glowing **Giant Sword**
  (the Ogre King always does): an absurdly long blade (9 tiles!) spins around you for 5 seconds and cuts through
  everything.
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

The game is a static website with no build step.

- **Online:** after this is merged to `main`, turn on GitHub Pages (Settings -> Pages ->
  Source: **GitHub Actions**). The workflow in `.github/workflows/pages.yml` publishes the game at
  `https://victorrong66.github.io/storm-stand/`.
- **Locally:** serve the folder with any static web server (ES modules don't load from `file://`):

  ```sh
  python3 -m http.server 8080
  # then open http://localhost:8080
  ```

### Multiplayer notes

- Matchmaking uses the free public PeerJS server. After two players find each other, game data
  goes directly between their browsers.
- The host's tab has to stay open and in front. The game asks the phone not to sleep while playing,
  but if the host switches apps or locks the phone, the world pauses and friends drop. When a
  friend's connection drops, their game reconnects by itself for about a minute, and their
  progress is kept.
- Some networks (mobile data, some school or office Wi-Fi) block direct peer-to-peer
  connections. The game then falls back to a **relay** (TURN server). It has two built in: an
  [ExpressTURN](https://www.expressturn.com/) free-tier relay and PeerJS's free relay. You can add
  another one in **Settings → Multiplayer Relay** (address, username and password). The host's invite link (pause menu →
  Copy Invite Link) carries the relay, so friends who join through it are set up automatically.
- You can use your own PeerJS server instead of the public one by adding URL parameters:
  `?peerhost=my.server.com&peerport=443&peersecure=1`.

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
| `js/net.js` | PeerJS host/join helpers |
| `js/save.js` | Saves, profiles, import/export |
| `js/vendor/peerjs.min.js` | PeerJS 1.5.5 (MIT license) |
