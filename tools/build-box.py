# Builds assets/box-prizes.png from tools/mystery-box.png: six open Mystery Box frames
# (sword, axe, hammer, scythe, blaster, Giant Sword) shown while the box spins.
# The source has a grey checkerboard drawn in as "transparency".
# Run from the repo root: python3 tools/build-box.py
from PIL import Image

SRC = 'tools/mystery-box.png'
COLS, ROWS = 3, 2
K = 0.25  # downscale (frames are drawn at half size on the detail canvas)

im = Image.open(SRC).convert('RGBA')
W, H = im.size
px = im.load()

def tone(p):
    r, g, b, a = p
    if max(r, g, b) - min(r, g, b) > 12: return 0
    v = (r + g + b) / 3
    return 1 if 132 <= v <= 168 else 2 if 178 <= v <= 216 else 0

seen = bytearray(W * H)
def fill(starts):
    comp = []
    st = [s for s in starts if tone(px[s]) and not seen[s[1] * W + s[0]]]
    for x, y in st: seen[y * W + x] = 1
    while st:
        x, y = st.pop(); comp.append((x, y))
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and tone(px[nx, ny]):
                seen[ny * W + nx] = 1; st.append((nx, ny))
    return comp

border = [(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)]
for x, y in fill(border): px[x, y] = (0, 0, 0, 0)
# Enclosed pockets of checkerboard (inside glow rings): only if they have both tones,
# so grey blades aren't mistaken for background.
for y in range(H):
    for x in range(W):
        if not seen[y * W + x] and tone(px[x, y]):
            comp = fill([(x, y)])
            if len(comp) < 120: continue
            dark = sum(1 for cx, cy in comp if tone(px[cx, cy]) == 1)
            if 0.15 < dark / len(comp) < 0.85:
                for cx, cy in comp: px[cx, cy] = (0, 0, 0, 0)

cw, ch = W // COLS, H // ROWS
# Split into frames by grid cell. The Giant Sword (bottom right) is so tall its tip
# pokes up into the cell above, so that corner belongs to it.
centres = [((c + 0.5) * cw, r * ch + 0.83 * ch) for r in range(ROWS) for c in range(COLS)]
def frame_of(x, y):
    c, r = min(COLS - 1, int(x // cw)), min(ROWS - 1, int(y // ch))
    if c == 2 and r == 0 and x > 1415 and y > 440: r = 1
    if r == 0 and y > 503: r = 1  # the bottom frames' glow reaches up past the top chests
    return r * COLS + c
owner = [Image.new('RGBA', (W, H)) for _ in centres]
op = [o.load() for o in owner]
for y in range(H):
    for x in range(W):
        if px[x, y][3]: op[frame_of(x, y)][x, y] = px[x, y]

def haze(p):
    r, g, b, a = p
    return a and max(r, g, b) - min(r, g, b) < 56 and 100 <= (r + g + b) / 3 <= 225

frames = []
for i, o in enumerate(owner):
    bb = o.getbbox()
    cx = centres[i][0]
    # keep the chest centred: crop symmetrically around the cell centre
    half = max(cx - bb[0], bb[2] - cx)
    o = o.crop((round(cx - half), bb[1], round(cx + half), bb[3]))
    sm = o.resize((round(o.width * K), round(o.height * K)), Image.BOX)
    p = sm.load()
    for y in range(sm.height):
        for x in range(sm.width):
            rr, gg, bb2, a = p[x, y]
            p[x, y] = (rr, gg, bb2, 255) if a >= 140 else (0, 0, 0, 0)
    # eat the grey haze (glow blended with the checkerboard) in from the outside
    for _ in range(5):  # the fringe is thin; more would eat into grey blades
        kill = []
        for y in range(sm.height):
            for x in range(sm.width):
                if not haze(p[x, y]): continue
                if any(not (0 <= nx < sm.width and 0 <= ny < sm.height) or not p[nx, ny][3]
                       for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
                    kill.append((x, y))
        if not kill: break
        for x, y in kill: p[x, y] = (0, 0, 0, 0)
    # drop specks (bits of the neighbouring frames' glow)
    seen2 = set()
    for y0 in range(sm.height):
        for x0 in range(sm.width):
            if (x0, y0) in seen2 or not p[x0, y0][3]: continue
            st = [(x0, y0)]; seen2.add((x0, y0)); comp = []
            while st:
                x, y = st.pop(); comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1), (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)):
                    if 0 <= nx < sm.width and 0 <= ny < sm.height and (nx, ny) not in seen2 and p[nx, ny][3]:
                        seen2.add((nx, ny)); st.append((nx, ny))
            if len(comp) < 14:
                for x, y in comp: p[x, y] = (0, 0, 0, 0)
    sm = sm.crop((0, 0, sm.width, sm.getbbox()[3]))
    # Grey dots left in the glow (checkerboard seen through it): small specks of grey
    # get the frame's glow colour. Big grey areas (blades, metal) are left alone.
    p = sm.load()
    sat = [(x, y) for y in range(sm.height) for x in range(sm.width)
           if p[x, y][3] and max(p[x, y][:3]) - min(p[x, y][:3]) > 110 and max(p[x, y][:3]) > 170]
    glow = [sum(p[x, y][k] for x, y in sat) / max(1, len(sat)) for k in range(3)]
    # Faintly coloured pixels are glow blended over the checkerboard: give them the
    # glow's colour and smooth out the checker's light/dark pattern. (Blades and metal
    # are almost pure grey, so they're left alone.)
    def washed(q):
        r, g, b, a = q
        sp = max(r, g, b) - min(r, g, b)
        return a and 18 <= sp <= 95 and (r + g + b) / 3 >= 135
    hits = [(x, y) for y in range(sm.height) for x in range(sm.width) if washed(p[x, y])]
    lum = {(x, y): sum(p[x, y][:3]) / 3 for x, y in hits}
    for x, y in hits:
        near = [lum[q] for q in ((x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)) if q in lum]
        k = sum(near) / len(near) / 185
        p[x, y] = tuple(min(255, round(glow[c] * k * 0.6 + 255 * 0.4 * k)) for c in range(3)) + (255,)
    frames.append(sm)

# All frames share one size, lined up on the chest's bottom centre.
fw = max(f.width for f in frames) + (max(f.width for f in frames) % 2)
fh = max(f.height for f in frames)
# A closed box to stand at camp: the front of a chest from the art plus a drawn lid.
BODY_Y = fh - 29  # where the chest's front panel starts
from PIL import ImageDraw
closed = Image.new('RGBA', (fw, fh))
src = Image.new('RGBA', (fw, fh)); src.paste(frames[1], ((fw - frames[1].width) // 2, fh - frames[1].height))
closed.paste(src.crop((0, BODY_Y, fw, fh)), (0, BODY_Y))
bb = closed.getbbox()
x0, x1 = bb[0] + 1, bb[2] - 2
d = ImageDraw.Draw(closed)
OUT, DARK, DARK2, GOLD, GOLD2, GEM = (20, 16, 24, 255), (52, 44, 56, 255), (36, 30, 40, 255), (240, 164, 40, 255), (184, 104, 24, 255), (60, 150, 240, 255)
top = BODY_Y - 15
d.rectangle((x0 - 1, top - 1, x1 + 1, BODY_Y), fill=OUT)
d.rectangle((x0, top, x1, BODY_Y - 1), fill=DARK)
d.rectangle((x0, BODY_Y - 4, x1, BODY_Y - 1), fill=DARK2)
d.rectangle((x0, top, x1, top + 2), fill=GOLD)             # gold rim
d.rectangle((x0, top, x0 + 5, BODY_Y - 1), fill=GOLD)      # corner bands
d.rectangle((x1 - 5, top, x1, BODY_Y - 1), fill=GOLD)
d.rectangle((x0 + 5, top + 3, x0 + 5, BODY_Y - 1), fill=GOLD2)
d.rectangle((x1 - 5, top + 3, x1 - 5, BODY_Y - 1), fill=GOLD2)
mid = (x0 + x1) // 2
d.rectangle((mid - 5, top, mid + 5, BODY_Y - 1), fill=GOLD)  # clasp
d.rectangle((mid - 2, top + 5, mid + 2, top + 9), fill=GEM)
for gx in (x0 + 2, x1 - 3): d.rectangle((gx, top + 6, gx + 1, top + 7), fill=GEM)
frames.append(closed)

sheet = Image.new('RGBA', (fw * len(frames), fh))
for i, f in enumerate(frames):
    sheet.paste(f, (i * fw + (fw - f.width) // 2, fh - f.height))
sheet.save('assets/box-prizes.png')
print('assets/box-prizes.png', sheet.size, 'frame', fw, fh)
