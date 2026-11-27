import os
import subprocess

FFMPEG = r'C:\Users\D Patel\AppData\Roaming\Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe'
RIDER_VID = os.path.abspath(r'Delivery-verification viedo\WhatsApp Unknown 2026-11-24 at 12.06.32 AM\WhatsApp Video 2026-11-23 at 11.21.52 PM.mp4')
CUST_VID = os.path.abspath(r'Delivery-verification viedo\WhatsApp Unknown 2026-11-24 at 12.06.32 AM\WhatsApp Video 2026-11-23 at 11.21.52 PM (1).mp4')

WORK_DIR = os.path.abspath(r'scripts\video_render\work')
os.makedirs(WORK_DIR, exist_ok=True)

def run_cmd(cmd, desc=""):
    print(f"Running {desc}...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print(f"ERROR in {desc}:\n{res.stderr}")
        raise RuntimeError(f"Command failed: {desc}")
    print(f"DONE: {desc}")

def build_rider_stream():
    # Left (Rider): 384x832, 60fps
    # Segments:
    # S1: 01:00.5 - 01:06.5 (6.0s)
    # S2A: freeze 01:32.0 (2.5s)
    # S2B: 01:33.0 - 01:37.5 (4.5s)
    # S3: 01:56.0 - 02:05.0 (9.0s)
    # S4A: 02:44.0 - 02:46.0 (2.0s)
    # S4B: 03:29.0 - 03:34.0 (5.0s)

    # 1. Segment 1
    seg1 = os.path.join(WORK_DIR, 'rider_seg1.mp4')
    cmd1 = [
        FFMPEG, '-y',
        '-ss', '00:01:00.500', '-i', RIDER_VID, '-t', '6.000',
        '-vf', 'fps=60,scale=384:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg1
    ]
    run_cmd(cmd1, "Rider Seg 1 (6.0s)")

    # 2. Segment 2A: freeze frame at 01:32.0 for 2.5s
    freeze_frame = os.path.join(WORK_DIR, 'rider_s2_freeze.png')
    cmd_f = [
        FFMPEG, '-y',
        '-ss', '00:01:32.000', '-i', RIDER_VID, '-vframes', '1',
        freeze_frame
    ]
    run_cmd(cmd_f, "Rider Freeze Frame 01:32.0")

    seg2a = os.path.join(WORK_DIR, 'rider_seg2a.mp4')
    cmd2a = [
        FFMPEG, '-y',
        '-loop', '1', '-i', freeze_frame, '-t', '2.500',
        '-vf', 'fps=60,scale=384:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg2a
    ]
    run_cmd(cmd2a, "Rider Seg 2A (2.5s freeze)")

    # 3. Segment 2B: 01:33.0 - 01:37.5 (4.5s)
    seg2b = os.path.join(WORK_DIR, 'rider_seg2b.mp4')
    cmd2b = [
        FFMPEG, '-y',
        '-ss', '00:01:33.000', '-i', RIDER_VID, '-t', '4.500',
        '-vf', 'fps=60,scale=384:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg2b
    ]
    run_cmd(cmd2b, "Rider Seg 2B (4.5s)")

    # 4. Segment 3: 01:56.0 - 02:05.0 (9.0s)
    seg3 = os.path.join(WORK_DIR, 'rider_seg3.mp4')
    cmd3 = [
        FFMPEG, '-y',
        '-ss', '00:01:56.000', '-i', RIDER_VID, '-t', '9.000',
        '-vf', 'fps=60,scale=384:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg3
    ]
    run_cmd(cmd3, "Rider Seg 3 (9.0s)")

    # 5. Segment 4A: 02:44.0 - 02:46.0 (2.0s)
    seg4a = os.path.join(WORK_DIR, 'rider_seg4a.mp4')
    cmd4a = [
        FFMPEG, '-y',
        '-ss', '00:02:44.000', '-i', RIDER_VID, '-t', '2.000',
        '-vf', 'fps=60,scale=384:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg4a
    ]
    run_cmd(cmd4a, "Rider Seg 4A (2.0s)")

    # 6. Segment 4B: 03:29.0 - 03:34.0 (5.0s)
    seg4b = os.path.join(WORK_DIR, 'rider_seg4b.mp4')
    cmd4b = [
        FFMPEG, '-y',
        '-ss', '00:03:29.000', '-i', RIDER_VID, '-t', '5.000',
        '-vf', 'fps=60,scale=384:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg4b
    ]
    run_cmd(cmd4b, "Rider Seg 4B (5.0s)")

    # Concatenate all 6 Rider segments using concat demuxer or filter
    concat_list = os.path.join(WORK_DIR, 'rider_concat.txt')
    with open(concat_list, 'w', encoding='utf-8') as f:
        for seg in [seg1, seg2a, seg2b, seg3, seg4a, seg4b]:
            f.write(f"file '{seg}'\n")

    out_rider = os.path.join(WORK_DIR, 'rider_29s.mp4')
    cmd_concat = [
        FFMPEG, '-y',
        '-f', 'concat', '-safe', '0', '-i', concat_list,
        '-c', 'copy',
        out_rider
    ]
    run_cmd(cmd_concat, "Concatenating Rider Stream (29.0s)")
    return out_rider

def build_customer_stream():
    # Right (Customer): 374x832, 60fps
    # Segments:
    # S1: 01:14.0 - 01:20.0 (6.0s)
    # S2: 01:22.0 - 01:29.0 (7.0s)
    # S3: 01:39.0 - 01:48.0 (9.0s)
    # S4: 02:51.0 - 02:58.0 (7.0s)

    # 1. Segment 1: 01:14.0 - 01:20.0 (6.0s)
    seg1 = os.path.join(WORK_DIR, 'cust_seg1.mp4')
    cmd1 = [
        FFMPEG, '-y',
        '-ss', '00:01:14.000', '-i', CUST_VID, '-t', '6.000',
        '-vf', 'fps=60,scale=374:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg1
    ]
    run_cmd(cmd1, "Customer Seg 1 (6.0s)")

    # 2. Segment 2: 01:22.0 - 01:29.0 (7.0s)
    seg2 = os.path.join(WORK_DIR, 'cust_seg2.mp4')
    cmd2 = [
        FFMPEG, '-y',
        '-ss', '00:01:22.000', '-i', CUST_VID, '-t', '7.000',
        '-vf', 'fps=60,scale=374:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg2
    ]
    run_cmd(cmd2, "Customer Seg 2 (7.0s)")

    # 3. Segment 3: 01:39.0 - 01:48.0 (9.0s)
    seg3 = os.path.join(WORK_DIR, 'cust_seg3.mp4')
    cmd3 = [
        FFMPEG, '-y',
        '-ss', '00:01:39.000', '-i', CUST_VID, '-t', '9.000',
        '-vf', 'fps=60,scale=374:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg3
    ]
    run_cmd(cmd3, "Customer Seg 3 (9.0s)")

    # 4. Segment 4: 02:51.0 - 02:58.0 (7.0s)
    seg4 = os.path.join(WORK_DIR, 'cust_seg4.mp4')
    cmd4 = [
        FFMPEG, '-y',
        '-ss', '00:02:51.000', '-i', CUST_VID, '-t', '7.000',
        '-vf', 'fps=60,scale=374:832:flags=lanczos,setsar=1',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-an',
        seg4
    ]
    run_cmd(cmd4, "Customer Seg 4 (7.0s)")

    # Concatenate all 4 Customer segments
    concat_list = os.path.join(WORK_DIR, 'cust_concat.txt')
    with open(concat_list, 'w', encoding='utf-8') as f:
        for seg in [seg1, seg2, seg3, seg4]:
            f.write(f"file '{seg}'\n")

    out_cust = os.path.join(WORK_DIR, 'customer_29s.mp4')
    cmd_concat = [
        FFMPEG, '-y',
        '-f', 'concat', '-safe', '0', '-i', concat_list,
        '-c', 'copy',
        out_cust
    ]
    run_cmd(cmd_concat, "Concatenating Customer Stream (29.0s)")
    return out_cust

if __name__ == '__main__':
    r = build_rider_stream()
    c = build_customer_stream()
    print("Both rider and customer 29s streams built successfully!")
