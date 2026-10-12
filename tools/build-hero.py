"""Builds the hero sprite atlas from tools/hero-sheet.png: cuts out the frames we use,
shrinks them to game size and marks which pixels can be recoloured."""
import sys, json, colorsys
from PIL import Image
# Usage: python3 tools/build-hero.py   (run from the repo root)
im = Image.open('tools/hero-sheet.png').convert('RGBA')
# Frame boxes on the sheet (x0, y0, x1, y1), in the layout from the prompt:
# rows of 4-frame walks (front, right, back), a 3-frame swing, then hurt / down / victory.
F = {
 'front': [(166,81,318,311),(393,81,536,311),(604,81,747,311),(827,81,969,311)],
 'side':  [(165,353,306,573),(386,353,526,573),(598,352,746,573),(827,352,969,573)],
 'back':  [(172,615,311,835),(391,616,532,835),(613,615,753,835),(833,616,973,835)],
 'atk':   [(138,875,353,1068),(422,881,738,1068),(789,875,1036,1068)],
 'hurt':  [(163,1125,341,1317)],
 'down':  [(454,1198,694,1308)],
 'win':   [(806,1082,968,1324)],
}
K = 0.14
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
        head = 0.45 if name != 'atk' else 0.42
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
    px = f.load(); xs = []
    rows = range(f.height - 4, f.height) if name != 'down' else range(f.height)
    for y in rows:
        for x in range(f.width):
            if px[x, y][3]: xs.append(x)
    if name == 'atk':  # the body, not the sword: use the left part of the feet
        xs = [x for x in xs if x < f.width * 0.6] or xs
    fx = round(sum(xs) / len(xs)) if xs else f.width // 2
    return fx

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
