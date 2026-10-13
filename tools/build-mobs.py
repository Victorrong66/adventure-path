# Builds assets/mobs.png and js/mob-frames.js from tools/mobs.png: a labelled sheet with
# a row per monster, walking left (left half) and walking right (right half).
# The source has a checkerboard drawn in, dark label boxes and divider lines.
# Run from the repo root: python3 tools/build-mobs.py
import json
from PIL import Image

SRC = 'tools/mobs.png'
# monster: (rows y0, y1 in the source, height in game pixels)
ROWS = {
    'slime': (52, 152, 14), 'goblin': (196, 332, 23), 'skeleton': (366, 512, 25),
    'shroomling': (552, 676, 19), 'bat': (725, 845, 14), 'golem': (878, 1018, 30),
}
MID = 770  # x of the line between the walk-left and walk-right halves
DETAIL = 2  # sprites are made at twice game size and drawn at half (finer pixels)

def clean(path):
    """Load a sheet and remove its label boxes, divider lines and checkerboard."""
    global W, H, px
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    px = im.load()

    def flood(starts, pred):
        seen = set(starts); st = list(starts); out = []
        while st:
            x, y = st.pop(); out.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and pred(px[nx, ny]):
                    seen.add((nx, ny)); st.append((nx, ny))
        return out

    # label boxes (dark navy rectangles) and divider lines (long, thin, grey)
    navy = lambda q: max(q[:3]) <= 60 and q[2] - q[0] >= 6
    line = lambda q: max(q[:3]) - min(q[:3]) <= 16 and 70 <= sum(q[:3]) / 3 <= 150
    done = set()
    for y in range(H):
        for x in range(W):
            if (x, y) in done: continue
            for pred, kind in ((navy, 'label'), (line, 'line')):
                if not pred(px[x, y]): continue
                c = flood([(x, y)], pred); done.update(c)
                xs = [q[0] for q in c]; ys = [q[1] for q in c]
                w, h = max(xs) - min(xs), max(ys) - min(ys)
                if kind == 'label' and len(c) > 1200 and w > 80 and h < 40:
                    for yy in range(min(ys) - 3, max(ys) + 4):
                        for xx in range(min(xs) - 3, max(xs) + 4): px[xx, yy] = (0, 0, 0, 0)
                elif kind == 'line' and (w > 120 and h <= 6 or h > 120 and w <= 6):
                    for q in c: px[q] = (0, 0, 0, 0)
                break
    checker = lambda q: not q[3] or (max(q[:3]) - min(q[:3]) <= 18 and sum(q[:3]) / 3 >= 165)
    edge = [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
    for q in flood([q for q in edge if checker(px[q])], checker): px[q] = (0, 0, 0, 0)
    # checkerboard shut inside shapes (between legs, under wings): big neutral-light pockets
    # that aren't ringed by dark outline
    for y in range(H):
        for x in range(W):
            if (x, y) in done or not checker(px[x, y]) or not px[x, y][3]: continue
            c = flood([(x, y)], lambda q: q[3] and checker(q)); done.update(c)
            if len(c) < 40: continue
            cs = set(c); edges = dark = 0
            for cx, cy in c:
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if (nx, ny) in cs or not (0 <= nx < W and 0 <= ny < H): continue
                    edges += 1
                    if px[nx, ny][3] and sum(px[nx, ny][:3]) < 200: dark += 1
            # real checkerboard has both its light and darker squares (a fireball's white core doesn't)
            mid = sum(1 for q in c if sum(px[q][:3]) / 3 < 240) / len(c)
            if dark / max(1, edges) < 0.12 and mid > 0.15:
                for q in c: px[q] = (0, 0, 0, 0)


    return im

im = clean(SRC)

def shapes(x0, y0, x1, y1):
    seen = set(); out = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y) in seen or not px[x, y][3]: continue
            st = [(x, y)]; seen.add((x, y)); c = []
            while st:
                cx, cy = st.pop(); c.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if x0 <= nx < x1 and y0 <= ny < y1 and (nx, ny) not in seen and px[nx, ny][3]:
                        seen.add((nx, ny)); st.append((nx, ny))
            out.append(c)
    return out

frames = []  # (name, animation, image)
for name, (y0, y1, height) in ROWS.items():
    for side, (x0, x1) in (('left', (0, MID - 4)), ('right', (MID + 4, W))):
        parts = shapes(x0, y0, x1, y1)
        big = sorted([c for c in parts if len(c) >= 400], key=lambda c: min(q[0] for q in c))
        cells = [list(c) for c in big]
        mid = [sum(q[0] for q in c) / len(c) for c in big]
        for c in parts:  # loose bits (bubbles, pebbles) go with the nearest monster
            if len(c) >= 400 or len(c) < 12: continue
            cx = sum(q[0] for q in c) / len(c)
            cells[min(range(len(big)), key=lambda i: abs(mid[i] - cx))] += c
        for c in cells:
            cell = Image.new('RGBA', im.size); cp = cell.load()
            for q in c: cp[q] = px[q]
            frames.append((name, side, cell.crop(cell.getbbox())))
HEIGHT = {name: h for name, (_, _, h) in ROWS.items()}

# Sheets with one monster each and several animations, whose frames can touch:
# each animation is (rows y0-y1, x positions of the cuts between frames).
EXTRA = [
    ('tools/ogre.png', 'ogre', 46, {
        'left': ((95, 275), [10, 152, 287, 405, 533, 740]),
        'right': ((95, 275), [760, 890, 1012, 1140, 1260, 1380, 1528]),
        'idle': ((320, 525), [15, 163, 300, 438, 571, 712]),
        'swing': ((320, 525), [715, 848, 1005, 1162, 1328, 1528]),
        'smash': ((565, 790), [12, 165, 305, 445, 600, 760, 935, 1095, 1255, 1402, 1530]),
        'hurt': ((835, 995), [15, 165, 302, 437, 578]),
        'die': ((835, 995), [578, 736, 906, 1050, 1287, 1530]),
    }),
    ('tools/devil.png', 'imp', 26, {  # the Devil (it used to be an imp)
        'left': ((165, 352), [0, 172, 322, 467, 610, 768]),
        'right': ((165, 352), [800, 957, 1100, 1245, 1385, 1536]),
        'shootL': ((490, 665), [0, 190, 400, 575, 768]),
    }),
    ('tools/devil.png', 'fireball', 12, {
        'fly': ((795, 925), [55, 270, 490, 720, 940]),
        'burst': ((795, 925), [940, 1150, 1320, 1470]),
    }),
]
for path, name, height, anims in EXTRA:
    im = clean(path)
    HEIGHT[name] = height
    for anim, ((y0, y1), cuts) in anims.items():
        cells = [[] for _ in cuts[:-1]]
        cell_of = lambda x: max(0, min(len(cells) - 1, next((i for i in range(len(cells)) if x < cuts[i + 1]), len(cells) - 1)))
        for c in shapes(cuts[0], y0, cuts[-1], y1):
            if len(c) < 12: continue
            count = {}
            for x, y in c: count[cell_of(x)] = count.get(cell_of(x), 0) + 1
            best = max(count, key=count.get)
            if count[best] >= len(c) * 0.8: cells[best] += c   # mostly in one frame: keep it whole
            else:
                for x, y in c: cells[cell_of(x)].append((x, y))  # touching frames: split at the cut
        for c in cells:
            cell = Image.new('RGBA', im.size); cp = cell.load()
            for q in c: cp[q] = px[q]
            frames.append((name, anim, cell.crop(cell.getbbox())))
    if name == 'imp':  # shooting to the right: the left-facing frames mirrored
        frames += [(name, 'shootR', f.transpose(Image.FLIP_LEFT_RIGHT)) for n, a, f in frames if n == name and a == 'shootL']

# scale each monster so its frames average the wanted height (at DETAIL x game size)
out = []
for name, height in HEIGHT.items():
    mine = [f for f in frames if f[0] == name]
    ref = [f for f in mine if f[1] in ('left', 'right')] or mine[:1]  # size by the walk (or first) frames
    k = height * DETAIL / (sum(f[2].height for f in ref) / len(ref))
    for _, side, f in mine:
        sm = f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.BOX)
        p = sm.load()
        for y in range(sm.height):
            for x in range(sm.width):
                r, g, b, a = p[x, y]
                p[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
        sm = sm.crop(sm.getbbox())
        out.append((name, side, sm))

# pack in one strip; anchor = middle of the bottom few rows (where it stands)
# (in rows no wider than MAX_W, so phones are happy with the image)
MAX_W = 2048
rows, cur, w = [], [], 0
for item in out:
    if cur and w + item[2].width + 1 > MAX_W: rows.append(cur); cur, w = [], 0
    cur.append(item); w += item[2].width + 1
rows.append(cur)
heights = [max(f.height for _, _, f in r) for r in rows]
atlas = Image.new('RGBA', (MAX_W, sum(h + 1 for h in heights))); meta = {}; y = 0
for r, rh in zip(rows, heights):
    x = 0
    for name, side, f in r:
        p = f.load()
        xs = [xx for yy in range(f.height - 4, f.height) for xx in range(f.width) if p[xx, yy][3]]
        ax = (min(xs) + max(xs)) // 2 if xs else f.width // 2
        atlas.paste(f, (x, y + rh - f.height))
        meta.setdefault(name, {}).setdefault(side, []).append([x, y + rh - f.height, f.width, f.height, ax])
        x += f.width + 1
    y += rh + 1
atlas.save('assets/mobs.png')
open('js/mob-frames.js', 'w').write(
    '// Generated from tools/mobs.png by tools/build-mobs.py: [x, y, w, h, anchorX] per frame,\n'
    '// at twice game size (drawn at half size).\n'
    'export const MOB_FRAMES = ' + json.dumps(meta) + ';\n')
print('wrote assets/mobs.png', atlas.size, {k: {a: len(v) for a, v in d.items()} for k, d in meta.items()})
