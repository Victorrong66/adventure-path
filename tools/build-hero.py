"""Builds the hero sprite atlas from tools/hero-sheet.png: cuts out the frames we use,
shrinks them to game size and marks which pixels can be recoloured."""
import sys, json, colorsys
from PIL import Image
# Usage: python3 tools/build-hero.py   (run from the repo root)
def clear_checker(im):
    """Remove a checkerboard 'transparency' pattern drawn into the image."""
    im = im.convert('RGBA'); px = im.load(); W, H = im.size
    def bg(p):
        r, g, b, a = p
        return a and abs(r - g) <= 4 and abs(g - b) <= 4 and r >= 196
    seen = bytearray(W * H)
    def fill(starts, keep_small=None):
        comp = []
        st = [s for s in starts if bg(px[s]) and not seen[s[1] * W + s[0]]]
        for s in st: seen[s[1] * W + s[0]] = 1
        while st:
            x, y = st.pop(); comp.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and bg(px[nx, ny]):
                    seen[ny * W + nx] = 1; st.append((nx, ny))
        return comp
    border = [(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)]
    for x, y in fill(border): px[x, y] = (0, 0, 0, 0)
    # enclosed pockets of background (between arms and body etc.)
    for y in range(H):
        for x in range(W):
            if not seen[y * W + x] and bg(px[x, y]):
                comp = fill([(x, y)])
                if len(comp) >= 40:
                    for cx, cy in comp: px[cx, cy] = (0, 0, 0, 0)
    return im

im = clear_checker(Image.open('tools/hero-sheet.png'))
# Frame boxes on the sheet (x0, y0, x1, y1). Rows: front (5), walk right (9),
# walk left (9), back (5), swing right (7), swing left (7, drawn mirrored so listed
# right-to-left), then hurt / knocked out / victory.
F = {
 '_front': [(355,21,448,167),(475,16,571,174),(608,16,700,174),(731,16,828,167),(862,16,958,169)],
 '_side':  [(38,189,167,353),(165,190,299,354),(300,190,432,352),(434,191,566,354),(567,192,709,358),
           (709,191,842,353),(844,192,977,355),(994,192,1113,356),(1123,191,1250,355)],
 '_sideL': [(63,369,195,535),(209,371,327,536),(337,371,469,534),(470,373,608,534),(609,376,752,539),
           (755,377,881,539),(883,378,1013,540),(1016,378,1143,540),(1146,377,1275,539)],
 '_back':  [(338,554,439,716),(462,554,568,716),(604,554,703,717),(736,555,837,715),(867,555,967,717)],
 'hurt':  [(62,1060,187,1181)],
}
K = 0.2
ROLE = {'keep': 255, 'cloak': 254, 'hair': 253, 'skin': 252, 'tunic': 251}

def classify(r, g, b, x, y, w, h, name):
    hh, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    hue = hh * 360
    if l < 0.13: return 'keep'                       # outlines / deep shadow
    if s < 0.16: return 'keep'                       # greys, steel, white slash trails
    if 75 < hue < 170 and g > r: return 'cloak'
    if 8 < hue < 42 and l >= 0.5 and s > 0.3: return 'skin'   # face and hands, lit and shaded
    if 8 < hue < 45 and l < 0.5:
        if name == 'down': return 'hair' if x > w * 0.55 else 'tunic'
        return 'hair' if y < h - 18 else 'tunic'  # head: more than 18px above the feet
    return 'keep'

def keep_big(c, min_px=3000):
    """Clear any loose bits (sparkles, specks) that aren't part of a large shape."""
    px = c.load(); W, H = c.size; seen = set()
    for y in range(H):
        for x in range(W):
            if px[x, y][3] <= 128 or (x, y) in seen: continue
            st = [(x, y)]; seen.add((x, y)); comp = []
            while st:
                cx, cy = st.pop(); comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and px[nx, ny][3] > 128:
                        seen.add((nx, ny)); st.append((nx, ny))
            if len(comp) < min_px:
                for cx, cy in comp: px[cx, cy] = (0, 0, 0, 0)
    return c

frames = []
for name, boxes in F.items():
    if name.startswith('_'): continue  # old walk cycles, replaced by the run sheet
    for (x0, y0, x1, y1) in boxes:
        c = keep_big(im.crop((x0 - 2, y0 - 2, x1 + 3, y1 + 3)))
        sm = c.resize((max(1, round(c.width * K)), max(1, round(c.height * K))), Image.BOX)
        px = sm.load()
        for y in range(sm.height):
            for x in range(sm.width):
                r, g, b, a = px[x, y]
                if a <= 140: px[x, y] = (0, 0, 0, 0); continue
                role = classify(r, g, b, x, y, sm.width, sm.height, name)
                px[x, y] = (r, g, b, ROLE[role])
        frames.append((name, sm))

def components(im, min_px):
    """Connected shapes in im as (pixels, centre x, centre y), ignoring specks."""
    px = im.load(); W, H = im.size; seen = bytearray(W * H); out = []
    for y in range(H):
        for x in range(W):
            if not px[x, y][3] or seen[y * W + x]: continue
            st = [(x, y)]; seen[y * W + x] = 1; comp = []
            while st:
                cx, cy = st.pop(); comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and px[nx, ny][3]:
                        seen[ny * W + nx] = 1; st.append((nx, ny))
            if len(comp) >= min_px:
                out.append((comp, sum(p[0] for p in comp) / len(comp), sum(p[1] for p in comp) / len(comp)))
    return out

# tools/hero-run.png (on black): only its bottom row is used now (knocked dizzy, lying
# knocked out, victory pose).
run = Image.open('tools/hero-run.png').convert('RGBA')
rp = run.load(); RW, RH = run.size
seen_r = bytearray(RW * RH)
st = [(x, y) for x in range(RW) for y in (0, RH - 1)] + [(x, y) for y in range(RH) for x in (0, RW - 1)]
st = [q for q in st if max(rp[q][:3]) <= 8]
for x, y in st: seen_r[y * RW + x] = 1
while st:
    x, y = st.pop(); rp[x, y] = (0, 0, 0, 0)
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < RW and 0 <= ny < RH and not seen_r[ny * RW + nx] and max(rp[nx, ny][:3]) <= 8:
            seen_r[ny * RW + nx] = 1; st.append((nx, ny))
run_frames = {}

# tools/hero-anim.png: the labelled animation sheet (checkerboard background, dark label
# boxes). Each entry: the box it's in, how many frames, and how many of them to use.
ANIM = {  # each labelled row: its box on the sheet, how many frames, how many to use
    'idleF': ((0, 45, 740, 160), 8, 8), 'idleR': ((745, 45, 1536, 160), 9, 9),
    'idleB': ((0, 200, 740, 312), 8, 8), 'idleL': ((745, 200, 1536, 312), 9, 9),
    'front': ((0, 350, 740, 462), 8, 8), 'side': ((735, 350, 1536, 462), 8, 8),
    'back': ((0, 495, 740, 612), 8, 8), 'sideL': ((745, 495, 1536, 612), 8, 8),
    # basic attacks: the last frames turn back to face the viewer, so they're left out
    'atk': ((0, 645, 745, 755), 6, 5), 'atkL': ((745, 645, 1536, 755), 6, 5),
    'atkB': ((0, 785, 745, 892), 6, 6),     # upward slash, for attacking while facing away
    'atkF': ((765, 785, 1536, 892), 6, 6),  # downward slash, for attacking while facing the viewer
    'dash': ((0, 925, 745, 1022), 5, 5), 'dashL': ((765, 925, 1536, 1022), 5, 5),
}
def cut_sheet(path, anims):
    """Cut a labelled animation sheet (checkerboard background, dark label boxes) into
    run_frames[name] for each animation."""
    anim = Image.open(path).convert('RGBA')
    ap = anim.load(); AW, AH = anim.size
    def flood(starts, pred):
        seen = set(starts); st = list(starts); out = []
        while st:
            x, y = st.pop(); out.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < AW and 0 <= ny < AH and (nx, ny) not in seen and pred(ap[nx, ny]):
                    seen.add((nx, ny)); st.append((nx, ny))
        return out
    # label boxes: wide, short, dark navy rectangles
    navy = lambda q: max(q[:3]) <= 70 and q[2] - q[0] >= 6
    done = set()
    for y in range(AH):
        for x in range(AW):
            if (x, y) in done or not navy(ap[x, y]): continue
            c = flood([(x, y)], navy); done.update(c)
            xs = [q[0] for q in c]; ys = [q[1] for q in c]
            if len(c) > 1500 and max(xs) - min(xs) > 100 and max(ys) - min(ys) < 40:
                for yy in range(min(ys) - 3, max(ys) + 4):
                    for xx in range(min(xs) - 3, max(xs) + 4): ap[xx, yy] = (0, 0, 0, 0)
    checker = lambda q: not q[3] or (max(q[:3]) - min(q[:3]) <= 16 and sum(q[:3]) / 3 >= 160)
    edge = [(x, y) for x in range(AW) for y in (0, AH - 1)] + [(x, y) for y in range(AH) for x in (0, AW - 1)]
    for x, y in flood([q for q in edge if checker(ap[q])], checker): ap[x, y] = (0, 0, 0, 0)
    # Drop the drawn slash arcs, speed lines and dust: the game draws its own slash, and
    # they overlap neighbouring frames. Their blue edges go here (blades are only faintly
    # blue); what's left of them no longer touches a hero and is skipped below.
    # (but not sword blades: they're blue-white too, and always inside a dark outline)
    dk = lambda q: q[3] and sum(q[:3]) < 150
    near_dark = lambda x, y, R: any(dk(ap[x + dx, y + dy]) for dy in range(-R, R + 1) for dx in range(-R, R + 1)
                                    if 0 <= x + dx < AW and 0 <= y + dy < AH)
    blue = [(x, y) for y in range(AH) for x in range(AW)
            if ap[x, y][3] and ap[x, y][2] - ap[x, y][0] > 38 and sum(ap[x, y][:3]) / 3 > 90]
    for x, y in blue:
        if not near_dark(x, y, 2): ap[x, y] = (0, 0, 0, 0)
    # Their white cores: thick white areas (blade highlights are only thin lines), grown
    # out through the white pixels around them.
    white = lambda q: q[3] and min(q[:3]) >= 200 and max(q[:3]) - min(q[:3]) <= 30
    seeds = [(x, y) for y in range(2, AH - 2) for x in range(2, AW - 2) if white(ap[x, y]) and
             sum(1 for dy in range(-2, 3) for dx in range(-2, 3) if white(ap[x + dx, y + dy])) >= 18]
    for x, y in flood(seeds, white): ap[x, y] = (0, 0, 0, 0)
    # ...and the faint lines left at their edges: light pixels with no dark outline nearby
    # (a blade is always within a few pixels of its outline).
    light = lambda q: q[3] and sum(q[:3]) / 3 >= 140 and max(q[:3]) - min(q[:3]) <= 45
    darkp = lambda q: q[3] and sum(q[:3]) < 150
    kill = [(x, y) for y in range(4, AH - 4) for x in range(4, AW - 4) if light(ap[x, y]) and
            not any(darkp(ap[x + dx, y + dy]) for dy in range(-4, 5) for dx in range(-4, 5))]
    for q in kill: ap[q] = (0, 0, 0, 0)

    def body(q):
        """Hero pixels (hair, skin, cloak, clothes, outlines), as opposed to slash arcs and dust."""
        r, g, b, a = q
        if not a: return False
        hh, l, s2 = colorsys.rgb_to_hls(r / 255, g / 255, b / 255); hh *= 360
        return l < 0.22 or (s2 > 0.2 and (hh < 60 or 80 < hh < 170))

    for name, ((x0, y0, x1, y1), count, use) in anims.items():
        inside = lambda q: True
        # connected shapes in the box
        shapes = []; seen = set()
        for y in range(y0, y1):
            for x in range(x0, x1):
                if (x, y) in seen or not ap[x, y][3]: continue
                st = [(x, y)]; seen.add((x, y)); c = []
                while st:
                    cx, cy = st.pop(); c.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if x0 <= nx < x1 and y0 <= ny < y1 and (nx, ny) not in seen and ap[nx, ny][3]:
                            seen.add((nx, ny)); st.append((nx, ny))
                shapes.append(c)
        # where the heroes are across the row: runs of columns with hero pixels
        # (heads only: the top part of the row, since capes and swords overlap the next frame)
        cols = [0] * AW
        top = y0 + (y1 - y0) * (0.55 if name in ('atkF', 'atkB') else 0.42)  # the slashes crouch low
        for c in shapes:
            for x, y in c:
                if y < top and body(ap[x, y]): cols[x] += 1
        runs = []; start = None
        for x in range(x0, x1 + 1):
            on = x < x1 and cols[x] > 2
            if on and start is None: start = x
            if not on and start is not None:
                if runs and start - runs[-1][1] < 2: runs[-1] = (runs[-1][0], x)
                else: runs.append((start, x))
                start = None
        runs = [r for r in runs if sum(cols[r[0]:r[1]]) > 300]
        assert len(runs) == count, f'{name}: expected {count} frames, found {len(runs)}: {runs}'
        nearest = lambda x: min(range(len(runs)), key=lambda i: 0 if runs[i][0] <= x < runs[i][1] else min(abs(x - runs[i][0]), abs(x - runs[i][1])))
        cells = [[] for _ in runs]
        for c in shapes:
            share = {}
            for x, y in c:
                if body(ap[x, y]): share[nearest(x)] = share.get(nearest(x), 0) + 1
            if not share or len(share) and sum(share.values()) < 150: continue  # loose effects (arc pieces, speed lines, dust)
            total = sum(share.values())
            big = [i for i, n in share.items() if n > total * 0.25 and n > 400]
            if len(big) <= 1: cells[max(share, key=share.get)] += c   # one hero (with its sword and slash)
            else:
                for x, y in c: cells[min(big, key=lambda i: abs(x - (runs[i][0] + runs[i][1]) / 2))].append((x, y))  # frames joined by effects
        run_frames[name] = []
        for c in cells[:use]:
            cell = Image.new('RGBA', anim.size); cp = cell.load()
            for x, y in c: cp[x, y] = ap[x, y]
            run_frames[name].append(cell.crop(cell.getbbox()))

cut_sheet('tools/hero-anim.png', ANIM)
# The sheet's Run (Side - Right) row barely moves its legs (it slides), so running right
# uses the Run (Side - Left) frames mirrored, which have a proper stride.
run_frames['side'] = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in run_frames['sideL']]
run_scale = {}  # per-animation scale overrides (none at the moment)
k_run = 34 / (sum(f.height for f in run_frames['front']) / len(run_frames['front']))

# Bottom row: a 3-frame swing to the right (mirrored for the left), knocked dizzy,
# lying knocked out, and the victory pose.
# its heroes are drawn bigger than the animation sheet's: size them by its front-run row
k_old = 34 / (lambda b: b[3] - b[1])(run.crop((0, 15, RW, 262)).getbbox())
band = run.crop((0, 745, RW, RH)); bp = band.load()
heroes = []
for comp, mx, my in sorted(components(band, 120), key=lambda c: c[1]):
    xs = [x for x, _ in comp]
    if heroes and min(xs) < heroes[-1]['x1'] + 8: heroes[-1]['px'] += comp; heroes[-1]['x1'] = max(heroes[-1]['x1'], max(xs))
    else: heroes.append({'px': list(comp), 'x1': max(xs)})
cells = []
for hero in heroes:
    cell = Image.new('RGBA', band.size); cp = cell.load()
    for x, y in hero['px']: cp[x, y] = bp[x, y]
    cells.append(cell.crop(cell.getbbox()))
assert len(cells) == 6, f'expected 6 poses on the bottom row, found {len(cells)}'
run_frames['dizzy'] = [cells[3]]
run_frames['down'] = [cells[4]]
run_frames['win'] = [cells[5]]
for name in ('idleF', 'idleR', 'idleL', 'idleB', 'front', 'side', 'sideL', 'back', 'atk', 'atkL', 'atkF', 'atkB', 'dash', 'dashL', 'dizzy', 'down', 'win'):
    for cell in run_frames[name]:
        k = k_old if name in ('dizzy', 'down', 'win') else run_scale.get(name, k_run)
        sm = cell.resize((max(1, round(cell.width * k)), max(1, round(cell.height * k))), Image.BOX)
        px = sm.load()
        for y in range(sm.height):
            for x in range(sm.width):
                rr, gg, bb, a = px[x, y]
                if a <= 140: px[x, y] = (0, 0, 0, 0); continue
                px[x, y] = (rr, gg, bb, ROLE[classify(rr, gg, bb, x, y, sm.width, sm.height, name)])
        frames.append((name, sm))

# pack into one strip, bottoms aligned; record each frame's foot anchor
def anchor(f, name):
    if name == 'down': return f.width // 2
    px = f.load(); xs = []
    rows = range(f.height - 3, f.height) if name.startswith('atk') or name.startswith('dash') or name in ('win', 'dizzy') else range(int(f.height * 0.25))
    for y in rows:
        for x in range(f.width):
            if px[x, y][3]: xs.append(x)
    xs.sort()
    return xs[len(xs) // 2] if xs else f.width // 2

Wt = sum(f.width + 1 for _, f in frames); Ht = max(f.height for _, f in frames)
atlas = Image.new('RGBA', (Wt, Ht), (0, 0, 0, 0)); meta = {}; x = 0
for name, f in frames:
    atlas.paste(f, (x, Ht - f.height))
    meta.setdefault(name, []).append([x, Ht - f.height, f.width, f.height, anchor(f, name)])
    x += f.width + 1
atlas.save('assets/hero.png')
open('js/hero-frames.js', 'w').write(
    '// Generated from the hero sprite sheets by tools/build-hero.py: [x, y, w, h, anchorX] per frame.\n'
    '// Alpha encodes recolour roles: 255 keep, 254 cloak, 253 hair, 252 skin, 251 tunic.\n'
    'export const HERO_FRAMES = ' + json.dumps(meta) + ';\n')
print('wrote assets/hero.png and js/hero-frames.js', {k: len(v) for k, v in meta.items()})
