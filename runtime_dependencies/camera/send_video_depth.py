import cv2
import fcntl
import socket
import struct
import sys
import time
import numpy as np
import pyrealsense2 as rs

# --- CONFIGURARE ---
LAPTOP_IP = "127.0.0.1"
TCP_PORT = 5005

WIDTH = 640
HEIGHT = 480
FPS = 30

JPEG_QUALITY = 60
SEND_FPS_LIMIT = 10
# -------------------

# Nu permitem două procese să deschidă simultan aceeași cameră RealSense.
_lock_file = open("/tmp/unitree_send_video_depth.lock", "w")
try:
    fcntl.flock(_lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    print("Camera este deja folosită de altă instanță send_video_depth.py.", flush=True)
    sys.exit(2)


def connect_to_laptop():
    while True:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3.0)
        try:
            print(f"Incerc conectarea la dashboard {LAPTOP_IP}:{TCP_PORT}...", flush=True)
            sock.connect((LAPTOP_IP, TCP_PORT))
            # Evită un sendall blocat pentru totdeauna dacă dashboardul se oprește.
            sock.settimeout(5.0)
            print("Conectat la dashboard.", flush=True)
            return sock
        except Exception as e:
            sock.close()
            print(f"Dashboard indisponibil: {e}. Reincerc in 1s...", flush=True)
            time.sleep(1)


pipeline = rs.pipeline()
config = rs.config()

config.enable_stream(rs.stream.depth, WIDTH, HEIGHT, rs.format.z16, FPS)
config.enable_stream(rs.stream.color, WIDTH, HEIGHT, rs.format.bgr8, FPS)

print("Deschid camera RealSense (depth + color 640x480@30)...", flush=True)
try:
    profile = pipeline.start(config)
except Exception as e:
    print(f"Nu pot porni RealSense: {e}", flush=True)
    print("Verifica sa nu ruleze realsense-viewer sau alta aplicatie care foloseste camera.", flush=True)
    sys.exit(1)

device = profile.get_device()
print(
    f"RealSense pornit: {device.get_info(rs.camera_info.name)} "
    f"[{device.get_info(rs.camera_info.serial_number)}]",
    flush=True,
)

depth_sensor = device.first_depth_sensor()
depth_scale = depth_sensor.get_depth_scale()

align = rs.align(rs.stream.color)

sock = None

print("Trimit color + depth catre dashboard...", flush=True)
print("Apasa Ctrl+C pentru oprire.", flush=True)

last_send = 0
min_interval = 1.0 / SEND_FPS_LIMIT

try:
    while True:
        if sock is None:
            sock = connect_to_laptop()

        frames = pipeline.wait_for_frames()
        aligned_frames = align.process(frames)

        depth_frame = aligned_frames.get_depth_frame()
        color_frame = aligned_frames.get_color_frame()

        if not depth_frame or not color_frame:
            print("Nu am frame valid.")
            continue

        now = time.time()
        if now - last_send < min_interval:
            continue
        last_send = now

        color_image = np.asanyarray(color_frame.get_data())

        depth_raw = np.asanyarray(depth_frame.get_data())

        # Convertim depth-ul in milimetri ca sa fie usor de citit pe laptop
        depth_mm = (depth_raw.astype(np.float32) * depth_scale * 1000.0)
        depth_mm = np.clip(depth_mm, 0, 65535).astype(np.uint16)

        color_ok, color_buffer = cv2.imencode(
            ".jpg",
            color_image,
            [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]
        )

        depth_ok, depth_buffer = cv2.imencode(".png", depth_mm)

        if not color_ok or not depth_ok:
            print("Nu am putut comprima frame-ul.")
            continue

        color_bytes = color_buffer.tobytes()
        depth_bytes = depth_buffer.tobytes()

        payload = struct.pack(">II", len(color_bytes), len(depth_bytes)) + color_bytes + depth_bytes
        packet = struct.pack(">I", len(payload)) + payload

        try:
            sock.sendall(packet)
        except (BrokenPipeError, ConnectionError, OSError, socket.timeout) as e:
            print(f"Conexiune camera pierduta: {e}. Ma reconectez...", flush=True)
            sock.close()
            sock = None

except KeyboardInterrupt:
    print("Oprit manual.")

except Exception as e:
    print(f"Eroare: {e}")

finally:
    pipeline.stop()
    if sock is not None:
        sock.close()
