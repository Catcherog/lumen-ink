"""
紫韵浮岚 V4 - 精炼版
核心改进：山峰更柔美圆润 / 雾岚更突出 / 远舟与樱枝更精致
目标：宋画米氏云山的朦胧诗意
"""

import os
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 2560, 1440
SEED = 20260606
random.seed(SEED)
np.random.seed(SEED)

OUT_DIR = r"d:\360Downloads\Trae 项目\picture-GPT\public"
OUT_PATH = os.path.join(OUT_DIR, "background-紫韵浮岚-20260606.png")

# ============== 调色板（柔美）==============
SKY_TOP     = (240, 230, 245)
SKY_MID     = (215, 198, 228)
SKY_BOT     = (185, 162, 205)
MOUNTAIN_FAR= (180, 152, 198)   # 远山柔和
MOUNTAIN_MID= (145, 115, 175)   # 中山
MOUNTAIN_NEAR=(100, 75, 138)    # 近山
MOUNTAIN_FG = (62, 45, 90)      # 前景
WATER_TOP   = (190, 165, 210)
WATER_BOT   = (140, 110, 175)
MOON_CORE   = (245, 235, 250)
MOON_GLOW   = (225, 205, 240)
INK_DEEP    = (40, 25, 60)
HAZE_COLOR  = (235, 225, 240)   # 雾岚色（冷紫白）

# ============== 工具函数 ==============
def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def smoothstep(t):
    return t * t * (3 - 2 * t)

def vertical_gradient_arr(width, height, top, mid, bot, mid_pos=0.6):
    arr = np.zeros((height, width, 3), dtype=np.float32)
    for y in range(height):
        t = y / (height - 1)
        if t < mid_pos:
            k = smoothstep(t / mid_pos)
            c = lerp(top, mid, k)
        else:
            k = smoothstep((t - mid_pos) / (1 - mid_pos))
            c = lerp(mid, bot, k)
        arr[y, :] = c
    return arr

def smooth_mountain_heights(width, height_amp, seed_offset, smoothness=0.4):
    """生成柔美圆润的山体剖面（无尖峰）"""
    rng = np.random.default_rng(SEED + seed_offset)
    # 1. 多个低频正弦组合（产生圆润起伏）
    x = np.linspace(0, 1, width)
    base = (np.sin(x * 1.8 + seed_offset * 0.5) * 0.45
            + np.sin(x * 3.1 + seed_offset * 1.1) * 0.30
            + np.sin(x * 5.7 + seed_offset * 1.9) * 0.15)
    base = (base - base.min()) / (base.max() - base.min() + 1e-9)

    # 2. 平滑的细节扰动（不引入尖角）
    detail_noise = np.zeros(width, dtype=np.float32)
    for o in range(4):
        freq = (3 + o * 1.5) * (1 + seed_offset * 0.1)
        amp = (0.45 ** o) * 0.4
        phase = rng.uniform(0, 2 * np.pi)
        detail_noise += np.sin(np.linspace(0, freq * 2 * np.pi, width) + phase) * amp
    detail_noise = (detail_noise - detail_noise.mean())
    # 限制幅度，不产生尖峰
    detail_noise = np.tanh(detail_noise * 1.5) * 0.3

    # 3. 组合 + 平滑（关键）
    profile = base * 0.75 + detail_noise * 0.25
    profile = np.clip(profile, 0, 1)

    # 4. 多次平滑（消除任何尖角）
    for _ in range(int(smoothness * 5)):
        kernel = np.array([0.25, 0.5, 0.25])
        profile = np.convolve(profile, kernel, mode='same')

    return (profile * height_amp).astype(np.int32)

def draw_mountain_layer(canvas, baseline_y, height_amp, color,
                        seed_offset, blur_radius=3.0, opacity=1.0,
                        smoothness=0.4):
    """绘制柔美水墨山体"""
    width, height = canvas.size
    heights = smooth_mountain_heights(width, height_amp, seed_offset, smoothness)
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    polygon = []
    for x in range(width):
        top_y = baseline_y - heights[x]
        if top_y < 0: top_y = 0
        polygon.append((x, int(top_y)))
    polygon.append((width - 1, baseline_y))
    polygon.append((0, baseline_y))
    r, g, b = color
    a = int(255 * opacity)
    ImageDraw.Draw(layer).polygon(polygon, fill=(r, g, b, a))
    if blur_radius > 0:
        layer = layer.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    canvas.alpha_composite(layer)

def add_ink_wash_transition(canvas, baseline_y, height_amp, color, seed_offset,
                            smoothness=0.4, fade_alpha=180):
    """在山体顶部添加水墨晕染（颜色从深到浅，营造云山效果）"""
    width, height = canvas.size
    heights = smooth_mountain_heights(width, height_amp, seed_offset, smoothness)
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    r, g, b = color
    # 在山顶部往下 60-100 像素内逐渐淡入
    for x in range(0, width, 3):
        top_y = baseline_y - heights[x]
        if top_y < 0: top_y = 0
        # 渐变 alpha：顶部深，往下浅
        for offset, a in enumerate([fade_alpha, int(fade_alpha*0.6), int(fade_alpha*0.3), 0]):
            yy = int(top_y) + offset * 20
            ImageDraw.Draw(layer).line(
                [(x, yy), (x, yy + 20)], fill=(r, g, b, a)
            )
    layer = layer.filter(ImageFilter.GaussianBlur(radius=4))
    canvas.alpha_composite(layer)

def draw_ink_marks(canvas, count, color, size_range=(1, 3),
                   opacity_range=(0.2, 0.5), y_range=(0.45, 0.85)):
    width, height = canvas.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    r, g, b = color
    for _ in range(count):
        x = random.randint(0, width - 1)
        y = random.randint(int(height * y_range[0]), int(height * y_range[1]))
        s = random.randint(*size_range)
        op = random.uniform(*opacity_range)
        a = int(255 * op)
        draw.ellipse([x - s, y - s, x + s, y + s], fill=(r, g, b, a))
    canvas.alpha_composite(layer)

def draw_moon(canvas, cx, cy, radius, core_color, glow_color, glow_r=160):
    width, height = canvas.size
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for i in range(glow_r, 0, -3):
        t = i / glow_r
        a = int(45 * (1 - t) ** 1.5)
        r, g, b = glow_color
        gdraw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(r, g, b, a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=8))
    canvas.alpha_composite(glow)
    moon = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    mdraw = ImageDraw.Draw(moon)
    r, g, b = core_color
    mdraw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
                  fill=(r, g, b, 240))
    moon = moon.filter(ImageFilter.GaussianBlur(radius=1.0))
    canvas.alpha_composite(moon)

def draw_water(canvas, top_y, bot_y, top_color, bot_color):
    width, height = canvas.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    grad_arr = vertical_gradient_arr(width, bot_y - top_y,
                                     top_color, bot_color,
                                     lerp(bot_color, top_color, 0.1), 0.3)
    grad_img = Image.fromarray(grad_arr.astype(np.uint8), "RGB").convert("RGBA")
    ripple = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(ripple)
    for y_offset in range(0, bot_y - top_y, 3):
        y = top_y + y_offset
        depth_t = y_offset / (bot_y - top_y - 1) if bot_y - top_y > 1 else 0
        alpha = int(25 * (1 - depth_t * 0.7))
        x_start = random.randint(0, width // 2)
        length = random.randint(50, 350)
        if random.random() < 0.5:
            col = (255, 250, 255, alpha)
        else:
            col = (90, 70, 110, alpha)
        rdraw.line([(x_start, y), (x_start + length, y)], fill=col, width=1)
    ripple = ripple.filter(ImageFilter.GaussianBlur(radius=0.6))
    layer.paste(grad_img, (0, top_y), grad_img)
    layer.alpha_composite(ripple)
    canvas.alpha_composite(layer)

def draw_water_reflection(canvas, refl_specs, water_top, water_bot, smoothness=0.4):
    width, height = canvas.size
    refl = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(refl)
    water_h = water_bot - water_top
    for (base_y, h_amp, color, seed_off, op) in refl_specs:
        heights = smooth_mountain_heights(width, h_amp, seed_off + 1000, smoothness)
        r, g, b = color
        a = int(255 * op * 0.32)
        for x in range(0, width, 2):
            top_y = base_y - heights[x]
            refl_top = water_top + (base_y - top_y) * 0.40
            refl_top = int(np.clip(refl_top, water_top, water_bot - 1))
            refl_bot = water_top + int(water_h * 0.22)
            rdraw.line([(x, refl_top), (x, refl_bot)], fill=(r, g, b, a))
    refl = refl.filter(ImageFilter.GaussianBlur(radius=3.0))
    canvas.alpha_composite(refl)

def draw_distant_boat(canvas, cx, cy, color=(35, 22, 55), opacity=0.95):
    width, height = canvas.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r, g, b = color
    a = int(255 * opacity)
    fill = (r, g, b, a)
    boat_w = 65
    # 船身（更圆润）
    d.arc([cx - boat_w, cy - 6, cx + boat_w, cy + 18], start=200, end=340,
          fill=fill, width=4)
    d.line([(cx - boat_w + 4, cy + 16), (cx + boat_w - 4, cy + 16)], fill=fill, width=2)
    # 船夫 + 斗笠
    d.line([(cx, cy), (cx, cy - 30)], fill=fill, width=2)
    d.ellipse([cx - 8, cy - 38, cx + 8, cy - 30], fill=fill)  # 斗笠
    # 撑篙
    d.line([(cx + 5, cy - 8), (cx + 32, cy - 35)], fill=fill, width=2)
    layer = layer.filter(ImageFilter.GaussianBlur(radius=0.6))
    canvas.alpha_composite(layer)

def draw_cherry_branch(canvas, start_x, start_y, length=450, color=(95, 70, 130)):
    """绘制樱花枝条（呼应参考图2）"""
    width, height = canvas.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r, g, b = color

    # 主枝
    points = [(start_x, start_y)]
    angle = -math.pi / 4.5  # 稍平一点
    x, y = start_x, start_y
    for i in range(length):
        angle += random.uniform(-0.04, 0.04)
        x += math.cos(angle) * 1.6
        y += math.sin(angle) * 1.6
        points.append((int(x), int(y)))

    # 主枝（粗细渐变）
    for i in range(len(points) - 1):
        w = max(1, int(3.5 * (1 - i / length) ** 0.5))
        a = int(220 * (1 - i / length) * 0.9)
        d.line([points[i], points[i + 1]], fill=(r, g, b, a), width=w)

    # 细枝 + 花朵
    for branch_start_idx in range(0, len(points), 8):
        bx, by = points[branch_start_idx]
        for j in range(random.randint(1, 3)):
            drop = random.randint(40, 130)
            tx = bx + random.randint(-3, 3)
            ty = by + drop
            a_branch = int(180 * (1 - branch_start_idx / len(points)) * 0.7)
            d.line([(bx, by), (tx, ty)], fill=(r, g, b, a_branch), width=1)
            # 末端小花朵（圆形 5 瓣的简化为一个柔光点）
            for _ in range(random.randint(2, 4)):
                fx = tx + random.randint(-6, 6)
                fy = ty + random.randint(-6, 6)
                a_flower = random.randint(80, 150)
                r_flower = (200 + random.randint(-10, 10),
                            180 + random.randint(-10, 10),
                            220 + random.randint(-10, 10))
                d.ellipse([fx-2, fy-2, fx+2, fy+2], fill=(*r_flower, a_flower))

    layer = layer.filter(ImageFilter.GaussianBlur(radius=0.4))
    canvas.alpha_composite(layer)

def add_paper_texture(canvas, intensity=0.05):
    width, height = canvas.size
    noise = np.random.randint(0, 256, (height, width), dtype=np.uint8)
    blur = Image.fromarray(noise, "L").filter(ImageFilter.GaussianBlur(radius=0.6))
    arr = np.array(blur).astype(np.float32)
    alpha = np.clip(np.abs(arr - 128) * intensity * 0.6, 0, 30).astype(np.uint8)
    paper_rgba = np.zeros((height, width, 4), dtype=np.uint8)
    paper_rgba[..., 0] = 240
    paper_rgba[..., 1] = 235
    paper_rgba[..., 2] = 240
    paper_rgba[..., 3] = alpha
    paper_img = Image.fromarray(paper_rgba, "RGBA")
    canvas.alpha_composite(paper_img)
    # 纤维
    fiber_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fiber_layer)
    for _ in range(int(width * height / 15000)):
        x1 = random.randint(0, width - 1)
        y1 = random.randint(0, height - 1)
        ang = random.uniform(0, math.pi * 2)
        ln = random.randint(4, 16)
        x2 = int(x1 + math.cos(ang) * ln)
        y2 = int(y1 + math.sin(ang) * ln)
        a = random.randint(8, 20)
        fd.line([(x1, y1), (x2, y2)], fill=(80, 70, 90, a), width=1)
    fiber_layer = fiber_layer.filter(ImageFilter.GaussianBlur(radius=0.5))
    canvas.alpha_composite(fiber_layer)

def add_atmospheric_haze(canvas, top_y, bot_y, intensity=0.10, color=None):
    """米氏云山的关键 - 雾岚贯穿画面中段"""
    if color is None:
        color = HAZE_COLOR
    width, height = canvas.size
    haze = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for y in range(top_y, bot_y):
        t = (y - top_y) / (bot_y - top_y - 1) if bot_y > top_y else 0
        # 多峰曲线，模拟云山
        bell = (math.exp(-((t - 0.3) * 2.0) ** 2) * 0.7
                + math.exp(-((t - 0.7) * 2.5) ** 2) * 0.5)
        a = int(intensity * 255 * bell)
        if a > 0:
            r, g, b = color
            line_img = Image.new("RGBA", (width, 1), (r, g, b, a))
            haze.paste(line_img, (0, y))
    haze = haze.filter(ImageFilter.GaussianBlur(radius=15))
    canvas.alpha_composite(haze)

# ============== 主流程 ==============
def main():
    print(f"[V4] 精炼版紫韵浮岚 ({W}x{H})")

    # 1. 天空
    sky_arr = vertical_gradient_arr(W, H, SKY_TOP, SKY_MID, SKY_BOT, mid_pos=0.62)
    canvas = Image.fromarray(sky_arr.astype(np.uint8), "RGB").convert("RGBA")
    print("  [1/9] 天空 ✓")

    # 2. 远山 5 层（柔美）
    print("  [2/9] 远山 5 层（柔美圆润）...")
    layers = [
        # (baseline_y, height_amp, color, seed_off, opacity, blur, smoothness)
        (int(H * 0.52), 70,  MOUNTAIN_FAR,  10, 0.55, 6.0, 0.6),
        (int(H * 0.57), 110, MOUNTAIN_FAR,  20, 0.72, 5.0, 0.55),
        (int(H * 0.63), 170, MOUNTAIN_MID,  30, 0.88, 4.0, 0.5),
        (int(H * 0.71), 260, MOUNTAIN_NEAR, 40, 0.98, 3.0, 0.45),
        (int(H * 0.82), 380, MOUNTAIN_FG,   50, 1.00, 2.0, 0.4),
    ]
    for (by, ha, col, so, op, br, sm) in layers:
        draw_mountain_layer(canvas, by, ha, col, so, blur_radius=br,
                            opacity=op, smoothness=sm)
    print("      远山5层 ✓")

    # 3. 山顶墨色晕染（让山有水墨层次）
    print("  [3/9] 山顶墨色晕染...")
    for (by, ha, col, so, op, br, sm) in layers:
        add_ink_wash_transition(canvas, by, ha,
                                tuple(max(0, c-15) for c in col),
                                so, smoothness=sm, fade_alpha=120)

    # 4. 皴法墨点
    print("  [4/9] 皴法墨点...")
    draw_ink_marks(canvas, 400, INK_DEEP, size_range=(1, 4),
                   opacity_range=(0.18, 0.45), y_range=(0.50, 0.85))
    draw_ink_marks(canvas, 200, MOUNTAIN_FG, size_range=(1, 3),
                   opacity_range=(0.25, 0.50), y_range=(0.65, 0.90))

    # 5. 大气雾岚 - **米氏云山的核心**（贯穿中远）
    print("  [5/9] 雾岚（米氏云山）...")
    add_atmospheric_haze(canvas, int(H * 0.45), int(H * 0.78), intensity=0.12)

    # 6. 月
    print("  [6/9] 月...")
    draw_moon(canvas, int(W * 0.82), int(H * 0.20), radius=50,
              core_color=MOON_CORE, glow_color=MOON_GLOW, glow_r=180)

    # 7. 水面 + 倒影
    print("  [7/9] 水面 + 倒影...")
    water_top = int(H * 0.83)
    water_bot = H
    draw_water(canvas, water_top, water_bot, WATER_TOP, WATER_BOT)
    refl_layers = [
        (int(H * 0.63), 170, MOUNTAIN_MID,  30, 0.88),
        (int(H * 0.71), 260, MOUNTAIN_NEAR, 40, 0.98),
        (int(H * 0.82), 380, MOUNTAIN_FG,   50, 1.00),
    ]
    draw_water_reflection(canvas, refl_layers, water_top, water_bot, smoothness=0.45)

    # 8. 远舟 + 樱枝
    print("  [8/9] 远舟 + 樱枝...")
    draw_distant_boat(canvas, int(W * 0.40), int(H * 0.86),
                      color=(35, 22, 55), opacity=0.95)
    draw_cherry_branch(canvas, start_x=int(W * 0.94), start_y=int(H * 0.14),
                       length=580, color=(85, 62, 120))

    # 9. 纸纹
    print("  [9/9] 宣纸肌理...")
    add_paper_texture(canvas, intensity=0.05)

    # 保存
    os.makedirs(OUT_DIR, exist_ok=True)
    final = canvas.convert("RGB")
    final.save(OUT_PATH, "PNG", optimize=True)
    print(f"\n✅ 已保存: {OUT_PATH}")
    print(f"   {W}x{H}, {os.path.getsize(OUT_PATH)/1024:.1f} KB")

if __name__ == "__main__":
    main()
