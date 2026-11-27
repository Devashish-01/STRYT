import os
import subprocess

FFMPEG = r'C:\Users\D Patel\AppData\Roaming\Python\Python314\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe'
RIDER_VID = os.path.abspath(r'Delivery-verification viedo\WhatsApp Unknown 2026-11-24 at 12.06.32 AM\WhatsApp Video 2026-11-23 at 11.21.52 PM.mp4')
CUST_VID = os.path.abspath(r'Delivery-verification viedo\WhatsApp Unknown 2026-11-24 at 12.06.32 AM\WhatsApp Video 2026-11-23 at 11.21.52 PM (1).mp4')

OUT_DIR = os.path.abspath(r'scripts\video_render\inspect_frames')
os.makedirs(OUT_DIR, exist_ok=True)

test_frames = [
    # Rider
    (RIDER_VID, '00:01:00.500', 'rider_s1_start.jpg'),
    (RIDER_VID, '00:01:06.500', 'rider_s1_end.jpg'),
    (RIDER_VID, '00:01:32.000', 'rider_s2_freeze_disclosure.jpg'),
    (RIDER_VID, '00:01:33.000', 'rider_s2_perm_start.jpg'),
    (RIDER_VID, '00:01:37.500', 'rider_s2_perm_end.jpg'),
    (RIDER_VID, '00:01:56.000', 'rider_s3_nav_start.jpg'),
    (RIDER_VID, '00:02:02.000', 'rider_s3_shade.jpg'),
    (RIDER_VID, '00:02:05.000', 'rider_s3_nav_end.jpg'),
    (RIDER_VID, '00:02:44.000', 'rider_s4_arrived_start.jpg'),
    (RIDER_VID, '00:02:46.000', 'rider_s4_arrived_end.jpg'),
    (RIDER_VID, '00:03:29.000', 'rider_s4_pin_start.jpg'),
    (RIDER_VID, '00:03:33.500', 'rider_s4_delivered_toast.jpg'),
    # Customer
    (CUST_VID, '00:01:14.000', 'cust_s1_start.jpg'),
    (CUST_VID, '00:01:20.000', 'cust_s1_end.jpg'),
    (CUST_VID, '00:01:22.000', 'cust_s2_start.jpg'),
    (CUST_VID, '00:01:29.000', 'cust_s2_end.jpg'),
    (CUST_VID, '00:01:39.000', 'cust_s3_start.jpg'),
    (CUST_VID, '00:01:48.000', 'cust_s3_end.jpg'),
    (CUST_VID, '00:02:51.000', 'cust_s4_start.jpg'),
    (CUST_VID, '00:02:58.000', 'cust_s4_end.jpg'),
]

for src, ts, fname in test_frames:
    target = os.path.join(OUT_DIR, fname)
    cmd = [FFMPEG, '-y', '-ss', ts, '-i', src, '-vframes', '1', '-q:v', '2', target]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if os.path.exists(target):
        print(f'OK: {fname} @ {ts} ({os.path.getsize(target)} bytes)')
    else:
        print(f'FAIL: {fname} @ {ts}')
