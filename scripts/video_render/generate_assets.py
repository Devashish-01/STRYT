import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ASSETS_DIR = os.path.abspath(r'scripts\video_render\assets')
os.makedirs(ASSETS_DIR, exist_ok=True)

# Layout constants
CANVAS_W = 1920
CANVAS_H = 1080

LEFT_CENTER_X = 460
RIGHT_CENTER_X = 1460
CENTER_X = 960

BEZEL_W = 412
BEZEL_H = 864
BEZEL_R = 36
CENTER_Y = 555

SCREEN_H = 832
SCREEN_LEFT_W = 384
SCREEN_RIGHT_W = 374
SCREEN_R = 24
SCREEN_TOP = CENTER_Y - (SCREEN_H // 2)   # 555 - 416 = 139
SCREEN_BOTTOM = SCREEN_TOP + SCREEN_H    # 971

LEFT_SCREEN_L = LEFT_CENTER_X - (SCREEN_LEFT_W // 2)   # 460 - 192 = 268
LEFT_SCREEN_R = LEFT_SCREEN_L + SCREEN_LEFT_W          # 652

RIGHT_SCREEN_L = RIGHT_CENTER_X - (SCREEN_RIGHT_W // 2) # 1460 - 187 = 1273
RIGHT_SCREEN_R = RIGHT_SCREEN_L + SCREEN_RIGHT_W        # 1647

# Fonts
FONT_REGULAR = r'C:\Windows\Fonts\segoeui.ttf'
FONT_BOLD = r'C:\Windows\Fonts\segoeuib.ttf'
FONT_SEMIBOLD = r'C:\Windows\Fonts\segoeuisl.ttf'

font_title = ImageFont.truetype(FONT_BOLD, 22)
font_badge = ImageFont.truetype(FONT_BOLD, 13)
font_banner = ImageFont.truetype(FONT_BOLD, 21)
font_clock = ImageFont.truetype(FONT_BOLD, 17)
font_overlay_title = ImageFont.truetype(FONT_BOLD, 46)
font_overlay_sub = ImageFont.truetype(FONT_REGULAR, 20)

def create_base_canvas():
    # 1. Base dark slate canvas #0F172A
    base = Image.new('RGBA', (CANVAS_W, CANVAS_H), (15, 23, 42, 255))

    # 2. Add subtle radial gradient / vignette
    glow_layer = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)

    # Purple ambient glow behind Left Phone (460, 555)
    # and Right Phone (1460, 555)
    def draw_radial_glow(center_x, center_y, max_r, color_rgb, max_alpha):
        for r in range(max_r, 0, -8):
            factor = 1.0 - (r / max_r)
            # smooth cubic easing
            alpha = int(max_alpha * (factor ** 2))
            glow_draw.ellipse(
                [center_x - r, center_y - r, center_x + r, center_y + r],
                fill=(color_rgb[0], color_rgb[1], color_rgb[2], alpha)
            )

    draw_radial_glow(LEFT_CENTER_X, CENTER_Y, 380, (124, 58, 237), 55)   # #7C3AED
    draw_radial_glow(RIGHT_CENTER_X, CENTER_Y, 380, (147, 51, 234), 55)  # #9333EA

    # Subtle corner vignette
    vignette = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    vig_draw = ImageDraw.Draw(vignette)
    for r in range(1200, 700, -25):
        alpha = int(140 * ((1200 - r) / 500))
        vig_draw.rectangle([0, 0, CANVAS_W, CANVAS_H], outline=(5, 8, 17, alpha), width=18)

    base = Image.alpha_composite(base, glow_layer)
    base = Image.alpha_composite(base, vignette)

    # 3. Drop Shadows for both Phone Bezels
    shadow_layer = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer)

    def draw_phone_shadow(cx, cy):
        bx0 = cx - (BEZEL_W // 2)
        by0 = cy - (BEZEL_H // 2) + 10
        bx1 = cx + (BEZEL_W // 2)
        by1 = cy + (BEZEL_H // 2) + 10
        shadow_draw.rounded_rectangle([bx0, by0, bx1, by1], radius=BEZEL_R + 6, fill=(0, 0, 0, 180))

    draw_phone_shadow(LEFT_CENTER_X, CENTER_Y)
    draw_phone_shadow(RIGHT_CENTER_X, CENTER_Y)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(32))
    base = Image.alpha_composite(base, shadow_layer)

    # 4. Center Divider Line & Top/Bottom Gradients
    divider = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    div_draw = ImageDraw.Draw(divider)
    # Vertical gradient line at X=960 from Y=120 to Y=980
    y_start, y_end = 120, 980
    mid_y = (y_start + y_end) // 2
    for y in range(y_start, y_end):
        dist = abs(y - mid_y) / (mid_y - y_start)
        alpha = int(190 * (1.0 - (dist ** 2)))
        div_draw.line([(CENTER_X, y), (CENTER_X, y)], fill=(168, 85, 247, alpha), width=2)
    base = Image.alpha_composite(base, divider)

    # 5. Draw Header Titles & Pill Sub-Badges
    header_layer = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    h_draw = ImageDraw.Draw(header_layer)

    # Left Header:
    # Title: Phone 1: Courier (Background Geolocation Active)
    t_left = "Phone 1: Courier (Background Geolocation Active)"
    bbox = font_title.getbbox(t_left)
    tw = bbox[2] - bbox[0]
    h_draw.text((LEFT_CENTER_X - (tw // 2), 34), t_left, font=font_title, fill=(248, 250, 252, 255))

    # Left Pill: STRYT Foreground Service Running
    b_left = "●  STRYT Foreground Service Running"
    bbox_b = font_badge.getbbox(b_left)
    bw = bbox_b[2] - bbox_b[0] + 32
    bh = 28
    bx = LEFT_CENTER_X - (bw // 2)
    by = 74
    # Pill background
    h_draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=14, fill=(59, 7, 100, 230), outline=(147, 51, 234, 255), width=1)
    # Green pulsing dot
    h_draw.text((bx + 14, by + 5), "●", font=font_badge, fill=(52, 211, 153, 255))
    h_draw.text((bx + 30, by + 5), "STRYT Foreground Service Running", font=font_badge, fill=(243, 232, 255, 255))

    # Right Header:
    # Title: Phone 2: Customer (Live Real-Time Tracking)
    t_right = "Phone 2: Customer (Live Real-Time Tracking)"
    bbox_r = font_title.getbbox(t_right)
    twr = bbox_r[2] - bbox_r[0]
    h_draw.text((RIGHT_CENTER_X - (twr // 2), 34), t_right, font=font_title, fill=(248, 250, 252, 255))

    # Right Pill: PostGIS Telemetry Updates
    b_right = "●  PostGIS Telemetry Updates"
    bbox_br = font_badge.getbbox(b_right)
    bwr = bbox_br[2] - bbox_br[0] + 32
    bhr = 28
    bxr = RIGHT_CENTER_X - (bwr // 2)
    byr = 74
    h_draw.rounded_rectangle([bxr, byr, bxr + bwr, byr + bhr], radius=14, fill=(59, 7, 100, 230), outline=(147, 51, 234, 255), width=1)
    h_draw.text((bxr + 14, byr + 5), "●", font=font_badge, fill=(56, 189, 248, 255))
    h_draw.text((bxr + 30, byr + 5), "PostGIS Telemetry Updates", font=font_badge, fill=(243, 232, 255, 255))

    # Center Sync Pill Badge (Static container)
    # Live clock text will be drawn over this by ffmpeg drawtext
    cw, ch = 136, 40
    cx0, cy0 = CENTER_X - (cw // 2), CENTER_Y - (ch // 2)
    cx1, cy1 = cx0 + cw, cy0 + ch
    # Outer glow
    h_draw.rounded_rectangle([cx0 - 2, cy0 - 2, cx1 + 2, cy1 + 2], radius=22, fill=(88, 28, 135, 120))
    h_draw.rounded_rectangle([cx0, cy0, cx1, cy1], radius=20, fill=(15, 23, 42, 245), outline=(139, 92, 246, 255), width=2)

    # 6. Bottom Banner Bar Base (#020617 at 88% opacity, height 70px)
    banner_y0 = 1010
    banner_y1 = 1080
    h_draw.rectangle([0, banner_y0, CANVAS_W, banner_y1], fill=(2, 6, 23, 235))
    # Top accent line with subtle glow
    h_draw.line([(0, banner_y0), (CANVAS_W, banner_y0)], fill=(124, 58, 237, 255), width=2)
    h_draw.line([(0, banner_y0 + 1), (CANVAS_W, banner_y0 + 1)], fill=(168, 85, 247, 120), width=1)

    base = Image.alpha_composite(base, header_layer)
    base_path = os.path.join(ASSETS_DIR, 'bg_canvas.png')
    base.save(base_path, 'PNG')
    print('Saved bg_canvas.png')

def create_bezel_overlay():
    # Overlay that sits on top of the phone screens
    overlay = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    def draw_phone_frame(cx, cy, sw, sh):
        bx0 = cx - (BEZEL_W // 2)
        by0 = cy - (BEZEL_H // 2)
        bx1 = cx + (BEZEL_W // 2)
        by1 = cy + (BEZEL_H // 2)

        # Outer bezel border (subtle purple highlight)
        draw.rounded_rectangle([bx0, by0, bx1, by1], radius=BEZEL_R, outline=(124, 58, 237, 200), width=2)
        # Inner dark bezel metal frame
        draw.rounded_rectangle([bx0 + 2, by0 + 2, bx1 - 2, by1 - 2], radius=BEZEL_R - 2, outline=(30, 41, 59, 255), width=6)

        # Screen inner cutout border
        sx0 = cx - (sw // 2)
        sy0 = cy - (sh // 2)
        sx1 = cx + (sw // 2)
        sy1 = cy + (sh // 2)
        draw.rounded_rectangle([sx0, sy0, sx1, sy1], radius=SCREEN_R, outline=(15, 23, 42, 255), width=2)

        # Speaker slit at top of phone
        speaker_w = 46
        speaker_h = 4
        spx0 = cx - (speaker_w // 2)
        spy0 = by0 + 8
        draw.rounded_rectangle([spx0, spy0, spx0 + speaker_w, spy0 + speaker_h], radius=2, fill=(51, 65, 85, 255))

        # Camera punch-hole dot at top of screen
        cam_r = 4
        cam_y = sy0 + 12
        draw.ellipse([cx - cam_r, cam_y - cam_r, cx + cam_r, cam_y + cam_r], fill=(15, 23, 42, 230), outline=(30, 41, 59, 255), width=1)

    draw_phone_frame(LEFT_CENTER_X, CENTER_Y, SCREEN_LEFT_W, SCREEN_H)
    draw_phone_frame(RIGHT_CENTER_X, CENTER_Y, SCREEN_RIGHT_W, SCREEN_H)

    out_path = os.path.join(ASSETS_DIR, 'bezel_overlay.png')
    overlay.save(out_path, 'PNG')
    print('Saved bezel_overlay.png')

def create_screen_masks():
    # Left mask: SCREEN_LEFT_W x SCREEN_H (384 x 832)
    mask_left = Image.new('L', (SCREEN_LEFT_W, SCREEN_H), 0)
    d_left = ImageDraw.Draw(mask_left)
    d_left.rounded_rectangle([0, 0, SCREEN_LEFT_W - 1, SCREEN_H - 1], radius=SCREEN_R, fill=255)
    mask_left_path = os.path.join(ASSETS_DIR, 'mask_left.png')
    mask_left.save(mask_left_path, 'PNG')

    # Right mask: SCREEN_RIGHT_W x SCREEN_H (374 x 832)
    mask_right = Image.new('L', (SCREEN_RIGHT_W, SCREEN_H), 0)
    d_right = ImageDraw.Draw(mask_right)
    d_right.rounded_rectangle([0, 0, SCREEN_RIGHT_W - 1, SCREEN_H - 1], radius=SCREEN_R, fill=255)
    mask_right_path = os.path.join(ASSETS_DIR, 'mask_right.png')
    mask_right.save(mask_right_path, 'PNG')

    print('Saved mask_left.png and mask_right.png')

def create_banner_overlays():
    scenes = [
        ('banner_s1.png', 'Courier begins transit → Background Location service initializes.'),
        ('banner_s2.png', "Google Play Policy: Prominent disclosure shown before granting 'Allow all the time'."),
        ('banner_s3.png', 'App minimized in Google Maps — Live GPS telemetry continues streaming.'),
        ('banner_s4.png', 'Arrival & PIN 796864 verified — Order delivered & background tracking stops.')
    ]

    for fname, text in scenes:
        im = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(im)

        # Center text horizontally at X=960, vertically at Y=1045
        bbox = font_banner.getbbox(text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = CENTER_X - (tw // 2)
        ty = 1010 + ((70 - th) // 2) - 2

        # Draw crisp white text with subtle dark backing shadow for maximum legibility
        draw.text((tx + 1, ty + 1), text, font=font_banner, fill=(0, 0, 0, 200))
        draw.text((tx, ty), text, font=font_banner, fill=(255, 255, 255, 255))

        out_path = os.path.join(ASSETS_DIR, fname)
        im.save(out_path, 'PNG')
        print(f'Saved {fname}')

def create_closing_overlay():
    im = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)

    # Frosted backdrop over whole video to softly dim background
    draw.rectangle([0, 0, CANVAS_W, CANVAS_H], fill=(15, 23, 42, 170))

    # Center hero card
    card_w = 780
    card_h = 220
    cx0 = CENTER_X - (card_w // 2)
    cy0 = CENTER_Y - (card_h // 2)
    cx1 = cx0 + card_w
    cy1 = cy0 + card_h

    # Card drop shadow
    shadow = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle([cx0, cy0 + 12, cx1, cy1 + 12], radius=28, fill=(0, 0, 0, 220))
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    im = Image.alpha_composite(im, shadow)

    # Re-obtain draw handle
    draw = ImageDraw.Draw(im)
    # Card background & purple border
    draw.rounded_rectangle([cx0, cy0, cx1, cy1], radius=24, fill=(15, 23, 42, 245), outline=(147, 51, 234, 255), width=2)
    # Subtle inner border glow
    draw.rounded_rectangle([cx0 + 2, cy0 + 2, cx1 - 2, cy1 - 2], radius=22, outline=(168, 85, 247, 100), width=1)

    # Brand Title: STRYT
    title_text = "STRYT"
    bbox_t = font_overlay_title.getbbox(title_text)
    tw = bbox_t[2] - bbox_t[0]
    draw.text((CENTER_X - (tw // 2), cy0 + 38), title_text, font=font_overlay_title, fill=(255, 255, 255, 255))

    # Subtitle: Secure Hyperlocal Delivery Powered by PostGIS & Capacitor
    sub_text = "Secure Hyperlocal Delivery Powered by PostGIS & Capacitor"
    bbox_s = font_overlay_sub.getbbox(sub_text)
    sw = bbox_s[2] - bbox_s[0]
    draw.text((CENTER_X - (sw // 2), cy0 + 115), sub_text, font=font_overlay_sub, fill=(226, 232, 240, 255))

    # Purple accent badge line at bottom of card
    badge_line_w = 200
    draw.line(
        [(CENTER_X - (badge_line_w // 2), cy0 + 170), (CENTER_X + (badge_line_w // 2), cy0 + 170)],
        fill=(124, 58, 237, 220), width=3
    )

    out_path = os.path.join(ASSETS_DIR, 'closing_overlay.png')
    im.save(out_path, 'PNG')
    print('Saved closing_overlay.png')

if __name__ == '__main__':
    create_base_canvas()
    create_bezel_overlay()
    create_screen_masks()
    create_banner_overlays()
    create_closing_overlay()
    print('All design assets generated successfully!')
