# Prompt to rebuild Victor's World

Paste everything below the line into a new Claude Code chat.

Note: this describes the original peer-to-peer (PeerJS) version. The game now runs its
multiplayer on a Cloudflare Worker + Durable Object game server instead (see `server/worker.js`
and the README); use that design for the Multiplayer section if you rebuild it.

---

Build a browser game called **Victor's World**: a pixel-art, co-op monster-swarm game (like Vampire Survivors / a "swarm arena") with a top-down three-quarter camera like Stardew Valley. Friends play together in their browsers on computers and phones. It must be a static website (plain HTML, CSS and JavaScript ES modules, no build step) that can be hosted on GitHub Pages.

## Look and feel
- Camera: top-down three-quarter view like Stardew Valley. Square 16x16 pixel tiles; trees, buildings and characters stand up toward the camera. Depth-sort everything by the y position of its feet so you can walk behind trees and buildings. Tall things (trees, giant mushrooms, the cottage) turn see-through when a player is behind them.
- Render at a low resolution (about 400x230 pixels, sized to fill the window) and scale up with crisp pixels (`image-rendering: pixelated`).
- All art is drawn in code, not image files. Draw it with pixel templates and procedural drawing, with 1px dark outlines on characters, monsters and props.
- World art: grass with tufts and tiny flowers; ponds with a brown dirt bank along their top edge, light foam on the other edges and lily pads; sandy shores; cobblestone roads; ragged grass edges spilling onto paths; rounded corners on ponds and clearings; round leafy oak trees; teal pine trees; giant red-and-white mushrooms; rocks, berry bushes and stumps.
- Camp in the middle of the map: a dirt clearing with a campfire, a red-roofed cottage with a fenced front yard and barrels, and a merchant standing behind a striped market stall with a floating "SHOP" sign.
- Use the "Press Start 2P" Google Font for menus. In-game names and damage numbers use a hand-made 3x5 pixel font drawn on the canvas.
- Chiptune music and sound effects made with the Web Audio API (square, triangle and noise waves): a calm camp song, a battle song during waves, and sounds for shooting, hits, deaths, XP, coins, level-up, waves, the boss, a party wipe, dash and sword slash. Mute with M and in Settings.

## Characters
- Character creator with a live, rotatable, walking preview: name (12 characters max), 6 skin tones, 8 hair styles (Short, Spiky, Long, Ponytail, Afro, Mohawk, Bun, Bald), 8 hair colors, 6 outfits (Tunic, Knight, Wizard with a pointy hat, Ninja with headband and mask, Hoodie, Overalls) and 8 outfit colors. Include a Random button.
- Sprites are about 12x18 pixels, with 4 facing directions (down, up, right, and left as a mirror of right) and a 4-frame walk cycle.
- The profile (name, look and a random player ID) is saved in localStorage.

## Multiplayer (peer-to-peer, no game server)
- Use PeerJS (vendor `peerjs.min.js` into the repo, version 1.5.x) with the free public PeerJS signaling server. One player hosts in their browser and gets a 5-letter room code (no confusing letters like O/0 or I/1). Friends join with the code, or with an invite link `?join=CODE`. Up to 8 players.
- The host runs the authoritative simulation at 60 ticks per second and sends snapshots about 15 times a second: players, monsters, projectiles, pickups and events. Each player's snapshot also carries their private stats (level, XP, gold, upgrade choices).
- Each client moves its own character locally (instant response) and sends its position to the host about 20 times a second. Other players and monsters are smoothed between snapshots, and projectiles move by their velocity between snapshots. Teleports (for example after a party wipe) use a counter so stale positions are ignored.
- Support optional URL parameters `?peerhost=&peerport=&peersecure=` for a self-hosted PeerJS server (used for local testing).
- Show friendly errors: room not found, world full, already joined from another tab, host left, and "found the world but couldn't connect from this network".
- Relays for players on different networks (mobile data blocks direct connections): use several STUN servers plus PeerJS's free TURN relay (`turn:eu-0.turn.peerjs.com:3478`, `turn:us-0.turn.peerjs.com:3478`, user `peerjs`, password `peerjsp`). Add a **Multiplayer Relay** section in Settings where the host can paste their own TURN address(es), username and password (for example from ExpressTURN's free tier). Put the relay first in the ICE server list. The host's invite link carries the relay (base64 in a `relay=` URL parameter) and joining through it saves it, so friends get it automatically. Add `?relayonly=1` to force relay-only connections for testing.
- Build in my own free ExpressTURN relay as well, tried before the PeerJS one: `turn:free.expressturn.com:3478` (UDP) and `turn:free.expressturn.com:3478?transport=tcp`, username `000000002107188947`, password `DJMBMEgVEpOL48nUKsBdaTONLlk=`. It's fine for these to be in the code, because every player's browser needs them.
- In-game chat (Enter to type).
- The host's world keeps running when their tab is in the background.
- Reliable reconnects: if the same player (same player ID) joins again, the new connection replaces the old one. The host drops friends it hasn't heard from for 12 seconds. A client that hears nothing from the host for 10 seconds, or whose connection fails, goes back to the join screen and retries automatically about 8 times over a minute. Use the Screen Wake Lock API so phones don't sleep mid-game, and reconnect to the signaling server when the page becomes visible again.

## Saves
- The host's worlds are saved in localStorage: name, map seed, current wave, checkpoint, best wave, kills, and each player's progress keyed by their player ID (level, XP, gold, weapons, passives, permanent upgrades). When a friend rejoins, their progress comes back. Autosave every 30 seconds, after every wave, and when someone joins or leaves.
- The host screen lists saved worlds (Play, Export to a .json file, Delete), lets you create a new world, and imports a save file.

## World
- A 56x56 tile map generated from a seed, so the host and clients build the same map: a forest border, up to 6 ponds away from camp and roads, sand shores, two cobblestone roads crossing at camp, and scattered trees, rocks, bushes, stumps and mushrooms.
- Water, trees, rocks, buildings and fences block walking (bushes don't). Collision is tile-based on each character's feet. Monsters that get stuck slip through obstacles briefly, and bosses walk through them, so a wave can never get stuck.

## Gameplay
- Waves: everyone at camp presses Ready (R or a button), and the wave starts when everyone is ready. Monsters spawn just off screen around the players, and there are more of them each wave and with more players. Once a wave is cleared there is a 7-second break, then the next wave starts. Every 5th wave is a boss wave (the Ogre King, big, with a charge attack). Beating a boss saves a checkpoint and sends everyone back to camp to rest and shop.
- Monsters, unlocked as waves go up: slime, bat (flies over water), goblin, skeleton, ghost (flies), imp (stays at range and shoots fireballs), and the Ogre King boss. HP and damage scale with the wave number and the player count. Monsters push apart from each other. They flash white when hit, and an HP bar shows once damaged. When 5 or fewer are left, arrows at the screen edge point to off-screen ones.
- Players: 100 HP, can dash (Space/Shift or a button) with a moment of invulnerability, and get a short invulnerability after taking a hit.
- Downed players become a tombstone with a ghost. A teammate standing next to them for 3 seconds revives them. If everyone is down, the party wipes back to the last checkpoint.
- Automatic weapons, levels 1 to 5: Magic Bolt (aims at the nearest monster; more bolts and piercing at higher levels), Orbit Blades, Holy Aura (damages monsters near you), Lightning (strikes random nearby monsters).
- The sword is a weapon too (every player starts with Sword level 1). Its levels add reach (1.6 tiles, +0.3 per level), damage (+25% per level) and swing speed.
- Giant Sword power-up: a rare glowing sword pickup (about 1.2% of kills; the boss always drops one). Picking it up makes an absurdly long sword (9 tiles, about 7 pixels wide) spin around the player for 5 seconds (it stacks up to 10), hitting everything along the blade with knockback. Because the tip moves so fast, hits check the whole arc the blade swept through each tick. It's drawn on top of everything, rotated, with a swirl trail, and blinks when it's about to run out. Everyone sees it, because the remaining time is sent in the snapshots.
- Manual sword slash: J/K or the mouse (aims at the cursor), or a big Attack button on phones. It hits everything in an arc in front of you, with knockback.
- Passives, levels 1 to 5: Might (+damage), Vitality (+max HP), Swift Feet (+speed), Magnet (+pickup range), Regen.
- Monsters drop XP gems, sometimes coins and rarely hearts. XP is shared by the whole party. On level-up each player picks 1 of 3 random upgrades (keys 1/2/3 or tap a card).
- Level-ups pause the whole game for everyone: a full-screen level-up panel shows in front of everything (including touch buttons). Players who have picked see "PAUSED, waiting for <names>". If someone doesn't pick within 30 seconds, an upgrade is picked for them at random. Players get a moment of invulnerability when play resumes.
- The merchant shop (press E near the stall) sells permanent upgrades for gold: Power Crystal, Heart Gem, Wind Boots, and Potions.
- Healing: fast in camp between waves, plus any Regen.

## Controls
- Keyboard: WASD/arrows to move, Space/Shift to dash, J/K or the mouse to attack, R to ready up, E for the shop, 1/2/3 to pick upgrades, Enter to chat, M to mute, Esc for the menu.
- Phones and tablets: a floating joystick wherever your thumb lands on the left side of the screen, plus big round Attack and Dash buttons at the bottom right. Moving and attacking must work at the same time (multi-touch). Show the touch controls whenever a touch is detected.

## HUD and menus
- Chat: messages appear at the bottom-left and fade after 10 seconds. A Chat button opens a panel with the full history and a Send box, and shows an unread count.
- On phones, the action buttons (Ready, Shop, Chat, Menu) stack in a column above the Attack/Dash pad, the chat log sits above the joystick, the wave text sits below the stats, and the weapon list is hidden.
- HUD: name, level, HP bar and XP bar, gold, and owned weapons and passives (top left). Wave number and status (top center), plus a boss HP bar. Room code and player list with HP (top right). Big announcements (WAVE 5, BOSS WAVE, WAVE CLEAR!, PARTY WIPED). Chat log (bottom left). Level-up cards. Shop modal.
- Pause menu (the game keeps running): Resume, Copy Invite Link, Save World (host), Export Save File (host), Monster Face Photo (host), Mute, Leave.
- Title screen: the logo over a live demo of the world, a preview of your hero, and Host a World, Join a Friend and Edit Character, with a pixel-gear Settings button in the panel's top-right corner. In game, the ☰ menu button sits in the top-right next to the room code. The wave/status text moves itself below the stats and player list whenever they would overlap.

## Monster Face Photo (Settings on the title screen, and in the host's pause menu)
- The host can pick a photo. Crop the middle (a little high, where faces usually are), shrink it to a 32x32 pixel-art face with fewer colors, and store only that tiny PNG in localStorage. Never commit any photo to the repo.
- When set, every monster becomes that face in a circle, with a costume for its type: slime goo, bat wings, goblin ears, a grayscale skeleton with teeth, a see-through ghost with a wispy tail, a red imp with horns, and a big Ogre King with a crown. Settings shows a preview of all of them, with Remove to go back to normal monsters.
- The host sends the tiny face to friends when they join, and again when it changes.

## Project
- Files: `index.html`, `style.css`, and `js/` modules: `main.js` (menus, creator, settings, host/join), `game.js` (session loop, networking glue, HUD), `sim.js` (rules, host only), `world.js` (map generation and collision), `render.js` (renderer), `scenery.js` (ground painting and prop art), `sprites.js` (characters, monsters, small sprites, pixel font, face monsters), `audio.js`, `input.js`, `net.js`, `save.js`, `util.js`, and `js/vendor/peerjs.min.js` with its license.
- Add a GitHub Actions workflow that deploys the repo root to GitHub Pages on pushes to `main` (configure-pages, upload-pages-artifact, deploy-pages). Tell me to set Settings → Pages → Source to "GitHub Actions".
- Write a README with features, controls and how to play.
- Test it before you finish: run a local static server and a local PeerJS server (the `peer` npm package), then use headless Chromium (Playwright) to have one browser host and another join with the code, ready up and fight a wave. Also test the relay with a local TURN server (the `node-turn` npm package) and `?relayonly=1`, check the selected ICE candidate pair is `relay`, test the phone controls with simulated multi-touch, and run a headless simulation of many waves to check waves can't get stuck. Fix anything that fails.
