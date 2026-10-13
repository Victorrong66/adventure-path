# Builds assets/box-prizes.png from tools/mystery-box.png (the Mystery Box sheet).
# Top row: the box idle, shaking, then opening (7 frames). Bottom row: the open box
# with each prize above it (sword, axe, hammer, scythe, blaster, Giant Sword).
# The source has a checkerboard drawn in as "transparency".
# Run from the repo root: python3 tools/build-box.py
from PIL import Image

SRC = 'tools/mystery-box.png'
ROW_SPLIT = 330  # y between the two rows in the source
K = 0.25         # downscale (frames are drawn at half size on the detail canvas)

im = Image.open(SRC).convert('RGBA')
W, H = im.size
px = im.load()

def bg(p):
    r, g, b, a = p
    return a and max(r, g, b) - min(r, g, b) <= 14 and (r + g + b) / 3 >= 140
def dark(p):
    return p[3] and sum(p[:3]) < 200

seen = bytearray(W * H)
def fill(starts):
    comp = []
    st = [s for s in starts if bg(px[s]) and not seen[s[1] * W + s[0]]]
    for x, y in st: seen[y * W + x] = 1
    while st:
        x, y = st.pop(); comp.append((x, y))
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and bg(px[nx, ny]):
                seen[ny * W + nx] = 1; st.append((nx, ny))
    return comp

border = [(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)]
border += [(x, ROW_SPLIT) for x in range(W)]
for x, y in fill(border): px[x, y] = (0, 0, 0, 0)
# Enclosed pockets of checkerboard (inside glows). Blades are grey too, but they're
# ringed by a dark outline, so pockets that touch a lot of dark pixels are kept.
for y in range(H):
    for x in range(W):
        if seen[y * W + x] or not bg(px[x, y]): continue
        comp = fill([(x, y)])
        if len(comp) < 30: continue
        cs = set(comp); edge = darkn = 0
        for cx, cy in comp:
            for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                if (nx, ny) in cs or not (0 <= nx < W and 0 <= ny < H): continue
                edge += 1
                if dark(px[nx, ny]): darkn += 1
        if edge and darkn / edge < 0.12:
            for cx, cy in comp: px[cx, cy] = (0, 0, 0, 0)

# Frame columns (x ranges) in the source: the top row's frames are well apart; in the
# bottom row the glows touch, so it's split halfway between the chests.
TOP = [(28, 233), (250, 521), (531, 741), (777, 990), (1021, 1236), (1268, 1487), (1528, 1749)]
BOTTOM_CUTS = [0, 265, 538, 823, 1108, 1395, W]
cells = [(x0, 0, x1, ROW_SPLIT) for x0, x1 in TOP]
cells += [(BOTTOM_CUTS[i], ROW_SPLIT, BOTTOM_CUTS[i + 1], H) for i in range(6)]

def haze(q):
    r, g, b, a = q
    return a and max(r, g, b) - min(r, g, b) < 56 and 100 <= (r + g + b) / 3 <= 235

def neighbours(x, y, w, h, diag=False):
    d = ((1, 0), (-1, 0), (0, 1), (0, -1)) + (((1, 1), (-1, -1), (1, -1), (-1, 1)) if diag else ())
    for dx, dy in d:
        if 0 <= x + dx < w and 0 <= y + dy < h: yield x + dx, y + dy

frames = []
for n, (x0, y0, x1, y1) in enumerate(cells):
    cell = im.crop((x0, y0, x1, y1))
    cell = cell.crop(cell.getbbox())
    sm = cell.resize((round(cell.width * K), round(cell.height * K)), Image.BOX)
    p = sm.load(); w, h = sm.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            p[x, y] = (r, g, b, 255) if a >= 140 else (0, 0, 0, 0)
    # eat the pale fringe (glow blended with the checkerboard) in from the outside
    for _ in range(4):
        kill = [(x, y) for y in range(h) for x in range(w) if haze(p[x, y]) and
                (x in (0, w - 1) or y in (0, h - 1) or any(not p[q][3] for q in neighbours(x, y, w, h)))]
        if not kill: break
        for q in kill: p[q] = (0, 0, 0, 0)
    # drop specks
    seen2 = set()
    for yy in range(h):
        for xx in range(w):
            if (xx, yy) in seen2 or not p[xx, yy][3]: continue
            st = [(xx, yy)]; seen2.add((xx, yy)); comp = []
            while st:
                q = st.pop(); comp.append(q)
                for r2 in neighbours(*q, w, h, True):
                    if r2 not in seen2 and p[r2][3]: seen2.add(r2); st.append(r2)
            if len(comp) < 10:
                for q in comp: p[q] = (0, 0, 0, 0)
    if n >= 7:
        # glow seen over the checkerboard: give faint greys the glow's colour, smoothly
        sat = [p[x, y] for y in range(h) for x in range(w)
               if p[x, y][3] and max(p[x, y][:3]) - min(p[x, y][:3]) > 110 and max(p[x, y][:3]) > 170]
        glow = [sum(q[c] for q in sat) / max(1, len(sat)) for c in range(3)]
        hits = [(x, y) for y in range(h) for x in range(w) if p[x, y][3] and
                18 <= max(p[x, y][:3]) - min(p[x, y][:3]) <= 95 and sum(p[x, y][:3]) / 3 >= 135]
        lum = {q: sum(p[q][:3]) / 3 for q in hits}
        for x, y in hits:
            near = [lum[q] for q in ((x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)) if q in lum]
            k = sum(near) / len(near) / 185
            p[x, y] = tuple(min(255, round(glow[c] * k * 0.6 + 255 * 0.4 * k)) for c in range(3)) + (255,)
        # holes inside the glow (where checkerboard was cut out) are filled with glow
        outside = set((x, y) for x in range(w) for y in (0, h - 1) if not p[x, y][3])
        outside |= set((x, y) for y in range(h) for x in (0, w - 1) if not p[x, y][3])
        st = list(outside)
        while st:
            q = st.pop()
            for r2 in neighbours(*q, w, h):
                if r2 not in outside and not p[r2][3]: outside.add(r2); st.append(r2)
        fillc = tuple(min(255, round(glow[c] * 0.75 + 255 * 0.25)) for c in range(3)) + (255,)
        for y in range(h):
            for x in range(w):
                if not p[x, y][3] and (x, y) not in outside: p[x, y] = fillc
    sm = sm.crop(sm.getbbox())
    # anchor: the middle of the chest's bottom edge
    p = sm.load(); w, h = sm.size
    xs = [x for y in range(h - 6, h) for x in range(w) if p[x, y][3]]
    frames.append((sm, (min(xs) + max(xs)) / 2))

left = max(ax for _, ax in frames)
right = max(f.width - ax for f, ax in frames)
fw = int(max(left, right)) * 2 + 2
fh = max(f.height for f, _ in frames)
sheet = Image.new('RGBA', (fw * len(frames), fh))
for i, (f, ax) in enumerate(frames):
    sheet.paste(f, (i * fw + round(fw / 2 - ax), fh - f.height))
sheet.save('assets/box-prizes.png')
print('assets/box-prizes.png', sheet.size, 'frame', fw, fh)
