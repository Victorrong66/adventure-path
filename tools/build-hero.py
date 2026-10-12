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
# right-to-left), then hurt / knocked out / victory. The slash frames include
# their slash trail.
F = {
 'front': [(355,21,448,167),(475,16,571,174),(608,16,700,174),(731,16,828,167),(862,16,958,169)],
 'side':  [(38,189,167,353),(165,190,299,354),(300,190,432,352),(434,191,566,354),(567,192,709,358),
           (709,191,842,353),(844,192,977,355),(994,192,1113,356),(1123,191,1250,355)],
 'sideL': [(63,369,195,535),(209,371,327,536),(337,371,469,534),(470,373,608,534),(609,376,752,539),
           (755,377,881,539),(883,378,1013,540),(1016,378,1143,540),(1146,377,1275,539)],
 'back':  [(338,554,439,716),(462,554,568,716),(604,554,703,717),(736,555,837,715),(867,555,967,717)],
 'atk':   [(49,723,205,867),(210,725,358,867),(357,724,536,867),(523,727,657,866),(684,733,946,869),
           (955,729,1091,868),(1123,724,1263,867)],
 'atkL':  [(1133,883,1285,1027),(980,883,1127,1026),(804,883,981,1025),(681,884,815,1027),(371,884,641,1028),
           (225,887,361,1028),(51,884,192,1026)],
 'hurt':  [(62,1060,187,1181)],
 'down':  [(493,1097,656,1178)],
 'win':   [(1133,1027,1241,1183)],
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
        head = 0.42 if name.startswith('atk') else 0.45
        return 'hair' if y < h * head else 'tunic'
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

# pack into one strip, bottoms aligned; record each frame's foot anchor
def anchor(f, name):
    if name == 'down': return f.width // 2
    px = f.load(); xs = []
    for y in range(int(f.height * 0.25)):
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
    '// Generated from the hero sprite sheet: [x, y, w, h, footX] per frame.\n'
    '// Alpha encodes recolour roles: 255 keep, 254 cloak, 253 hair, 252 skin, 251 tunic.\n'
    'export const HERO_FRAMES = ' + json.dumps(meta) + ';\n')
print('wrote assets/hero.png and js/hero-frames.js', {k: len(v) for k, v in meta.items()})
