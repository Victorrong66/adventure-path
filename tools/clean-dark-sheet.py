"""Cut a hero sheet drawn on a dark, glowing backdrop (with speed lines and dust) into
clean single-row images for tools/hero-rows/.

    python3 tools/clean-dark-sheet.py <sheet.png> <name>:<y0>:<y1> ...

Each name:y0:y1 is one row of frames (below its label). The heroes have a dark outline, so
everything smooth outside it (backdrop, glow, blurred speed lines) is flooded away from the
row's edges; dust puffs and other loose bits are dropped by keeping only the big shapes.
"""
import sys
from PIL import Image

from PIL import ImageFilter
import os
T = int(os.environ.get('CLEAN_T', '5'))  # how far colours may drift between neighbouring backdrop pixels

def clean(im):
    px = im.load(); W, H = im.size
    # the outline: pixels much darker than their surroundings (the backdrop itself can be
    # dark too, but it's smooth, so it's never much darker than its own blur)
    lum = im.convert('L')
    blur = lum.filter(ImageFilter.BoxBlur(12)).load(); lp = lum.load()
    wall = Image.new('L', im.size)
    wp = wall.load()
    for y in range(H):
        for x in range(W):
            if lp[x, y] < 70 and blur[x, y] - lp[x, y] > 22: wp[x, y] = 255
    wp = wall.filter(ImageFilter.MaxFilter(3)).load()  # close small gaps in the outline
    bg = bytearray(W * H)
    st = [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
    st = [q for q in st if not wp[q]]
    for x, y in st: bg[y * W + x] = 1
    while st:
        x, y = st.pop(); c = px[x, y]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not bg[ny * W + nx] and not wp[nx, ny]:
                n = px[nx, ny]  # (and only across smooth colour: the backdrop is soft, the hero isn't)
                if max(abs(n[0] - c[0]), abs(n[1] - c[1]), abs(n[2] - c[2])) <= T:
                    bg[ny * W + nx] = 1; st.append((nx, ny))
    out = Image.new('RGBA', im.size); op = out.load()
    for y in range(H):
        for x in range(W):
            if not bg[y * W + x]: op[x, y] = px[x, y] + (255,)
    # keep only big shapes (heroes), not dust, speed-line scraps or noise
    seen = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            if not op[x, y][3] or seen[y * W + x]: continue
            st = [(x, y)]; seen[y * W + x] = 1; comp = []
            while st:
                cx, cy = st.pop(); comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and op[nx, ny][3]:
                        seen[ny * W + nx] = 1; st.append((nx, ny))
            if len(comp) < 3000:
                for p in comp: op[p] = (0, 0, 0, 0)
    return out

src = Image.open(sys.argv[1]).convert('RGB')
for arg in sys.argv[2:]:
    name, y0, y1 = arg.split(':')
    row = clean(src.crop((0, int(y0), src.width, int(y1))))
    row.save(f'tools/hero-rows/{name}.png')
    print('wrote', name)
