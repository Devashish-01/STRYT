import os
import subprocess
import time

FFMPEG = r'C:\Users\D Patel\AppData\Roaming\Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe'

ASSETS_DIR = os.path.abspath(r'scripts\video_render\assets')
WORK_DIR = os.path.abspath(r'scripts\video_render\work')

BG_CANVAS = os.path.join(ASSETS_DIR, 'bg_canvas.png')
MASK_LEFT = os.path.join(ASSETS_DIR, 'mask_left.png')
MASK_RIGHT = os.path.join(ASSETS_DIR, 'mask_right.png')
BEZEL_OVERLAY = os.path.join(ASSETS_DIR, 'bezel_overlay.png')
BANNER_S1 = os.path.join(ASSETS_DIR, 'banner_s1.png')
BANNER_S2 = os.path.join(ASSETS_DIR, 'banner_s2.png')
BANNER_S3 = os.path.join(ASSETS_DIR, 'banner_s3.png')
BANNER_S4 = os.path.join(ASSETS_DIR, 'banner_s4.png')
CLOSING_OVERLAY = os.path.join(ASSETS_DIR, 'closing_overlay.png')

RIDER_STREAM = os.path.join(WORK_DIR, 'rider_29s.mp4')
CUST_STREAM = os.path.join(WORK_DIR, 'customer_29s.mp4')

OUTPUT_FILE = os.path.abspath('stryt_google_play_demo.mp4')

def build_filter_complex():
    # Filtergraph steps:
    # 1. Pad rider and customer streams so they don't terminate early
    #    [1:v] tpad=stop_mode=clone:stop_duration=1,format=yuva420p [v_rider_pad];
    #    [3:v] tpad=stop_mode=clone:stop_duration=1,format=yuva420p [v_cust_pad];
    # 2. Apply alpha masks to phone screens
    #    [v_rider_pad][2:v] alphamerge [v_rider_masked];
    #    [v_cust_pad][4:v] alphamerge [v_cust_masked];
    # 3. Composite onto base canvas:
    #    [0:v][v_rider_masked] overlay=268:139:shortest=0 [tmp1];
    #    [tmp1][v_cust_masked] overlay=1273:139:shortest=0 [tmp2];
    # 4. Composite bezel overlay
    #    [tmp2][5:v] overlay=0:0 [tmp3];
    # 5. Composite scene banners
    #    [tmp3][6:v] overlay=0:0:enable='between(t,0,6.0)' [tmp4];
    #    [tmp4][7:v] overlay=0:0:enable='between(t,6.0,13.0)' [tmp5];
    #    [tmp5][8:v] overlay=0:0:enable='between(t,13.0,22.0)' [tmp6];
    #    [tmp6][9:v] overlay=0:0:enable='between(t,22.0,27.0)' [tmp7];
    # 6. Composite closing hero card with smooth fade-in
    #    [10:v] format=yuva420p,fade=t=in:st=27.0:d=0.25:alpha=1 [closing_faded];
    #    [tmp7][closing_faded] overlay=0:0:enable='gte(t,27.0)' [tmp8];
    # 7. Draw running live clock in center pill
    #    Two drawtext filters:
    #    (a) indicator ⇄ in #C084FC
    #    (b) time 00:ss in crisp white #FFFFFF

    font_bold = r'C\:/Windows/Fonts/segoeuib.ttf'
    font_reg = r'C\:/Windows/Fonts/segoeui.ttf'

    filter_str = (
        "[1:v]tpad=stop_mode=clone:stop_duration=1,format=yuva420p[v_rider_pad];"
        "[2:v]format=gray[m_left];"
        "[v_rider_pad][m_left]alphamerge[v_rider_masked];"
        "[3:v]tpad=stop_mode=clone:stop_duration=1,format=yuva420p[v_cust_pad];"
        "[4:v]format=gray[m_right];"
        "[v_cust_pad][m_right]alphamerge[v_cust_masked];"
        "[0:v][v_rider_masked]overlay=268:139:shortest=0[tmp1];"
        "[tmp1][v_cust_masked]overlay=1273:139:shortest=0[tmp2];"
        "[tmp2][5:v]overlay=0:0[tmp3];"
        f"[tmp3]drawtext=fontfile='{font_reg}':text='⇄ ':fontcolor=0xC084FC:fontsize=19:x=960-44:y=555-(text_h/2),"
        f"drawtext=fontfile='{font_bold}':text='00\:%{{eif\\:min(29,trunc(t))\\:d\\:2}}':fontcolor=white:fontsize=18:x=960-14:y=555-(text_h/2)[tmp3_clock];"
        "[tmp3_clock][6:v]overlay=0:0:enable='between(t,0,6.0)'[tmp4];"
        "[tmp4][7:v]overlay=0:0:enable='between(t,6.0,13.0)'[tmp5];"
        "[tmp5][8:v]overlay=0:0:enable='between(t,13.0,22.0)'[tmp6];"
        "[tmp6][9:v]overlay=0:0:enable='between(t,22.0,27.0)'[tmp7];"
        "[10:v]format=yuva420p,fade=t=in:st=27.0:d=0.25:alpha=1[closing_faded];"
        "[tmp7][closing_faded]overlay=0:0:enable='gte(t,27.0)'[outv]"
    )
    return filter_str

def render():
    filter_complex = build_filter_complex()

    cmd = [
        FFMPEG, '-y',
        '-loop', '1', '-i', BG_CANVAS,           # Input 0
        '-i', RIDER_STREAM,                       # Input 1
        '-loop', '1', '-i', MASK_LEFT,           # Input 2
        '-i', CUST_STREAM,                        # Input 3
        '-loop', '1', '-i', MASK_RIGHT,          # Input 4
        '-loop', '1', '-i', BEZEL_OVERLAY,        # Input 5
        '-loop', '1', '-i', BANNER_S1,            # Input 6
        '-loop', '1', '-i', BANNER_S2,            # Input 7
        '-loop', '1', '-i', BANNER_S3,            # Input 8
        '-loop', '1', '-i', BANNER_S4,            # Input 9
        '-loop', '1', '-i', CLOSING_OVERLAY,       # Input 10
        '-filter_complex', filter_complex,
        '-map', '[outv]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-r', '60',
        '-t', '29.000',
        '-an',
        OUTPUT_FILE
    ]

    print("Executing master render pipeline...")
    t0 = time.time()
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    t1 = time.time()
    if res.returncode != 0:
        print("ERROR RENDERING VIDEO:")
        print(res.stderr)
        raise RuntimeError("FFmpeg rendering failed")
    print(f"RENDER SUCCESSFUL in {t1 - t0:.2f}s!")
    print(f"Output saved to: {OUTPUT_FILE}")
    print(f"File size: {os.path.getsize(OUTPUT_FILE):,} bytes")

if __name__ == '__main__':
    render()
