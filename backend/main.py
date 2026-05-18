from fastapi import FastAPI, Depends, HTTPException, status, Response, Request, Query, UploadFile, File
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pymongo import ReturnDocument
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Set, Tuple
from pathlib import Path
from collections import deque
from urllib.parse import urlsplit, parse_qsl, urlencode, urlunsplit
from bson import ObjectId
from bson.errors import InvalidId
import os, uuid, jwt, logging, json, base64, asyncio, io, threading, tempfile, time, math, hmac, copy
import numpy as np
import subprocess
import importlib
import re
import httpx
from dotenv import load_dotenv

try:
    import cv2
except Exception:
    cv2 = None

try:
    from ultralytics import YOLO
    ULTRALYTICS_IMPORT_ERROR = None
except Exception as exc:
    YOLO = None
    ULTRALYTICS_IMPORT_ERROR = str(exc)

try:
    _imageio_ffmpeg = importlib.import_module("imageio_ffmpeg")
except Exception:
    _imageio_ffmpeg = None

load_dotenv(Path(__file__).parent / ".env")

# Prefer low-latency ffmpeg options when OpenCV uses FFmpeg backend.
if "OPENCV_FFMPEG_CAPTURE_OPTIONS" not in os.environ:
    rtsp_transport = os.getenv("LIVE_RTSP_TRANSPORT", "udp").strip().lower()
    if rtsp_transport not in ("udp", "tcp"):
        rtsp_transport = "udp"

    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        f"rtsp_transport;{rtsp_transport}|fflags;nobuffer|flags;low_delay|"
        "max_delay;0|reorder_queue_size;0|analyzeduration;0|probesize;32|flush_packets;1"
    )

# ΓöÇΓöÇ Config ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
MONGO_URL   = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME     = os.getenv("DB_NAME", "safesight")
SECRET_KEY  = os.getenv("SECRET_KEY", "changeme-in-production")
ALGORITHM   = "HS256"
TOKEN_EXP   = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
SMS_API_URL = os.getenv("SMS_API_URL", "").strip()
SMS_API_KEY = os.getenv("SMS_API_KEY", "").strip()
SMS_API_AUTH_HEADER = os.getenv("SMS_API_AUTH_HEADER", "Authorization").strip()
SMS_API_AUTH_SCHEME = os.getenv("SMS_API_AUTH_SCHEME", "Bearer").strip()
SMS_API_FROM = os.getenv("SMS_API_FROM", "").strip()
SMS_API_TO_FIELD = os.getenv("SMS_API_TO_FIELD", "to").strip()
SMS_API_MESSAGE_FIELD = os.getenv("SMS_API_MESSAGE_FIELD", "message").strip()
SMS_API_FROM_FIELD = os.getenv("SMS_API_FROM_FIELD", "from").strip()
SMS_API_EXTRA_JSON = os.getenv("SMS_API_EXTRA_JSON", "").strip()
SMS_API_TIMEOUT_SECONDS = float(os.getenv("SMS_API_TIMEOUT_SECONDS", "10"))
SMS_RETRY_WITHOUT_LINKS_ON_BLOCK = os.getenv("SMS_RETRY_WITHOUT_LINKS_ON_BLOCK", "1").strip().lower() in (
    "1", "true", "yes", "on"
)
SMS_TEST_MESSAGE = os.getenv(
    "SMS_TEST_MESSAGE",
    "SafeSight notice for {name}: alert log updated at {camera} ({location}). Ref {ref}.",
).strip()
SMS_TEST_SPAM_FALLBACK_MESSAGE = os.getenv(
    "SMS_TEST_SPAM_FALLBACK_MESSAGE",
    "SafeSight notice for {name}: reference {ref}. Contact admin if unexpected.",
).strip()
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8001").strip().rstrip("/")
PUBLIC_VIDEO_TOKEN_SECRET = (os.getenv("PUBLIC_VIDEO_TOKEN_SECRET", SECRET_KEY) or SECRET_KEY).strip()
PUBLIC_VIDEO_TOKEN_TTL_SECONDS = max(int(os.getenv("PUBLIC_VIDEO_TOKEN_TTL_SECONDS", "86400")), 60)
COLLISION_CLIP_SECONDS = max(int(os.getenv("COLLISION_CLIP_SECONDS", "15")), 5)
COLLISION_PRE_EVENT_SECONDS = max(int(os.getenv("COLLISION_PRE_EVENT_SECONDS", "10")), 0)
COLLISION_CLIP_FPS = max(int(os.getenv("COLLISION_CLIP_FPS", "10")), 1)
SIMULATION_ANALYSIS_FPS = max(float(os.getenv("SIMULATION_ANALYSIS_FPS", "6")), 1.0)
SIMULATION_MAX_ANALYZED_FRAMES = int(os.getenv("SIMULATION_MAX_ANALYZED_FRAMES", "0"))
if SIMULATION_MAX_ANALYZED_FRAMES < 0:
    SIMULATION_MAX_ANALYZED_FRAMES = 0
SIMULATION_MAX_UPLOAD_MB = max(float(os.getenv("SIMULATION_MAX_UPLOAD_MB", "250")), 5.0)
WEBCAM_SIMULATION_CAMERA_ID = os.getenv("WEBCAM_SIMULATION_CAMERA_ID", "webcam-simulation").strip() or "webcam-simulation"
LIVE_STREAM_FPS = max(int(os.getenv("LIVE_STREAM_FPS", "60")), 0)
LIVE_STREAM_DRAIN_GRABS = max(int(os.getenv("LIVE_STREAM_DRAIN_GRABS", "0")), 0)
LIVE_STREAM_MAX_CATCHUP_GRABS = max(int(os.getenv("LIVE_STREAM_MAX_CATCHUP_GRABS", "4")), 0)
LIVE_STREAM_JPEG_QUALITY = max(min(int(os.getenv("LIVE_STREAM_JPEG_QUALITY", "60")), 95), 40)
LIVE_STREAM_MAX_WIDTH = max(int(os.getenv("LIVE_STREAM_MAX_WIDTH", "960")), 0)
LIVE_STREAM_MAX_HEIGHT = max(int(os.getenv("LIVE_STREAM_MAX_HEIGHT", "0")), 0)
LIVE_STREAM_MAX_READ_FAILURES = max(int(os.getenv("LIVE_STREAM_MAX_READ_FAILURES", "20")), 1)
LIVE_STREAM_OVERLAY_ENABLED = os.getenv("LIVE_STREAM_OVERLAY_ENABLED", "1").strip().lower() in ("1", "true", "yes", "on")
LIVE_OVERLAY_INFERENCE_INTERVAL_SECONDS = max(float(os.getenv("LIVE_OVERLAY_INFERENCE_INTERVAL_SECONDS", "0.25")), 0.05)
LIVE_OVERLAY_MAX_BOXES = max(int(os.getenv("LIVE_OVERLAY_MAX_BOXES", "20")), 1)
RTSP_VALIDATION_TIMEOUT_SECONDS = max(float(os.getenv("RTSP_VALIDATION_TIMEOUT_SECONDS", "5")), 1.0)
RTSP_VALIDATION_RETRY_INTERVAL_SECONDS = max(float(os.getenv("RTSP_VALIDATION_RETRY_INTERVAL_SECONDS", "0.05")), 0.01)
CAMERA_RECONNECT_FAIL_AFTER_SECONDS = max(int(os.getenv("CAMERA_RECONNECT_FAIL_AFTER_SECONDS", "30")), 10)
LIVE_FORCE_SUBTYPE0 = os.getenv("LIVE_FORCE_SUBTYPE0", "1").strip().lower() in ("1", "true", "yes", "on")
PREBUFFER_ACTIVE_CAMERAS_ON_STARTUP = os.getenv("PREBUFFER_ACTIVE_CAMERAS_ON_STARTUP", "0").strip().lower() in (
    "1", "true", "yes", "on"
)
DETECTION_ENABLED = os.getenv("DETECTION_ENABLED", "0").strip().lower() in ("1", "true", "yes", "on")
DETECTION_MODEL_PATH = os.getenv("DETECTION_MODEL_PATH", "backend/models/best.pt").strip()
DETECTION_CONFIDENCE_THRESHOLD = min(max(float(os.getenv("DETECTION_CONFIDENCE_THRESHOLD", "0.60")), 0.0), 1.0)
DETECTION_COOLDOWN_SECONDS = max(float(os.getenv("DETECTION_COOLDOWN_SECONDS", "12")), 0.0)
DETECTION_POLL_INTERVAL_SECONDS = max(float(os.getenv("DETECTION_POLL_INTERVAL_SECONDS", "0.40")), 0.05)
DETECTION_ALLOWED_CLASS_IDS = os.getenv("DETECTION_ALLOWED_CLASS_IDS", "").strip()
DETECTION_ALLOWED_CLASS_NAMES = os.getenv("DETECTION_ALLOWED_CLASS_NAMES", "").strip()
DETECTION_DIRECT_CLASS_NAMES = os.getenv("DETECTION_DIRECT_CLASS_NAMES", "").strip()
DETECTION_DESCRIPTION_PREFIX = os.getenv("DETECTION_DESCRIPTION_PREFIX", "Auto-detected collision").strip() or "Auto-detected collision"
COLLISION_PRE_EVENT_SECONDS = min(COLLISION_PRE_EVENT_SECONDS, COLLISION_CLIP_SECONDS - 1)
COLLISION_POST_EVENT_SECONDS = COLLISION_CLIP_SECONDS - COLLISION_PRE_EVENT_SECONDS
ALLOWED_CAMERA_STATUSES = {"active", "inactive", "maintenance", "failed"}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)

def _utc_now_iso() -> str:
    return _utc_now().isoformat()

def _parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    elif len(raw) >= 19 and raw[10] == "T":
        tz_tail = raw[19:]
        if not tz_tail or ("+" not in tz_tail and "-" not in tz_tail):
            raw = f"{raw}+00:00"

    try:
        parsed = datetime.fromisoformat(raw)
    except Exception:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed

def _parse_csv_int_set(raw_value: str) -> Set[int]:
    values: Set[int] = set()
    if not raw_value:
        return values

    for token in raw_value.split(","):
        item = token.strip()
        if not item:
            continue
        try:
            values.add(int(item))
        except Exception:
            logger.warning("Ignoring invalid DETECTION_ALLOWED_CLASS_IDS token: %s", item)
    return values

def _parse_csv_str_set(raw_value: str) -> Set[str]:
    values: Set[str] = set()
    if not raw_value:
        return values

    for token in raw_value.split(","):
        item = token.strip().lower()
        if item:
            values.add(item)
    return values

def _normalize_phone_number(value: str) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) == 12 and digits.startswith("63") and digits[2:3] == "9":
        digits = "0" + digits[2:]
    if len(digits) != 11 or not digits.startswith("09"):
        raise HTTPException(400, "Phone number must be 11 digits starting with 09 or use +63 for Philippines.")
    return digits

def _validate_password(value: str) -> None:
    if value is None:
        return
    if len(value) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")

def _normalize_collision_severity(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    severity_value = str(value or "medium").strip().lower()
    if severity_value not in {"low", "medium", "high"}:
        severity_value = "medium"
    return severity_value

def _normalize_collision_type(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    type_value = str(value or "").strip().lower()
    if not type_value:
        return None

    aliases = {
        "single-vehicle": "single_vehicle",
        "single vehicle": "single_vehicle",
        "single_vehicle": "single_vehicle",
        "rear-end": "rear_end",
        "rear end": "rear_end",
        "rear_end": "rear_end",
        "head-on": "head_on",
        "head on": "head_on",
        "head_on": "head_on",
        "side-impact": "side_impact",
        "side impact": "side_impact",
        "side_impact": "side_impact",
        "multi-vehicle": "multi_vehicle",
        "multi vehicle": "multi_vehicle",
        "multi_vehicle": "multi_vehicle",
    }

    normalized = aliases.get(type_value)
    if normalized not in {"single_vehicle", "rear_end", "head_on", "side_impact", "multi_vehicle"}:
        return None
    return normalized

def _normalize_collision_status(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    status_value = str(value or "").strip().lower()
    if status_value not in {"pending", "acknowledged", "responded", "resolved"}:
        return None
    return status_value

COLLISION_STATUS_REFERENCE = [
    {"id": "pending", "label": "Pending", "sort_order": 1},
    {"id": "acknowledged", "label": "Acknowledged", "sort_order": 2},
    {"id": "responded", "label": "Responded", "sort_order": 3},
    {"id": "resolved", "label": "Resolved", "sort_order": 4},
]

COLLISION_SEVERITY_REFERENCE = [
    {"id": "low", "label": "Low", "rank": 1},
    {"id": "medium", "label": "Medium", "rank": 2},
    {"id": "high", "label": "High", "rank": 3},
]

COLLISION_TYPE_REFERENCE = [
    {"id": "single_vehicle", "label": "Single-Vehicle", "is_multi": False},
    {"id": "rear_end", "label": "Rear-End", "is_multi": True},
    {"id": "head_on", "label": "Head-On", "is_multi": True},
    {"id": "side_impact", "label": "Side-Impact", "is_multi": True},
    {"id": "multi_vehicle", "label": "Multi-Vehicle", "is_multi": True},
]

def _severity_from_confidence(confidence_score: float) -> str:
    if confidence_score >= 0.90:
        return "high"
    if confidence_score >= 0.75:
        return "medium"
    return "low"

def _tune_capture_for_low_latency(capture):
    if capture is None:
        return

    for prop_name, value in (
        ("CAP_PROP_BUFFERSIZE", 1),
        ("CAP_PROP_FPS", LIVE_STREAM_FPS if LIVE_STREAM_FPS > 0 else 30),
        ("CAP_PROP_OPEN_TIMEOUT_MSEC", 3000),
        ("CAP_PROP_READ_TIMEOUT_MSEC", 1000),
    ):
        if hasattr(cv2, prop_name):
            try:
                capture.set(getattr(cv2, prop_name), value)
            except Exception:
                pass

def _open_capture(rtsp_url: str):
    capture = None

    if hasattr(cv2, "CAP_FFMPEG"):
        try:
            capture = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        except Exception:
            capture = None

    if capture is None or not capture.isOpened():
        if capture is not None:
            capture.release()
        capture = cv2.VideoCapture(rtsp_url)

    _tune_capture_for_low_latency(capture)
    return capture

def _resize_frame_for_live(frame):
    if frame is None or LIVE_STREAM_MAX_WIDTH <= 0 and LIVE_STREAM_MAX_HEIGHT <= 0:
        return frame

    try:
        height, width = frame.shape[:2]
    except Exception:
        return frame

    scale = 1.0
    if LIVE_STREAM_MAX_WIDTH > 0 and width > LIVE_STREAM_MAX_WIDTH:
        scale = min(scale, LIVE_STREAM_MAX_WIDTH / float(width))
    if LIVE_STREAM_MAX_HEIGHT > 0 and height > LIVE_STREAM_MAX_HEIGHT:
        scale = min(scale, LIVE_STREAM_MAX_HEIGHT / float(height))

    if scale >= 1.0:
        return frame

    next_width = max(int(width * scale), 1)
    next_height = max(int(height * scale), 1)

    try:
        return cv2.resize(frame, (next_width, next_height), interpolation=cv2.INTER_AREA)
    except Exception:
        return frame

def _draw_detection_overlay(frame, inference: Optional[dict]):
    if frame is None:
        return frame

    try:
        output = frame.copy()
    except Exception:
        return frame

    details = inference if isinstance(inference, dict) else {}
    boxes = details.get("boxes") if isinstance(details.get("boxes"), list) else []

    raw_pair = details.get("pair_id") if isinstance(details.get("pair_id"), (list, tuple)) else []
    pair_track_ids = set()
    for item in raw_pair:
        try:
            pair_track_ids.add(int(item))
        except Exception:
            continue

    for box in boxes[:LIVE_OVERLAY_MAX_BOXES]:
        if not isinstance(box, dict):
            continue

        coords = box.get("coords")
        if not isinstance(coords, (list, tuple)) or len(coords) != 4:
            continue

        try:
            x1, y1, x2, y2 = [int(round(float(value))) for value in coords]
        except Exception:
            continue

        track_id = box.get("track_id")
        is_pair_box = False
        if track_id is not None:
            try:
                is_pair_box = int(track_id) in pair_track_ids
            except Exception:
                is_pair_box = False

        is_ghost = bool(box.get("is_ghost"))
        if is_pair_box:
            color = (0, 0, 255)
        elif is_ghost:
            color = (0, 165, 255)
        else:
            color = (0, 200, 0)

        try:
            cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
        except Exception:
            continue

        class_name = str(box.get("class_name") or "object")
        confidence = box.get("confidence")
        confidence_text = ""
        if isinstance(confidence, (int, float)):
            confidence_text = f" {float(confidence):.0%}"

        track_text = ""
        if track_id is not None:
            try:
                track_text = f" #T{int(track_id)}"
            except Exception:
                track_text = ""

        label = f"{class_name}{confidence_text}{track_text}"
        text_x = max(x1, 0)
        text_y = max(y1 - 8, 16)
        cv2.putText(
            output,
            label,
            (text_x, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            2,
            cv2.LINE_AA,
        )

    detected = bool(details.get("detected"))
    banner = "LIVE DETECTION"
    if detected:
        confidence = details.get("confidence")
        if isinstance(confidence, (int, float)):
            banner = f"COLLISION CANDIDATE {float(confidence):.0%}"
        else:
            banner = "COLLISION CANDIDATE"

    banner_color = (0, 0, 255) if detected else (0, 140, 255)
    cv2.putText(
        output,
        banner,
        (12, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.75,
        banner_color,
        2,
        cv2.LINE_AA,
    )

    return output

def _normalize_camera_status(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    status_value = str(value).strip().lower()
    if not status_value:
        raise HTTPException(422, "Camera status cannot be empty.")
    if status_value == "error":
        status_value = "failed"
    if status_value not in ALLOWED_CAMERA_STATUSES:
        allowed = ", ".join(sorted(ALLOWED_CAMERA_STATUSES))
        raise HTTPException(422, f"Invalid camera status '{status_value}'. Allowed: {allowed}.")
    return status_value

def _probe_rtsp_stream_sync(rtsp_url: str):
    if cv2 is None:
        return False, "OpenCV is not installed on backend."

    candidate = (rtsp_url or "").strip()
    if not candidate:
        return False, "Camera stream URL is missing."
    if not candidate.lower().startswith("rtsp://"):
        return False, "RTSP URL must start with rtsp://"

    capture = None
    effective_rtsp_url = _prefer_main_stream_rtsp(candidate)

    try:
        capture = _open_capture(effective_rtsp_url)
        if capture is None or not capture.isOpened():
            return False, "Unable to open RTSP stream. Check stream URL, credentials, and path."

        deadline = time.perf_counter() + RTSP_VALIDATION_TIMEOUT_SECONDS
        while time.perf_counter() < deadline:
            if capture.grab():
                ok, frame = capture.retrieve()
                if ok and frame is not None:
                    return True, ""
            time.sleep(RTSP_VALIDATION_RETRY_INTERVAL_SECONDS)

        return False, (
            "RTSP stream opened but no frames were received within "
            f"{RTSP_VALIDATION_TIMEOUT_SECONDS:.1f}s."
        )
    except Exception as exc:
        return False, f"RTSP validation error: {exc}"
    finally:
        if capture is not None:
            capture.release()

async def _ensure_rtsp_reachable(rtsp_url: str):
    if _is_webcam_source(rtsp_url):
        return
    loop = asyncio.get_running_loop()
    try:
        # Add a timeout to prevent hanging on unreachable streams
        ok, detail = await asyncio.wait_for(
            loop.run_in_executor(None, _probe_rtsp_stream_sync, rtsp_url),
            timeout=30.0
        )
        if not ok:
            raise HTTPException(400, detail)
    except asyncio.TimeoutError:
        raise HTTPException(408, "RTSP stream validation timed out. Check your network connection and stream URL.")

def _prefer_main_stream_rtsp(rtsp_url: str) -> str:
    if not LIVE_FORCE_SUBTYPE0 or not rtsp_url or "subtype=" not in rtsp_url.lower():
        return rtsp_url

    try:
        parsed = urlsplit(rtsp_url)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
        changed = False
        next_pairs = []

        for key, value in query_pairs:
            if key.lower() == "subtype" and value.strip() == "1":
                next_pairs.append((key, "0"))
                changed = True
            else:
                next_pairs.append((key, value))

        if not changed:
            return rtsp_url

        new_query = urlencode(next_pairs)
        updated = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
        logger.info("Camera stream adjusted to low-latency main stream (subtype=0)")
        return updated
    except Exception:
        return rtsp_url

def _is_webcam_source(rtsp_url: str) -> bool:
    return str(rtsp_url or "").strip().lower().startswith("webcam://")

class CameraPreBufferWorker:
    """Continuously reads frames and keeps a short in-memory pre-event frame buffer."""

    def __init__(self, camera_id: str, rtsp_url: str, pre_seconds: int, target_fps: int):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.pre_seconds = pre_seconds
        self.target_fps = target_fps
        self.max_frames = max(pre_seconds * target_fps, 1)
        self.buffer = deque(maxlen=self.max_frames)
        self.latest_frame = None
        self.latest_frame_ts = None
        self.latest_jpeg = None
        self.latest_jpeg_ts = None
        self.latest_inference = None
        self.latest_inference_ts = None
        self._buffer_interval_ns = int(1_000_000_000 / max(target_fps, 1))
        self._last_buffer_append_ns = 0
        self._drain_grabs = LIVE_STREAM_DRAIN_GRABS
        self._max_catchup_grabs = LIVE_STREAM_MAX_CATCHUP_GRABS
        self._live_encode_interval_ns = int(1_000_000_000 / LIVE_STREAM_FPS) if LIVE_STREAM_FPS > 0 else 0
        self._last_live_encode_ns = 0
        self._last_capture_ns = 0
        self._base_sleep_s = max(1.0 / max(target_fps, 1), 0.02)
        self._live_subscribers = 0
        self._max_read_failures = LIVE_STREAM_MAX_READ_FAILURES
        self._read_failures = 0
        now_ns = time.time_ns()
        self._created_ns = now_ns
        self._last_frame_ok_ns = 0
        self._last_open_attempt_ns = 0
        self._last_open_success_ns = 0
        self._last_failure_ns = 0
        self._last_failure_reason = ""
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True, name=f"clip-buffer-{camera_id}")

    def start(self):
        if not self.thread.is_alive():
            self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=3)

    def get_pre_frames(self, event_ts: datetime):
        if self.pre_seconds <= 0:
            return []

        cutoff = event_ts - timedelta(seconds=self.pre_seconds)
        with self.lock:
            frames = [frame.copy() for ts, frame in self.buffer if ts >= cutoff]
        return frames

    def get_latest_frame(self):
        with self.lock:
            if self.latest_frame is None:
                return None
            return self.latest_frame.copy()

    def get_latest_frame_packet(self):
        with self.lock:
            if self.latest_frame is None or self.latest_frame_ts is None:
                return None, None
            return self.latest_frame.copy(), self.latest_frame_ts

    def get_latest_jpeg_packet(self):
        with self.lock:
            if self.latest_jpeg is None or self.latest_jpeg_ts is None:
                return None, None
            return self.latest_jpeg, self.latest_jpeg_ts

    def set_latest_inference(self, inference: Optional[dict], frame_ts_ns: Optional[int] = None):
        with self.lock:
            self.latest_inference = copy.deepcopy(inference) if isinstance(inference, dict) else None
            self.latest_inference_ts = int(frame_ts_ns) if frame_ts_ns else time.time_ns()

    def get_latest_inference_packet(self):
        with self.lock:
            if self.latest_inference is None or self.latest_inference_ts is None:
                return None, None
            return copy.deepcopy(self.latest_inference), self.latest_inference_ts

    def add_live_subscriber(self):
        with self.lock:
            self._live_subscribers += 1

    def remove_live_subscriber(self):
        with self.lock:
            self._live_subscribers = max(self._live_subscribers - 1, 0)

    def has_live_subscribers(self):
        with self.lock:
            return self._live_subscribers > 0

    def mark_failure(self, reason: str):
        with self.lock:
            self._last_failure_ns = time.time_ns()
            self._last_failure_reason = reason

    def mark_open_attempt(self):
        with self.lock:
            self._last_open_attempt_ns = time.time_ns()

    def mark_open_success(self):
        with self.lock:
            now_ns = time.time_ns()
            self._last_open_success_ns = now_ns
            self._last_failure_ns = 0
            self._last_failure_reason = ""

    def mark_frame_ok(self, frame_ts_ns: int):
        with self.lock:
            self._last_frame_ok_ns = frame_ts_ns
            self._last_failure_ns = 0
            self._last_failure_reason = ""

    def get_health_snapshot(self):
        with self.lock:
            return {
                "created_ns": self._created_ns,
                "last_frame_ok_ns": self._last_frame_ok_ns,
                "last_open_attempt_ns": self._last_open_attempt_ns,
                "last_open_success_ns": self._last_open_success_ns,
                "last_failure_ns": self._last_failure_ns,
                "last_failure_reason": self._last_failure_reason,
            }

    def is_reconnect_stalled(self, fail_after_seconds: int):
        if fail_after_seconds <= 0:
            return False

        snapshot = self.get_health_snapshot()
        threshold_ns = int(fail_after_seconds * 1_000_000_000)
        now_ns = time.time_ns()
        last_ok_ns = snapshot["last_frame_ok_ns"] or snapshot["last_open_success_ns"] or snapshot["created_ns"]
        is_stale = (now_ns - last_ok_ns) >= threshold_ns
        has_failure_after_ok = snapshot["last_failure_ns"] >= last_ok_ns
        return is_stale and has_failure_after_ok

    def is_stream_stale(self, stale_after_seconds: int):
        if stale_after_seconds <= 0:
            return False

        snapshot = self.get_health_snapshot()
        threshold_ns = int(stale_after_seconds * 1_000_000_000)
        now_ns = time.time_ns()
        last_ok_ns = snapshot["last_frame_ok_ns"] or snapshot["last_open_success_ns"] or snapshot["created_ns"]
        return (now_ns - last_ok_ns) >= threshold_ns

    def _run(self):
        if cv2 is None:
            logger.error("OpenCV not available. Collision clip buffering is disabled.")
            return

        capture = None

        while not self.stop_event.is_set():
            if capture is None or not capture.isOpened():
                self.mark_open_attempt()
                capture = _open_capture(self.rtsp_url)
                if capture is None or not capture.isOpened():
                    self.mark_failure("Unable to open camera stream")
                    logger.warning("Unable to open stream for camera %s", self.camera_id)
                    time.sleep(0.3)
                    continue
                self._read_failures = 0
                self.mark_open_success()

            loop_now_ns = time.time_ns()
            live_active = self.has_live_subscribers()

            drain_grabs = self._drain_grabs
            # Keep the stream close to realtime by catching up only when loop cadence falls behind.
            if self._last_capture_ns > 0 and self._live_encode_interval_ns > 0:
                elapsed_ns = loop_now_ns - self._last_capture_ns
                if elapsed_ns > self._live_encode_interval_ns:
                    behind = int(elapsed_ns // self._live_encode_interval_ns) - 1
                    if behind > 0:
                        drain_grabs = max(drain_grabs, min(behind, self._max_catchup_grabs))

            if not live_active:
                # When no live viewers are connected, still drain a little so the next viewer doesn't start stale.
                drain_grabs = max(drain_grabs, 1)

            # Grab first to avoid decoding stale queued frames, then optionally drain more grabs.
            if not capture.grab():
                self.mark_failure("Failed to grab frame from camera stream")
                self._read_failures += 1
                if self._read_failures >= self._max_read_failures:
                    if capture is not None:
                        capture.release()
                        capture = None
                    self._read_failures = 0
                    time.sleep(0.05)
                else:
                    time.sleep(0.005)
                continue

            if drain_grabs > 0:
                for _ in range(drain_grabs):
                    if not capture.grab():
                        break

            ok, frame = capture.retrieve()
            if not ok or frame is None:
                self.mark_failure("Failed to decode frame from camera stream")
                self._read_failures += 1
                if self._read_failures >= self._max_read_failures:
                    if capture is not None:
                        capture.release()
                        capture = None
                    self._read_failures = 0
                    time.sleep(0.05)
                else:
                    time.sleep(0.005)
                continue

            self._read_failures = 0

            now_dt = _utc_now()
            now_ns = time.time_ns()
            self._last_capture_ns = now_ns
            self.mark_frame_ok(now_ns)
            should_store_frame = (
                self._last_buffer_append_ns == 0
                or (now_ns - self._last_buffer_append_ns) >= self._buffer_interval_ns
            )

            jpeg_payload = None
            if live_active:
                if (
                    self._live_encode_interval_ns == 0
                    or self._last_live_encode_ns == 0
                    or (now_ns - self._last_live_encode_ns) >= self._live_encode_interval_ns
                ):
                    frame_for_live = _resize_frame_for_live(frame)
                    ok_jpeg, encoded_jpeg = cv2.imencode(
                        ".jpg",
                        frame_for_live,
                        [int(cv2.IMWRITE_JPEG_QUALITY), LIVE_STREAM_JPEG_QUALITY],
                    )
                    if ok_jpeg:
                        jpeg_payload = encoded_jpeg.tobytes()
                        self._last_live_encode_ns = now_ns

            with self.lock:
                if jpeg_payload is not None:
                    self.latest_jpeg = jpeg_payload
                    self.latest_jpeg_ts = now_ns

                if should_store_frame:
                    frame_copy = frame.copy()
                    self.latest_frame = frame_copy
                    self.latest_frame_ts = now_ns
                    self.buffer.append((now_dt, frame_copy))
                    self._last_buffer_append_ns = now_ns

            if not live_active:
                time.sleep(self._base_sleep_s)

        if capture is not None:
            capture.release()

class VirtualCameraWorker:
    """Accepts externally supplied frames for simulation/webcam streams."""

    def __init__(self, camera_id: str, rtsp_url: str, pre_seconds: int, target_fps: int):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.pre_seconds = pre_seconds
        self.target_fps = target_fps
        self.max_frames = max(pre_seconds * target_fps, 1)
        self.buffer = deque(maxlen=self.max_frames)
        self.latest_frame = None
        self.latest_frame_ts = None
        self.latest_jpeg = None
        self.latest_jpeg_ts = None
        self.latest_inference = None
        self.latest_inference_ts = None
        self._buffer_interval_ns = int(1_000_000_000 / max(target_fps, 1))
        self._last_buffer_append_ns = 0
        self._live_subscribers = 0
        now_ns = time.time_ns()
        self._created_ns = now_ns
        self._last_frame_ok_ns = 0
        self._last_open_attempt_ns = 0
        self._last_open_success_ns = 0
        self._last_failure_ns = 0
        self._last_failure_reason = ""
        self.lock = threading.Lock()

    def start(self):
        return

    def stop(self):
        return

    def push_frame(self, frame, jpeg_payload: Optional[bytes] = None, frame_ts_ns: Optional[int] = None):
        if frame is None:
            return
        now_ns = int(frame_ts_ns) if frame_ts_ns else time.time_ns()
        now_dt = _utc_now()
        should_store_frame = (
            self._last_buffer_append_ns == 0
            or (now_ns - self._last_buffer_append_ns) >= self._buffer_interval_ns
        )

        if jpeg_payload is None and cv2 is not None:
            frame_for_live = _resize_frame_for_live(frame)
            ok_jpeg, encoded_jpeg = cv2.imencode(
                ".jpg",
                frame_for_live,
                [int(cv2.IMWRITE_JPEG_QUALITY), LIVE_STREAM_JPEG_QUALITY],
            )
            if ok_jpeg:
                jpeg_payload = encoded_jpeg.tobytes()

        with self.lock:
            if jpeg_payload is not None:
                self.latest_jpeg = jpeg_payload
                self.latest_jpeg_ts = now_ns

            frame_copy = frame.copy()
            self.latest_frame = frame_copy
            self.latest_frame_ts = now_ns

            if should_store_frame:
                self.buffer.append((now_dt, frame_copy))
                self._last_buffer_append_ns = now_ns

            self._last_frame_ok_ns = now_ns
            self._last_failure_ns = 0
            self._last_failure_reason = ""

    def get_pre_frames(self, event_ts: datetime):
        if self.pre_seconds <= 0:
            return []

        cutoff = event_ts - timedelta(seconds=self.pre_seconds)
        with self.lock:
            frames = [frame.copy() for ts, frame in self.buffer if ts >= cutoff]
        return frames

    def get_latest_frame(self):
        with self.lock:
            if self.latest_frame is None:
                return None
            return self.latest_frame.copy()

    def get_latest_frame_packet(self):
        with self.lock:
            if self.latest_frame is None or self.latest_frame_ts is None:
                return None, None
            return self.latest_frame.copy(), self.latest_frame_ts

    def get_latest_jpeg_packet(self):
        with self.lock:
            if self.latest_jpeg is None or self.latest_jpeg_ts is None:
                return None, None
            return self.latest_jpeg, self.latest_jpeg_ts

    def set_latest_inference(self, inference: Optional[dict], frame_ts_ns: Optional[int] = None):
        with self.lock:
            self.latest_inference = copy.deepcopy(inference) if isinstance(inference, dict) else None
            self.latest_inference_ts = int(frame_ts_ns) if frame_ts_ns else time.time_ns()

    def get_latest_inference_packet(self):
        with self.lock:
            if self.latest_inference is None or self.latest_inference_ts is None:
                return None, None
            return copy.deepcopy(self.latest_inference), self.latest_inference_ts

    def add_live_subscriber(self):
        with self.lock:
            self._live_subscribers += 1

    def remove_live_subscriber(self):
        with self.lock:
            self._live_subscribers = max(self._live_subscribers - 1, 0)

    def has_live_subscribers(self):
        with self.lock:
            return self._live_subscribers > 0

    def mark_failure(self, reason: str):
        with self.lock:
            self._last_failure_ns = time.time_ns()
            self._last_failure_reason = reason

    def mark_open_attempt(self):
        with self.lock:
            self._last_open_attempt_ns = time.time_ns()

    def mark_open_success(self):
        with self.lock:
            now_ns = time.time_ns()
            self._last_open_success_ns = now_ns
            self._last_failure_ns = 0
            self._last_failure_reason = ""

    def mark_frame_ok(self, frame_ts_ns: int):
        with self.lock:
            self._last_frame_ok_ns = frame_ts_ns
            self._last_failure_ns = 0
            self._last_failure_reason = ""

    def get_health_snapshot(self):
        with self.lock:
            return {
                "created_ns": self._created_ns,
                "last_frame_ok_ns": self._last_frame_ok_ns,
                "last_open_attempt_ns": self._last_open_attempt_ns,
                "last_open_success_ns": self._last_open_success_ns,
                "last_failure_ns": self._last_failure_ns,
                "last_failure_reason": self._last_failure_reason,
            }

    def is_reconnect_stalled(self, fail_after_seconds: int):
        return False

    def is_stream_stale(self, stale_after_seconds: int):
        return False

class CollisionClipRecorder:
    """Keeps per-camera pre-event buffers and provides clip snapshots for collisions."""

    def __init__(self):
        self._workers = {}
        self._lock = threading.Lock()

    def ensure_worker(self, camera_id: str, rtsp_url: str):
        if not camera_id or not rtsp_url:
            return None

        if _is_webcam_source(rtsp_url):
            with self._lock:
                worker = self._workers.get(camera_id)
                if worker and worker.rtsp_url == rtsp_url:
                    return worker

                if worker:
                    worker.stop()

                worker = VirtualCameraWorker(
                    camera_id=camera_id,
                    rtsp_url=rtsp_url,
                    pre_seconds=COLLISION_PRE_EVENT_SECONDS,
                    target_fps=COLLISION_CLIP_FPS,
                )
                self._workers[camera_id] = worker
                return worker

        effective_rtsp_url = _prefer_main_stream_rtsp(rtsp_url)

        with self._lock:
            worker = self._workers.get(camera_id)
            if worker and worker.rtsp_url == effective_rtsp_url:
                if worker.is_stream_stale(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
                    worker.stop()
                    worker = None
                else:
                    return worker

            if worker:
                worker.stop()

            worker = CameraPreBufferWorker(
                camera_id=camera_id,
                rtsp_url=effective_rtsp_url,
                pre_seconds=COLLISION_PRE_EVENT_SECONDS,
                target_fps=COLLISION_CLIP_FPS,
            )
            self._workers[camera_id] = worker
            worker.start()
            return worker

    def remove_worker(self, camera_id: str):
        with self._lock:
            worker = self._workers.pop(camera_id, None)
        if worker:
            worker.stop()

    def get_worker(self, camera_id: str):
        with self._lock:
            return self._workers.get(camera_id)

    def stop_all(self):
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
        for worker in workers:
            worker.stop()

clip_recorder = CollisionClipRecorder()

class LiveCollisionDetectionService:
    """Runs collision inference on active camera frames and writes events to DB."""

    def __init__(self):
        project_root = Path(__file__).resolve().parent.parent
        model_path = Path(DETECTION_MODEL_PATH).expanduser()
        if not model_path.is_absolute():
            model_path = (project_root / model_path).resolve()

        self.model_path = model_path
        self.enabled = DETECTION_ENABLED
        self.confidence_threshold = DETECTION_CONFIDENCE_THRESHOLD
        self.cooldown_seconds = DETECTION_COOLDOWN_SECONDS
        self.poll_interval_seconds = DETECTION_POLL_INTERVAL_SECONDS
        self.allowed_class_ids = _parse_csv_int_set(DETECTION_ALLOWED_CLASS_IDS)
        self.allowed_class_names = _parse_csv_str_set(DETECTION_ALLOWED_CLASS_NAMES)
        self.direct_class_names = _parse_csv_str_set(DETECTION_DIRECT_CLASS_NAMES)
        self.description_prefix = DETECTION_DESCRIPTION_PREFIX

        self.db = None
        self._task = None
        self._stop_event = asyncio.Event()
        self._model = None
        self._model_lock = threading.Lock()
        self._last_processed_frame_ts: Dict[str, int] = {}
        self._last_detection_ts: Dict[str, float] = {}
        self._last_error = ""
        self._last_detection = None

        # Collision heuristic state (derived from validated offline test logic).
        self.track_match_iou = 0.30
        self.max_ghost_frames = 15
        self.ghost_box_fraction_limit = 0.25
        self.ghost_margin_px = 80
        self.ghost_id_switch_iou = 0.80
        self.moving_speed_threshold = 5.0
        self.crash_drop_factor = 0.50
        self.safe_pass_factor = 0.70
        self.collision_iou = 0.15
        self.ghost_collision_iou = 0.02
        self.confirmation_frames = 2

        self._camera_histories: Dict[str, Dict[int, dict]] = {}
        self._camera_pair_collision_frames: Dict[str, Dict[Tuple[int, int], int]] = {}
        self._camera_next_track_id: Dict[str, int] = {}
        self._detect_once_sessions: Dict[str, str] = {}
        self._detected_once_sessions: Set[str] = set()

    async def start(self, db):
        self.db = db
        if self._task and not self._task.done():
            return

        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="live-collision-detector")

        if self.enabled:
            logger.info(
                "Live collision detection is enabled (model=%s, conf>=%.2f)",
                self.model_path,
                self.confidence_threshold,
            )
        else:
            logger.info("Live collision detection is disabled. Set DETECTION_ENABLED=1 to activate.")

    async def stop(self):
        if not self._task:
            return

        self._stop_event.set()
        try:
            await asyncio.wait_for(self._task, timeout=5)
        except Exception:
            self._task.cancel()
        finally:
            self._task = None

    def status(self) -> dict:
        running = bool(self._task and not self._task.done())
        task_exception = None
        if self._task and self._task.done():
            try:
                task_exception = self._task.exception()
                if task_exception is not None:
                    task_exception = str(task_exception)
            except Exception:
                task_exception = "Unable to retrieve task exception."

        return {
            "enabled": self.enabled,
            "running": running,
            "task_done": bool(self._task.done()) if self._task else False,
            "task_exception": task_exception,
            "model_path": str(self.model_path),
            "model_exists": self.model_path.exists(),
            "model_loaded": self._model is not None,
            "confidence_threshold": self.confidence_threshold,
            "cooldown_seconds": self.cooldown_seconds,
            "poll_interval_seconds": self.poll_interval_seconds,
            "allowed_class_ids": sorted(self.allowed_class_ids),
            "allowed_class_names": sorted(self.allowed_class_names),
            "direct_class_names": sorted(self.direct_class_names),
            "last_error": self._last_error or None,
            "last_detection": self._last_detection,
        }

    def set_enabled(self, enabled: bool):
        self.enabled = bool(enabled)

    def reset_camera_state(self, camera_id: str):
        camera_key = str(camera_id or "").strip()
        if not camera_key:
            return
        self._camera_histories.pop(camera_key, None)
        self._camera_pair_collision_frames.pop(camera_key, None)
        self._camera_next_track_id.pop(camera_key, None)
        self._last_processed_frame_ts.pop(camera_key, None)
        self._last_detection_ts.pop(camera_key, None)
        self._detect_once_sessions.pop(camera_key, None)
        self._detected_once_sessions = {key for key in self._detected_once_sessions if not key.startswith(f"{camera_key}:")}

    def configure_detect_once_session(self, camera_id: str, session_id: Optional[str], enabled: bool = True):
        camera_key = str(camera_id or "").strip()
        if not camera_key:
            return
        if not enabled or not session_id:
            self._detect_once_sessions.pop(camera_key, None)
            self._detected_once_sessions = {key for key in self._detected_once_sessions if not key.startswith(f"{camera_key}:")}
            return

        session_value = str(session_id).strip()
        if not session_value:
            return
        self._detect_once_sessions[camera_key] = session_value
        self._detected_once_sessions.discard(f"{camera_key}:{session_value}")

    async def test_camera(self, camera_id: str, create_event: bool = True) -> dict:
        if self.db is None:
            raise HTTPException(503, "Detection service is not initialized.")

        camera = await self.db.cameras.find_one({"id": camera_id})
        if not camera:
            raise HTTPException(404, "Camera not found")

        rtsp_url = str(camera.get("rtsp_url") or "").strip()
        if not rtsp_url:
            raise HTTPException(400, "Camera stream URL is missing")

        worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
        if not worker:
            raise HTTPException(503, "Camera stream worker is unavailable")

        frame, frame_ts = worker.get_latest_frame_packet()
        if frame is None or frame_ts is None:
            raise HTTPException(409, "No camera frame available yet. Try again in a few seconds.")

        loop = asyncio.get_running_loop()
        inference = await loop.run_in_executor(None, self._detect_frame_sync, camera_id, frame)
        if not inference.get("detected"):
            return {
                "detected": False,
                "camera_id": camera_id,
                "frame_timestamp": frame_ts,
                "detail": inference.get("error") or "No collision detected on this frame.",
                "candidate_count": int(inference.get("candidate_count", 0)),
                "top_candidates": inference.get("top_candidates") or [],
                "boxes": inference.get("boxes") or [],
            }

        confidence = float(inference["confidence"])
        class_name = inference.get("class_name") or "collision"
        class_id = int(inference.get("class_id", -1))
        created_collision_id = None

        if create_event:
            description = f"{self.description_prefix}: class={class_name}, confidence={confidence:.0%}"
            created = await _create_collision_entry(
                db=self.db,
                camera_id=camera_id,
                confidence_score=confidence,
                severity=None,
                description=description,
                camera_doc=camera,
                detection_metadata={
                    "boxes": inference.get("boxes") or [],
                    "pair_id": inference.get("pair_id") or None,
                    "frame_width": int(frame.shape[1]) if getattr(frame, "shape", None) is not None and len(frame.shape) >= 2 else None,
                    "frame_height": int(frame.shape[0]) if getattr(frame, "shape", None) is not None and len(frame.shape) >= 2 else None,
                    "video_collision_at_second": float(COLLISION_PRE_EVENT_SECONDS),
                },
            )
            created_collision_id = created.get("id")

        return {
            "detected": True,
            "camera_id": camera_id,
            "frame_timestamp": frame_ts,
            "class_id": class_id,
            "class_name": class_name,
            "confidence": confidence,
            "pair_id": inference.get("pair_id") or None,
            "event_created": bool(created_collision_id),
            "collision_id": created_collision_id,
            "candidate_count": int(inference.get("candidate_count", 0)),
            "top_candidates": inference.get("top_candidates") or [],
            "boxes": inference.get("boxes") or [],
        }

    async def _run_loop(self):
        while not self._stop_event.is_set():
            if not self.enabled or self.db is None:
                await asyncio.sleep(1.0)
                continue

            try:
                cameras = await self.db.cameras.find({"status": "active"}).to_list(None)
                for camera in cameras:
                    if self._stop_event.is_set() or not self.enabled:
                        break
                    await self._process_camera(camera)
            except Exception as exc:
                self._last_error = str(exc)
                logger.exception("Live collision detection loop failed")

            await asyncio.sleep(self.poll_interval_seconds)

    async def _process_camera(self, camera: dict):
        camera_id = str(camera.get("id") or "")
        rtsp_url = str(camera.get("rtsp_url") or "").strip()
        if not camera_id or not rtsp_url:
            return

        worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
        if not worker:
            return

        frame, frame_ts = worker.get_latest_frame_packet()
        if frame is None or frame_ts is None:
            return

        if self._last_processed_frame_ts.get(camera_id) == frame_ts:
            return
        self._last_processed_frame_ts[camera_id] = frame_ts

        loop = asyncio.get_running_loop()
        inference = await loop.run_in_executor(None, self._detect_frame_sync, camera_id, frame)
        worker.set_latest_inference(inference, frame_ts)

        if not inference.get("detected"):
            return

        session_key = None
        session_id = self._detect_once_sessions.get(camera_id)
        if not session_id and camera.get("simulation_detect_once") and camera.get("simulation_session_id"):
            session_id = str(camera.get("simulation_session_id"))
            if session_id:
                self._detect_once_sessions[camera_id] = session_id
                self._detected_once_sessions.discard(f"{camera_id}:{session_id}")

        if session_id:
            session_key = f"{camera_id}:{session_id}"
            if session_key in self._detected_once_sessions:
                return

        now_ts = time.time()
        last_detection_ts = self._last_detection_ts.get(camera_id, 0.0)
        if self.cooldown_seconds > 0 and (now_ts - last_detection_ts) < self.cooldown_seconds:
            return

        confidence = float(inference["confidence"])
        class_name = inference.get("class_name") or "collision"
        class_id = int(inference.get("class_id", -1))
        description = f"{self.description_prefix}: class={class_name}, confidence={confidence:.0%}"

        created = await _create_collision_entry(
            db=self.db,
            camera_id=camera_id,
            confidence_score=confidence,
            severity=None,
            description=description,
            camera_doc=camera,
            detection_metadata={
                "boxes": inference.get("boxes") or [],
                "pair_id": inference.get("pair_id") or None,
                "frame_width": int(frame.shape[1]) if getattr(frame, "shape", None) is not None and len(frame.shape) >= 2 else None,
                "frame_height": int(frame.shape[0]) if getattr(frame, "shape", None) is not None and len(frame.shape) >= 2 else None,
                "video_collision_at_second": float(COLLISION_PRE_EVENT_SECONDS),
            },
        )

        if session_key:
            self._detected_once_sessions.add(session_key)

        self._last_detection_ts[camera_id] = now_ts
        self._last_detection = {
            "collision_id": created.get("id"),
            "camera_id": camera_id,
            "class_id": class_id,
            "class_name": class_name,
            "confidence": confidence,
            "pair_id": inference.get("pair_id") or None,
            "timestamp": _utc_now_iso(),
        }
        logger.info(
            "Auto collision detected on camera %s (class=%s, conf=%.2f)",
            camera_id,
            class_name,
            confidence,
        )

    def _get_iou(self, box1: List[float], box2: List[float]) -> float:
        x_left = max(float(box1[0]), float(box2[0]))
        y_top = max(float(box1[1]), float(box2[1]))
        x_right = min(float(box1[2]), float(box2[2]))
        y_bottom = min(float(box1[3]), float(box2[3]))

        if x_right <= x_left or y_bottom <= y_top:
            return 0.0

        intersection = (x_right - x_left) * (y_bottom - y_top)
        area1 = max((float(box1[2]) - float(box1[0])) * (float(box1[3]) - float(box1[1])), 0.0)
        area2 = max((float(box2[2]) - float(box2[0])) * (float(box2[3]) - float(box2[1])), 0.0)
        union = area1 + area2 - intersection
        return float(intersection / union) if union > 0 else 0.0

    def _update_kinematics(
        self,
        camera_history: Dict[int, dict],
        track_id: int,
        center: Tuple[float, float],
        coords: List[float],
        class_id: Optional[int] = None,
        class_name: Optional[str] = None,
        confidence: Optional[float] = None,
    ) -> dict:
        if track_id not in camera_history:
            camera_history[track_id] = {
                "center": center,
                "coords": coords,
                "current_speed": self.moving_speed_threshold,
                "avg_speed": self.moving_speed_threshold,
                "lost_frames": 0,
                "age": 1,
                "class_id": int(class_id) if class_id is not None else -1,
                "class_name": str(class_name) if class_name is not None else "unknown",
                "confidence": float(confidence) if confidence is not None else 0.0,
            }
            return camera_history[track_id]

        prev = camera_history[track_id]
        dist = math.hypot(center[0] - prev["center"][0], center[1] - prev["center"][1])
        avg = (float(prev.get("avg_speed", self.moving_speed_threshold)) * 0.8) + (dist * 0.2)

        next_state = {
            "center": center,
            "coords": coords,
            "current_speed": dist,
            "avg_speed": avg,
            "lost_frames": 0,
            "age": int(prev.get("age", 1)) + 1,
            "class_id": int(prev.get("class_id", -1)),
            "class_name": str(prev.get("class_name", "unknown")),
            "confidence": float(prev.get("confidence", 0.0)),
        }

        if class_id is not None:
            next_state["class_id"] = int(class_id)
        if class_name is not None:
            next_state["class_name"] = str(class_name)
        if confidence is not None:
            next_state["confidence"] = float(confidence)

        camera_history[track_id] = next_state
        return next_state

    def _detect_frame_sync(self, camera_id: str, frame) -> dict:
        model = self._ensure_model_loaded_sync()
        if model is None:
            return {
                "detected": False,
                "error": self._last_error or "YOLO model is unavailable.",
                "boxes": [],
                "pair_id": None,
            }

        try:
            results = model.predict(
                source=frame,
                conf=self.confidence_threshold,
                iou=0.85,
                verbose=False,
            )
        except Exception as exc:
            self._last_error = f"Inference failed: {exc}"
            logger.exception("YOLO inference failed")
            return {"detected": False, "error": self._last_error, "boxes": [], "pair_id": None}

        if frame is None or getattr(frame, "shape", None) is None or len(frame.shape) < 2:
            return {
                "detected": False,
                "error": "Invalid frame for collision analysis.",
                "boxes": [],
                "pair_id": None,
            }

        frame_height = int(frame.shape[0])
        frame_width = int(frame.shape[1])

        all_candidates = []
        detections = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            names_lookup = getattr(result, "names", None) or getattr(model, "names", None) or {}
            if boxes is None:
                continue

            for box in boxes:
                try:
                    confidence = float(box.conf.item()) if hasattr(box.conf, "item") else float(box.conf[0])
                    class_id = int(box.cls.item()) if hasattr(box.cls, "item") else int(box.cls[0])
                except Exception:
                    continue

                if isinstance(names_lookup, dict):
                    class_name = str(names_lookup.get(class_id, class_id))
                elif isinstance(names_lookup, (list, tuple)) and 0 <= class_id < len(names_lookup):
                    class_name = str(names_lookup[class_id])
                else:
                    class_name = str(class_id)

                coords_tensor = getattr(box, "xyxy", None)
                if coords_tensor is None:
                    continue

                try:
                    raw_coords = coords_tensor.tolist() if hasattr(coords_tensor, "tolist") else list(coords_tensor)
                    if raw_coords and isinstance(raw_coords[0], (list, tuple)):
                        coords = [float(v) for v in raw_coords[0]]
                    else:
                        coords = [float(v) for v in raw_coords]
                except Exception:
                    continue

                if len(coords) != 4:
                    continue

                all_candidates.append(
                    {
                        "class_id": class_id,
                        "class_name": class_name,
                        "confidence": confidence,
                    }
                )

                if self.allowed_class_ids and class_id not in self.allowed_class_ids:
                    continue
                if self.allowed_class_names and class_name.strip().lower() not in self.allowed_class_names:
                    continue

                detections.append(
                    {
                        "coords": coords,
                        "class_id": class_id,
                        "class_name": class_name,
                        "confidence": confidence,
                    }
                )

        top_candidates = sorted(all_candidates, key=lambda item: item["confidence"], reverse=True)[:5]
        direct_hits = []
        if self.direct_class_names:
            for det in detections:
                class_name = str(det.get("class_name", "")).strip().lower()
                if class_name in self.direct_class_names:
                    direct_hits.append(det)

        if direct_hits:
            best = max(direct_hits, key=lambda item: float(item.get("confidence", 0.0)))
            overlay_boxes = []
            for det in detections:
                coords = det.get("coords")
                if not isinstance(coords, (list, tuple)) or len(coords) != 4:
                    continue
                overlay_boxes.append(
                    {
                        "coords": [float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])],
                        "class_id": int(det.get("class_id", -1)),
                        "class_name": str(det.get("class_name", "unknown")),
                        "confidence": float(det.get("confidence", 0.0)),
                        "track_id": None,
                        "is_ghost": False,
                    }
                )
            self._last_error = ""
            return {
                "detected": True,
                "confidence": float(best.get("confidence", 0.0)),
                "class_id": int(best.get("class_id", -1)),
                "class_name": str(best.get("class_name", "collision")),
                "pair_id": None,
                "candidate_count": len(detections),
                "top_candidates": top_candidates,
                "boxes": overlay_boxes,
            }

        camera_history = self._camera_histories.setdefault(camera_id, {})
        pair_collision_frames = self._camera_pair_collision_frames.setdefault(camera_id, {})
        next_track_id = int(self._camera_next_track_id.get(camera_id, 1))

        vehicles = []
        seen_ids: Set[int] = set()

        unmatched_det_indices = set(range(len(detections)))
        unmatched_track_ids = set(camera_history.keys())
        match_candidates: List[Tuple[float, int, int]] = []

        for det_index, det in enumerate(detections):
            for track_id, track_state in camera_history.items():
                if int(track_state.get("lost_frames", 0)) > self.max_ghost_frames:
                    continue
                previous_coords = track_state.get("coords")
                if not previous_coords or len(previous_coords) != 4:
                    continue
                iou = self._get_iou(det["coords"], previous_coords)
                if iou >= self.track_match_iou:
                    match_candidates.append((iou, det_index, track_id))

        for _, det_index, track_id in sorted(match_candidates, key=lambda item: item[0], reverse=True):
            if det_index not in unmatched_det_indices or track_id not in unmatched_track_ids:
                continue

            det = detections[det_index]
            cx = (det["coords"][0] + det["coords"][2]) / 2.0
            cy = (det["coords"][1] + det["coords"][3]) / 2.0
            kinematics = self._update_kinematics(
                camera_history=camera_history,
                track_id=track_id,
                center=(cx, cy),
                coords=det["coords"],
                class_id=det["class_id"],
                class_name=det["class_name"],
                confidence=det["confidence"],
            )
            vehicles.append(
                {
                    "id": track_id,
                    "coords": det["coords"],
                    "kinematics": kinematics,
                    "confidence": float(det["confidence"]),
                    "class_id": int(det["class_id"]),
                    "class_name": str(det["class_name"]),
                    "is_ghost": False,
                }
            )
            seen_ids.add(track_id)
            unmatched_det_indices.remove(det_index)
            unmatched_track_ids.remove(track_id)

        for det_index in sorted(unmatched_det_indices):
            det = detections[det_index]
            track_id = next_track_id
            next_track_id += 1

            cx = (det["coords"][0] + det["coords"][2]) / 2.0
            cy = (det["coords"][1] + det["coords"][3]) / 2.0
            kinematics = self._update_kinematics(
                camera_history=camera_history,
                track_id=track_id,
                center=(cx, cy),
                coords=det["coords"],
                class_id=det["class_id"],
                class_name=det["class_name"],
                confidence=det["confidence"],
            )
            vehicles.append(
                {
                    "id": track_id,
                    "coords": det["coords"],
                    "kinematics": kinematics,
                    "confidence": float(det["confidence"]),
                    "class_id": int(det["class_id"]),
                    "class_name": str(det["class_name"]),
                    "is_ghost": False,
                }
            )
            seen_ids.add(track_id)

        self._camera_next_track_id[camera_id] = next_track_id

        for track_id in sorted(unmatched_track_ids):
            if track_id not in camera_history:
                continue

            data = camera_history[track_id]
            data["lost_frames"] = int(data.get("lost_frames", 0)) + 1

            if data["lost_frames"] > self.max_ghost_frames:
                camera_history.pop(track_id, None)
                for pair_key in list(pair_collision_frames.keys()):
                    if track_id in pair_key:
                        pair_collision_frames.pop(pair_key, None)
                continue

            ghost_coords = data.get("coords")
            if not ghost_coords or len(ghost_coords) != 4:
                continue

            x1, y1, x2, y2 = [float(v) for v in ghost_coords]
            box_width = x2 - x1
            box_height = y2 - y1

            if box_width > (frame_width * self.ghost_box_fraction_limit) or box_height > (frame_height * self.ghost_box_fraction_limit):
                continue

            margin = self.ghost_margin_px
            if x1 < margin or y1 < margin or x2 > (frame_width - margin) or y2 > (frame_height - margin):
                continue

            is_id_switch = False
            for active_vehicle in vehicles:
                if self._get_iou([x1, y1, x2, y2], active_vehicle["coords"]) > self.ghost_id_switch_iou:
                    is_id_switch = True
                    break
            if is_id_switch:
                continue

            data["current_speed"] = 0.0
            vehicles.append(
                {
                    "id": track_id,
                    "coords": [x1, y1, x2, y2],
                    "kinematics": data,
                    "confidence": float(data.get("confidence", 0.0)),
                    "class_id": int(data.get("class_id", -1)),
                    "class_name": str(data.get("class_name", "unknown")),
                    "is_ghost": True,
                }
            )

        detected_pair = None
        detected_confidence = 0.0

        for i in range(len(vehicles)):
            for j in range(i + 1, len(vehicles)):
                car_a = vehicles[i]
                car_b = vehicles[j]

                pair_id = tuple(sorted([int(car_a["id"]), int(car_b["id"])]))
                overlap_iou = self._get_iou(car_a["coords"], car_b["coords"])

                kinematics_a = car_a["kinematics"]
                kinematics_b = car_b["kinematics"]

                avg_speed_a = float(kinematics_a.get("avg_speed", 0.0))
                avg_speed_b = float(kinematics_b.get("avg_speed", 0.0))
                current_speed_a = float(kinematics_a.get("current_speed", 0.0))
                current_speed_b = float(kinematics_b.get("current_speed", 0.0))

                car_a_is_ghost = current_speed_a == 0.0 and avg_speed_a > self.moving_speed_threshold
                car_b_is_ghost = current_speed_b == 0.0 and avg_speed_b > self.moving_speed_threshold

                car_a_parked = avg_speed_a < self.moving_speed_threshold
                car_b_parked = avg_speed_b < self.moving_speed_threshold

                if (car_a_is_ghost and car_b_parked) or (car_b_is_ghost and car_a_parked):
                    overlap_iou = 0.0

                car_a_crash = avg_speed_a > self.moving_speed_threshold and current_speed_a < (avg_speed_a * self.crash_drop_factor)
                car_b_crash = avg_speed_b > self.moving_speed_threshold and current_speed_b < (avg_speed_b * self.crash_drop_factor)

                car_a_safe = avg_speed_a > self.moving_speed_threshold and current_speed_a > (avg_speed_a * self.safe_pass_factor)
                car_b_safe = avg_speed_b > self.moving_speed_threshold and current_speed_b > (avg_speed_b * self.safe_pass_factor)

                is_safe_pass = car_a_safe or car_b_safe
                if (car_a_is_ghost and not car_b_parked) or (car_b_is_ghost and not car_a_parked):
                    is_safe_pass = False

                required_iou = self.ghost_collision_iou if (car_a_is_ghost or car_b_is_ghost) else self.collision_iou

                if overlap_iou > required_iou and (car_a_crash or car_b_crash) and not is_safe_pass:
                    pair_collision_frames[pair_id] = pair_collision_frames.get(pair_id, 0) + 1
                else:
                    pair_collision_frames[pair_id] = 0

                if pair_collision_frames.get(pair_id, 0) > self.confirmation_frames:
                    pair_confidence = max(
                        float(car_a.get("confidence", 0.0)),
                        float(car_b.get("confidence", 0.0)),
                        float(overlap_iou),
                    )
                    if detected_pair is None or pair_confidence > detected_confidence:
                        detected_pair = pair_id
                        detected_confidence = pair_confidence

        overlay_boxes = []
        for vehicle in vehicles:
            coords = vehicle.get("coords")
            if not isinstance(coords, (list, tuple)) or len(coords) != 4:
                continue
            overlay_boxes.append(
                {
                    "coords": [float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])],
                    "class_id": int(vehicle.get("class_id", -1)),
                    "class_name": str(vehicle.get("class_name", "unknown")),
                    "confidence": float(vehicle.get("confidence", 0.0)),
                    "track_id": int(vehicle.get("id")) if vehicle.get("id") is not None else None,
                    "is_ghost": bool(vehicle.get("is_ghost")),
                }
            )

        if detected_pair is not None:
            self._last_error = ""
            return {
                "detected": True,
                "confidence": detected_confidence,
                "class_id": -1,
                "class_name": "collision-heuristic",
                "pair_id": [int(detected_pair[0]), int(detected_pair[1])],
                "candidate_count": len(detections),
                "top_candidates": top_candidates,
                "boxes": overlay_boxes,
            }

        return {
            "detected": False,
            "error": "No collision detected by heuristic on current frame.",
            "candidate_count": len(detections),
            "top_candidates": top_candidates,
            "boxes": overlay_boxes,
            "pair_id": None,
        }

    def _ensure_model_loaded_sync(self):
        if self._model is not None:
            return self._model

        if YOLO is None:
            import_error_detail = f" Import error: {ULTRALYTICS_IMPORT_ERROR}" if ULTRALYTICS_IMPORT_ERROR else ""
            self._last_error = (
                "ultralytics is not available in the current Python environment. "
                "Install backend requirements and restart the API."
                f"{import_error_detail}"
            )
            return None

        if not self.model_path.exists():
            self._last_error = f"Model file not found: {self.model_path}"
            return None

        with self._model_lock:
            if self._model is not None:
                return self._model
            try:
                self._model = YOLO(str(self.model_path))
                self._last_error = ""
                logger.info("Loaded YOLO model from %s", self.model_path)
            except Exception as exc:
                self._last_error = f"Failed to load model: {exc}"
                logger.exception("Unable to load YOLO model")
                return None
        return self._model

detection_service = LiveCollisionDetectionService()

# ΓöÇΓöÇ App ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
app = FastAPI(title="SafeSight API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ΓöÇΓöÇ DB lifecycle ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
@app.on_event("startup")
async def startup():
    app.client = AsyncIOMotorClient(MONGO_URL)
    app.db     = app.client[DB_NAME]
    app.fs_bucket = AsyncIOMotorGridFSBucket(app.db)
    logger.info(f"Connected to MongoDB: {DB_NAME}")
    await ensure_default_captain(app.db)
    await _ensure_collision_reference_data(app.db)

    if PREBUFFER_ACTIVE_CAMERAS_ON_STARTUP:
        cameras = await app.db.cameras.find({"status": "active"}).to_list(None)
        for camera in cameras:
            clip_recorder.ensure_worker(camera.get("id", ""), camera.get("rtsp_url", ""))

    await detection_service.start(app.db)

@app.on_event("shutdown")
async def shutdown():
    await detection_service.stop()
    clip_recorder.stop_all()
    app.client.close()

def get_db():
    return app.db

# ΓöÇΓöÇ Security ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2  = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def hash_pw(pw: str) -> str:              return pwd_ctx.hash(pw)
def verify_pw(plain: str, hashed: str):   return pwd_ctx.verify(plain, hashed)

def make_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXP)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def _get_user_from_access_token(token: str, db):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        subject = payload.get("sub")
        if not subject:
            raise ValueError
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # New tokens store user id in sub; fallback to username for legacy tokens.
    user = await db.users.find_one({"id": subject})
    if not user:
        user = await db.users.find_one({"username": subject})

    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

def _parse_bearer_token(auth_header: Optional[str]) -> Optional[str]:
    if not auth_header:
        return None

    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        return token or None

    return None

async def _get_current_user_from_header_or_query(request: Request, db, token_query: Optional[str] = None):
    token = _parse_bearer_token(request.headers.get("Authorization"))
    if not token and token_query:
        token = token_query.strip()

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return await _get_user_from_access_token(token, db)

async def get_current_user(token: str = Depends(oauth2), db=Depends(get_db)):
    return await _get_user_from_access_token(token, db)

def captain_only(user=Depends(get_current_user)):
    if user["role"] != "captain":
        raise HTTPException(status_code=403, detail="Captain access required")
    return user

# ΓöÇΓöÇ Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
def clean(doc: dict) -> dict:
    """Remove MongoDB _id and return serialisable dict."""
    doc.pop("_id", None)
    doc.pop("hashed_password", None)
    return doc

async def _ensure_reference_collection(collection, items: List[dict]) -> None:
    for item in items:
        await collection.update_one({"id": item["id"]}, {"$set": item}, upsert=True)

async def _ensure_collision_reference_data(db) -> None:
    await _ensure_reference_collection(db.collision_statuses, COLLISION_STATUS_REFERENCE)
    await _ensure_reference_collection(db.collision_severities, COLLISION_SEVERITY_REFERENCE)
    await _ensure_reference_collection(db.collision_types, COLLISION_TYPE_REFERENCE)

def _sign_public_video_token(video_file_id: str, expires_at: int) -> str:
    message = f"{video_file_id}:{int(expires_at)}".encode("utf-8")
    digest = hmac.new(PUBLIC_VIDEO_TOKEN_SECRET.encode("utf-8"), message, "sha256").digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

def _issue_public_video_token(video_file_id: str) -> Tuple[str, int]:
    expires_at = int(time.time()) + PUBLIC_VIDEO_TOKEN_TTL_SECONDS
    signature = _sign_public_video_token(video_file_id, expires_at)
    return signature, expires_at

def _verify_public_video_token(video_file_id: str, expires_at: int, signature: str) -> bool:
    if not video_file_id or not signature:
        return False
    if int(expires_at) < int(time.time()):
        return False

    expected = _sign_public_video_token(video_file_id, int(expires_at))
    return hmac.compare_digest(expected, str(signature).strip())

def _make_public_clip_url(collision_id: str, video_file_id: Optional[str]) -> Optional[str]:
    file_id = str(video_file_id or "").strip()
    collision_value = str(collision_id or "").strip()
    if not file_id or not collision_value:
        return None

    signature, expires_at = _issue_public_video_token(file_id)
    query = urlencode({"file_id": file_id, "exp": str(expires_at), "sig": signature})
    return f"{PUBLIC_BASE_URL}/api/public/clips/{collision_value}?{query}"

def _resolve_user_display(user_doc: Optional[dict]) -> str:
    if not isinstance(user_doc, dict):
        return "Unknown user"
    return user_doc.get("full_name") or user_doc.get("username") or "Unknown user"

def _get_latest_status_event(events: List[dict], status_id: str) -> Optional[dict]:
    if not events:
        return None
    best_event = None
    best_ts = None
    for event in events:
        if event.get("status_id") != status_id:
            continue
        raw_ts = event.get("changed_at")
        parsed_ts = _parse_iso_datetime(raw_ts) if raw_ts else None
        if parsed_ts is None:
            if best_event is None:
                best_event = event
            continue
        if best_ts is None or parsed_ts > best_ts:
            best_event = event
            best_ts = parsed_ts
    return best_event

def _format_detection_boxes_for_payload(box_docs: Optional[List[dict]]) -> List[dict]:
    if not box_docs:
        return []
    payload_boxes = []
    for box in box_docs:
        payload_boxes.append({
            "coords": [
                float(box.get("x1") or 0.0),
                float(box.get("y1") or 0.0),
                float(box.get("x2") or 0.0),
                float(box.get("y2") or 0.0),
            ],
            "class_id": box.get("class_id", -1),
            "class_name": box.get("class_name") or "object",
            "confidence": float(box.get("confidence") or 0.0),
            "track_id": box.get("track_id"),
            "is_ghost": bool(box.get("is_ghost")),
        })
    return payload_boxes

def _build_collision_payload(
    collision: dict,
    camera: Optional[dict] = None,
    video: Optional[dict] = None,
    detection: Optional[dict] = None,
    box_docs: Optional[List[dict]] = None,
    status_events: Optional[List[dict]] = None,
    user_map: Optional[dict] = None,
    sms_summary: Optional[dict] = None,
) -> dict:
    camera_name = (camera or {}).get("name") or collision.get("camera_name") or "Unknown"
    camera_location = (camera or {}).get("location") or collision.get("camera_location") or "Unknown"
    timestamp_value = collision.get("occurred_at") or collision.get("timestamp")

    status_id = collision.get("status_id") or collision.get("status") or "pending"
    severity_id = collision.get("severity_id") or collision.get("severity")
    type_id = collision.get("type_id") or collision.get("collision_type")

    video_payload = video or {}
    detection_payload = detection or {}
    events = status_events or []

    def resolve_actor(event: Optional[dict]) -> Optional[str]:
        if not event:
            return None
        actor_id = event.get("actor_user_id")
        if actor_id and isinstance(user_map, dict) and actor_id in user_map:
            return _resolve_user_display(user_map.get(actor_id))
        return event.get("actor_name") or None

    ack_event = _get_latest_status_event(events, "acknowledged")
    responded_event = _get_latest_status_event(events, "responded")
    resolved_event = _get_latest_status_event(events, "resolved")

    sms_summary = sms_summary or {}
    sms_total = int(sms_summary.get("total_recipients") or sms_summary.get("total") or 0)
    sms_sent = int(sms_summary.get("sent") or 0)
    sms_failed = int(sms_summary.get("failed") or 0)
    if sms_total <= 0:
        sms_status = "pending"
    elif sms_failed > 0:
        sms_status = "failed"
    elif sms_sent >= sms_total:
        sms_status = "sent"
    else:
        sms_status = "pending"

    payload = {
        "id": collision.get("id"),
        "camera_id": collision.get("camera_id"),
        "camera_name": camera_name,
        "camera_location": camera_location,
        "confidence_score": collision.get("confidence_score"),
        "severity": severity_id,
        "collision_type": type_id,
        "description": collision.get("description"),
        "status": status_id,
        "timestamp": timestamp_value,
        "acknowledged_by": resolve_actor(ack_event),
        "acknowledged_at": ack_event.get("changed_at") if ack_event else None,
        "responded_by": resolve_actor(responded_event),
        "responded_at": responded_event.get("changed_at") if responded_event else None,
        "resolved_by": resolve_actor(resolved_event),
        "resolved_at": resolved_event.get("changed_at") if resolved_event else None,
        "video_status": video_payload.get("video_status") or "missing",
        "video_file_id": video_payload.get("video_file_id"),
        "video_filename": video_payload.get("video_filename"),
        "video_mime_type": video_payload.get("video_mime_type"),
        "video_duration_seconds": video_payload.get("video_duration_seconds"),
        "video_pre_event_seconds": video_payload.get("video_pre_event_seconds"),
        "video_post_event_seconds": video_payload.get("video_post_event_seconds"),
        "video_collision_at_second": video_payload.get("video_collision_at_second"),
        "video_recorded_at": video_payload.get("video_recorded_at"),
        "video_codec": video_payload.get("video_codec"),
        "video_error": video_payload.get("video_error"),
        "detection_boxes": _format_detection_boxes_for_payload(box_docs),
        "detection_pair_id": detection_payload.get("detection_pair_id"),
        "detection_frame_width": detection_payload.get("detection_frame_width"),
        "detection_frame_height": detection_payload.get("detection_frame_height"),
        "sms_total_recipients": sms_total,
        "sms_sent": sms_sent,
        "sms_failed": sms_failed,
        "sms_status": sms_status,
    }

    payload["video_public_url"] = _make_public_clip_url(
        payload.get("id"),
        payload.get("video_file_id"),
    )
    return payload

async def _hydrate_collision_payloads(db, collisions: List[dict]) -> List[dict]:
    if not collisions:
        return []

    collision_ids = [collision.get("id") for collision in collisions if collision.get("id")]
    camera_ids = list({collision.get("camera_id") for collision in collisions if collision.get("camera_id")})

    camera_docs = await db.cameras.find({"id": {"$in": camera_ids}}).to_list(None) if camera_ids else []
    camera_map = {camera.get("id"): camera for camera in camera_docs}

    video_docs = await db.collision_videos.find({"collision_id": {"$in": collision_ids}}).to_list(None)
    video_map = {video.get("collision_id"): video for video in video_docs}

    detection_docs = await db.collision_detections.find({"collision_id": {"$in": collision_ids}}).to_list(None)
    detection_map = {detection.get("collision_id"): detection for detection in detection_docs}
    detection_ids = [doc.get("id") for doc in detection_docs if doc.get("id")]

    box_docs = await db.collision_detection_boxes.find({"detection_id": {"$in": detection_ids}}).to_list(None) if detection_ids else []
    boxes_by_detection = {}
    for box in box_docs:
        detection_id = box.get("detection_id")
        if not detection_id:
            continue
        boxes_by_detection.setdefault(detection_id, []).append(box)

    status_events = await db.collision_status_events.find({"collision_id": {"$in": collision_ids}}).to_list(None)
    events_by_collision = {}
    user_ids = set()
    for event in status_events:
        collision_id = event.get("collision_id")
        if not collision_id:
            continue
        events_by_collision.setdefault(collision_id, []).append(event)
        actor_id = event.get("actor_user_id")
        if actor_id:
            user_ids.add(actor_id)

    users = await db.users.find({"id": {"$in": list(user_ids)}}).to_list(None) if user_ids else []
    user_map = {user.get("id"): user for user in users}

    alert_docs = await db.alerts.find({
        "collision_id": {"$in": collision_ids},
        "is_test": {"$ne": True},
    }).to_list(None)
    sms_summary_by_collision = {}
    for alert in alert_docs:
        collision_id = alert.get("collision_id")
        if not collision_id:
            continue
        summary = sms_summary_by_collision.setdefault(
            collision_id,
            {"total_recipients": 0, "sent": 0, "failed": 0},
        )
        summary["total_recipients"] += 1
        if str(alert.get("status") or "").lower() == "sent":
            summary["sent"] += 1
        else:
            summary["failed"] += 1

    payloads = []
    for collision in collisions:
        collision_id = collision.get("id")
        detection = detection_map.get(collision_id)
        detection_id = detection.get("id") if detection else None
        payloads.append(
            _build_collision_payload(
                collision=collision,
                camera=camera_map.get(collision.get("camera_id")),
                video=video_map.get(collision_id),
                detection=detection,
                box_docs=boxes_by_detection.get(detection_id, []),
                status_events=events_by_collision.get(collision_id, []),
                user_map=user_map,
                sms_summary=sms_summary_by_collision.get(collision_id),
            )
        )

    return payloads

def _serialize_collision(collision: dict) -> dict:
    payload = clean(dict(collision))
    payload["video_public_url"] = _make_public_clip_url(
        payload.get("id"),
        payload.get("video_file_id"),
    )
    return payload

async def _load_collision_video_bytes(collision: dict, video: dict) -> Tuple[bytes, str, str]:
    if video.get("video_status") == "processing":
        raise HTTPException(409, "Collision clip is still being generated.")

    video_file_id = video.get("video_file_id")
    if not video_file_id:
        raise HTTPException(404, "No video clip available for this collision.")

    try:
        object_id = ObjectId(video_file_id)
    except (InvalidId, TypeError):
        raise HTTPException(500, "Stored collision video reference is invalid.")

    try:
        grid_out = await app.fs_bucket.open_download_stream(object_id)
        video_bytes = await grid_out.read()
    except Exception:
        raise HTTPException(404, "Collision clip file was not found in storage.")

    # Backward compatibility for older clips that were encoded as mp4v/FMP4.
    stored_codec = str(video.get("video_codec") or "").strip().lower()
    probed_codec = _probe_mp4_codec_hint(video_bytes)
    timestamp_raw = str(collision.get("occurred_at") or collision.get("timestamp") or "").strip()
    has_timezone = bool(re.search(r"(Z|[+\-]\d{2}:\d{2})$", timestamp_raw))
    needs_transcode = (
        stored_codec != "h264"
        or not has_timezone
        or (stored_codec == "h264" and probed_codec and probed_codec != "h264")
    )

    if needs_transcode:
        loop = asyncio.get_running_loop()
        transcoded_bytes = await loop.run_in_executor(None, _transcode_mp4_bytes_to_h264, video_bytes)
        if transcoded_bytes:
            video_bytes = transcoded_bytes

    media_type = video.get("video_mime_type", "video/mp4")
    filename = video.get("video_filename") or f"collision_{collision.get('id', 'clip')}.mp4"
    return video_bytes, media_type, filename

def _format_alert_timestamp(ts: str) -> str:
    parsed = _parse_iso_datetime(ts)
    if parsed is None:
        parsed = _utc_now()
    localized = parsed.astimezone()
    hour = localized.strftime("%I").lstrip("0") or "12"
    return f"{localized.strftime('%B')} {localized.day}, {localized.year}, {hour}:{localized.strftime('%M')}{localized.strftime('%p')}"

def _build_collision_alert_message(collision: dict, include_replay_link: bool = True) -> str:
    timestamp_value = collision.get("timestamp") or collision.get("occurred_at") or ""
    message = (
        "COLLISION ALERT: A collision incident was detected at "
        f"{collision.get('camera_name', 'Unknown camera')} "
        f"({collision.get('camera_location', 'Unknown location')}) on "
        f"{_format_alert_timestamp(timestamp_value)}. "
        "Please review the clip and respond accordingly."
    )
    if include_replay_link:
        public_url = collision.get("video_public_url") or _make_public_clip_url(
            collision.get("id"),
            collision.get("video_file_id"),
        )
        if public_url:
            message = f"{message}. Replay: {public_url}"

    return message

def _normalize_detection_boxes(raw_boxes: Optional[List[dict]]) -> List[dict]:
    normalized = []
    if not isinstance(raw_boxes, list):
        return normalized

    for raw_box in raw_boxes[:LIVE_OVERLAY_MAX_BOXES]:
        if not isinstance(raw_box, dict):
            continue

        coords = raw_box.get("coords")
        if not isinstance(coords, (list, tuple)) or len(coords) != 4:
            continue

        try:
            x1, y1, x2, y2 = [float(value) for value in coords]
        except Exception:
            continue

        if not all(math.isfinite(value) for value in (x1, y1, x2, y2)):
            continue
        if x2 <= x1 or y2 <= y1:
            continue

        class_id = -1
        try:
            if raw_box.get("class_id") is not None:
                class_id = int(raw_box.get("class_id"))
        except Exception:
            class_id = -1

        confidence_value = 0.0
        try:
            confidence_value = float(raw_box.get("confidence") or 0.0)
        except Exception:
            confidence_value = 0.0
        if not math.isfinite(confidence_value):
            confidence_value = 0.0

        normalized_box = {
            "coords": [x1, y1, x2, y2],
            "class_id": class_id,
            "class_name": str(raw_box.get("class_name") or "object"),
            "confidence": confidence_value,
            "track_id": None,
            "is_ghost": bool(raw_box.get("is_ghost")),
        }

        try:
            if raw_box.get("track_id") is not None:
                normalized_box["track_id"] = int(raw_box.get("track_id"))
        except Exception:
            normalized_box["track_id"] = None

        normalized.append(normalized_box)

    return normalized

def _extract_detection_frame_size(detection_metadata: Optional[dict]) -> Tuple[Optional[int], Optional[int]]:
    if not isinstance(detection_metadata, dict):
        return None, None

    frame_width_raw = detection_metadata.get("detection_frame_width")
    if frame_width_raw is None:
        frame_width_raw = detection_metadata.get("frame_width")

    frame_height_raw = detection_metadata.get("detection_frame_height")
    if frame_height_raw is None:
        frame_height_raw = detection_metadata.get("frame_height")

    frame_width_value = None
    frame_height_value = None
    try:
        frame_width_candidate = int(frame_width_raw) if frame_width_raw is not None else None
        if frame_width_candidate and frame_width_candidate > 0:
            frame_width_value = frame_width_candidate
    except Exception:
        frame_width_value = None

    try:
        frame_height_candidate = int(frame_height_raw) if frame_height_raw is not None else None
        if frame_height_candidate and frame_height_candidate > 0:
            frame_height_value = frame_height_candidate
    except Exception:
        frame_height_value = None

    return frame_width_value, frame_height_value

def _extract_collision_second(detection_metadata: Optional[dict]) -> Optional[float]:
    if not isinstance(detection_metadata, dict):
        return None

    collision_second_raw = detection_metadata.get("video_collision_at_second")
    if collision_second_raw is None:
        collision_second_raw = detection_metadata.get("collision_at_second")
    if collision_second_raw is None:
        collision_second_raw = detection_metadata.get("detected_at_second")

    if collision_second_raw is None:
        return None

    try:
        collision_second = float(collision_second_raw)
    except Exception:
        return None

    if math.isfinite(collision_second):
        return max(collision_second, 0.0)
    return None

def _build_collision_detection_docs(collision_id: str, detection_metadata: Optional[dict]) -> Tuple[Optional[dict], List[dict]]:
    if not isinstance(detection_metadata, dict):
        return None, []

    boxes = _normalize_detection_boxes(
        detection_metadata.get("detection_boxes")
        if "detection_boxes" in detection_metadata
        else detection_metadata.get("boxes")
    )

    frame_width_value, frame_height_value = _extract_detection_frame_size(detection_metadata)

    detection_id = str(uuid.uuid4())
    detection_doc = {
        "id": detection_id,
        "collision_id": collision_id,
        "detection_pair_id": detection_metadata.get("pair_id") or detection_metadata.get("detection_pair_id"),
        "detection_frame_width": frame_width_value,
        "detection_frame_height": frame_height_value,
    }

    box_docs = []
    for box in boxes:
        coords = box.get("coords") or []
        if len(coords) != 4:
            continue
        x1, y1, x2, y2 = coords
        box_docs.append({
            "id": str(uuid.uuid4()),
            "detection_id": detection_id,
            "class_id": box.get("class_id", -1),
            "class_name": box.get("class_name") or "object",
            "confidence": float(box.get("confidence") or 0.0),
            "track_id": box.get("track_id"),
            "is_ghost": bool(box.get("is_ghost")),
            "x1": float(x1),
            "y1": float(y1),
            "x2": float(x2),
            "y2": float(y2),
        })

    return detection_doc, box_docs

def _apply_collision_detection_metadata(doc: dict, detection_metadata: Optional[dict]) -> None:
    if not isinstance(doc, dict) or not isinstance(detection_metadata, dict):
        return

    boxes = _normalize_detection_boxes(
        detection_metadata.get("detection_boxes")
        if "detection_boxes" in detection_metadata
        else detection_metadata.get("boxes")
    )
    doc["detection_boxes"] = boxes

    frame_width_raw = detection_metadata.get("detection_frame_width")
    if frame_width_raw is None:
        frame_width_raw = detection_metadata.get("frame_width")

    frame_height_raw = detection_metadata.get("detection_frame_height")
    if frame_height_raw is None:
        frame_height_raw = detection_metadata.get("frame_height")

    frame_width_value = None
    frame_height_value = None
    try:
        frame_width_candidate = int(frame_width_raw) if frame_width_raw is not None else None
        if frame_width_candidate and frame_width_candidate > 0:
            frame_width_value = frame_width_candidate
    except Exception:
        frame_width_value = None

    try:
        frame_height_candidate = int(frame_height_raw) if frame_height_raw is not None else None
        if frame_height_candidate and frame_height_candidate > 0:
            frame_height_value = frame_height_candidate
    except Exception:
        frame_height_value = None

    doc["detection_frame_width"] = frame_width_value
    doc["detection_frame_height"] = frame_height_value

    collision_second_raw = detection_metadata.get("video_collision_at_second")
    if collision_second_raw is None:
        collision_second_raw = detection_metadata.get("collision_at_second")

    if collision_second_raw is None:
        return

    try:
        collision_second = float(collision_second_raw)
    except Exception:
        return

    if math.isfinite(collision_second):
        doc["video_collision_at_second"] = max(collision_second, 0.0)

def _extract_provider_error(provider_body: Optional[dict], status_code: int, provider_fail_reason: Optional[str]) -> str:
    if provider_fail_reason:
        return str(provider_fail_reason)

    if isinstance(provider_body, dict):
        provider_errors = provider_body.get("errors")
        if provider_errors is not None:
            if isinstance(provider_errors, str):
                cleaned = provider_errors.strip()
                if cleaned:
                    return cleaned
            try:
                return json.dumps(provider_errors, ensure_ascii=False)[:240]
            except Exception:
                return str(provider_errors)[:240]

    return f"Provider returned HTTP {status_code}"

def _provider_rejected_links(send_result: dict) -> bool:
    if not isinstance(send_result, dict):
        return False

    haystack = " ".join(
        [
            str(send_result.get("error") or ""),
            str(send_result.get("response") or ""),
        ]
    ).lower()

    has_link_term = ("link" in haystack) or ("url" in haystack)
    has_block_term = any(token in haystack for token in ("prohibit", "forbid", "not allowed", "blocked"))
    return has_link_term and has_block_term

def _provider_rejected_spam(send_result: dict) -> bool:
    if not isinstance(send_result, dict):
        return False

    haystack = " ".join(
        [
            str(send_result.get("error") or ""),
            str(send_result.get("response") or ""),
        ]
    ).lower()

    return "spam" in haystack

def _strip_urls_from_alert_message(message: str) -> str:
    text = str(message or "")
    # Remove replay section first to keep punctuation natural.
    text = re.sub(r"\.?\s*Replay:\s*https?://\S+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"https?://\S+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\s+([.,!?;:])", r"\1", text)
    return text.strip()

def _format_test_sms_message(
    template: str,
    cam_name: str,
    cam_location: str,
    recipient_name: Optional[str] = None,
) -> str:
    message = str(template or "").strip()
    if not message:
        return message

    if "{ref}" in message:
        ref_code = uuid.uuid4().hex[:6].upper()
        message = message.replace("{ref}", ref_code)

    if "{camera}" in message:
        message = message.replace("{camera}", str(cam_name or ""))
    if "{location}" in message:
        message = message.replace("{location}", str(cam_location or ""))
    if "{name}" in message:
        name_value = str(recipient_name or "").strip() or "Responder"
        message = message.replace("{name}", name_value)

    return message

def _format_sms_recipient_for_provider(recipient_phone: str) -> str:
    raw = str(recipient_phone or "").strip()
    if not raw:
        return raw

    sms_url = (SMS_API_URL or "").lower()
    if "unismsapi.com" not in sms_url:
        return raw

    digits = "".join(ch for ch in raw if ch.isdigit())
    if raw.startswith("+") and len(digits) >= 10:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"+63{digits[1:]}"
    if digits.startswith("63") and len(digits) == 12:
        return f"+{digits}"

    return raw

def _build_sms_payload(recipient_phone: str, message: str) -> dict:
    recipient_value = _format_sms_recipient_for_provider(recipient_phone)
    payload = {
        SMS_API_TO_FIELD or "to": recipient_value,
        SMS_API_MESSAGE_FIELD or "message": message,
    }
    if SMS_API_FROM:
        payload[SMS_API_FROM_FIELD or "from"] = SMS_API_FROM

    if SMS_API_EXTRA_JSON:
        try:
            extra = json.loads(SMS_API_EXTRA_JSON)
            if isinstance(extra, dict):
                payload.update(extra)
            else:
                logger.warning("SMS_API_EXTRA_JSON is not an object; ignoring")
        except Exception:
            logger.warning("SMS_API_EXTRA_JSON is invalid JSON; ignoring")

    return payload

def _build_sms_auth_header_value() -> Optional[str]:
    if not SMS_API_KEY:
        return None

    scheme = (SMS_API_AUTH_SCHEME or "").strip()
    if scheme.lower() == "basic":
        # UniSMS expects HTTP Basic auth where username is secret key and password is empty.
        encoded = base64.b64encode(f"{SMS_API_KEY}:".encode("utf-8")).decode("ascii")
        return f"Basic {encoded}"

    if scheme:
        return f"{scheme} {SMS_API_KEY}"

    return SMS_API_KEY

async def _send_sms_via_api(recipient_phone: str, message: str) -> dict:
    if not recipient_phone:
        return {"ok": False, "error": "Missing recipient phone number"}
    if not SMS_API_URL:
        return {"ok": False, "error": "SMS API URL is not configured"}

    headers = {"Content-Type": "application/json"}
    auth_value = _build_sms_auth_header_value()
    if auth_value:
        headers[SMS_API_AUTH_HEADER or "Authorization"] = auth_value

    async def _dispatch(message_text: str) -> dict:
        payload = _build_sms_payload(recipient_phone, message_text)
        async with httpx.AsyncClient(timeout=SMS_API_TIMEOUT_SECONDS) as client:
            response = await client.post(SMS_API_URL, json=payload, headers=headers)

        provider_body = None
        provider_message_status = None
        provider_reference_id = None
        provider_fail_reason = None

        try:
            parsed_body = response.json()
            if isinstance(parsed_body, dict):
                provider_body = parsed_body
                if isinstance(parsed_body.get("message"), dict):
                    message_data = parsed_body["message"]
                    status_raw = message_data.get("status")
                    provider_message_status = str(status_raw).lower().strip() if status_raw is not None else None
                    provider_reference_id = message_data.get("reference_id")
                    provider_fail_reason = message_data.get("fail_reason")
        except Exception:
            provider_body = None

        ok = 200 <= response.status_code < 300 and provider_message_status != "failed"
        error = None if ok else _extract_provider_error(provider_body, response.status_code, provider_fail_reason)

        return {
            "ok": ok,
            "status_code": response.status_code,
            "response": response.text[:500],
            "provider_message_status": provider_message_status,
            "provider_reference_id": provider_reference_id,
            "message_used": message_text,
            "error": error,
        }

    try:
        initial_result = await _dispatch(message)

        has_url = bool(re.search(r"https?://\S+", str(message or ""), flags=re.IGNORECASE))
        if (
            not initial_result.get("ok")
            and has_url
            and SMS_RETRY_WITHOUT_LINKS_ON_BLOCK
            and _provider_rejected_links(initial_result)
        ):
            fallback_message = _strip_urls_from_alert_message(message)
            if fallback_message and fallback_message != str(message).strip():
                fallback_result = await _dispatch(fallback_message)
                fallback_result["used_link_fallback"] = True
                fallback_result["initial_error"] = initial_result.get("error")

                if fallback_result.get("ok"):
                    logger.info("SMS sent without replay link after provider rejected links")

                return fallback_result

        return initial_result
    except Exception as exc:
        logger.exception("SMS provider call failed")
        return {"ok": False, "error": str(exc), "message_used": message}

async def _store_alert_record(
    db,
    collision_id: Optional[str],
    user_doc: dict,
    message: str,
    send_result: dict,
    is_test: bool = False,
):
    await db.alerts.insert_one({
        "id": str(uuid.uuid4()),
        "collision_id": collision_id,
        "user_id": user_doc["id"],
        "recipient_name": user_doc.get("full_name", "Unknown"),
        "recipient_phone": user_doc.get("phone_number", ""),
        "message": message,
        "status": "sent" if send_result.get("ok") else "failed",
        "is_test": is_test,
        "sent_at": _utc_now_iso(),
    })

def _initial_collision_video_doc(collision_id: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "collision_id": collision_id,
        "video_status": "processing",
        "video_file_id": None,
        "video_filename": None,
        "video_mime_type": "video/mp4",
        "video_duration_seconds": COLLISION_CLIP_SECONDS,
        "video_pre_event_seconds": COLLISION_PRE_EVENT_SECONDS,
        "video_post_event_seconds": COLLISION_POST_EVENT_SECONDS,
        "video_collision_at_second": float(COLLISION_PRE_EVENT_SECONDS),
        "video_recorded_at": None,
        "video_codec": None,
        "video_error": None,
    }

async def _create_collision_entry(
    db,
    camera_id: str,
    confidence_score: float,
    severity: Optional[str] = None,
    collision_type: Optional[str] = None,
    description: Optional[str] = None,
    timestamp: Optional[datetime] = None,
    camera_doc: Optional[dict] = None,
    detection_metadata: Optional[dict] = None,
):
    camera = camera_doc or await db.cameras.find_one({"id": camera_id})
    cam_name = camera["name"] if camera else "Unknown"
    cam_loc = camera["location"] if camera else "Unknown"

    ts_value = timestamp or _utc_now()
    if ts_value.tzinfo is None:
        ts_value = ts_value.replace(tzinfo=timezone.utc)

    collision_id = str(uuid.uuid4())
    severity_id = _normalize_collision_severity(severity)
    type_id = _normalize_collision_type(collision_type)
    status_id = _normalize_collision_status("pending") or "pending"

    doc = {
        "id": collision_id,
        "camera_id": camera_id,
        "confidence_score": float(confidence_score),
        "severity_id": severity_id,
        "type_id": type_id,
        "description": description,
        "status_id": status_id,
        "occurred_at": ts_value.isoformat(),
        "created_at": _utc_now_iso(),
        "updated_at": None,
    }

    await db.collisions.insert_one(doc)

    detection_doc, box_docs = _build_collision_detection_docs(collision_id, detection_metadata)
    if detection_doc:
        await db.collision_detections.insert_one(detection_doc)
        if box_docs:
            await db.collision_detection_boxes.insert_many(box_docs)

    video_doc = _initial_collision_video_doc(collision_id)
    collision_second = _extract_collision_second(detection_metadata)
    if collision_second is not None:
        video_doc["video_collision_at_second"] = collision_second
    await db.collision_videos.insert_one(video_doc)

    await db.collision_status_events.insert_one({
        "id": str(uuid.uuid4()),
        "collision_id": collision_id,
        "status_id": status_id,
        "actor_user_id": None,
        "changed_at": _utc_now_iso(),
    })

    await _queue_collision_video_capture(db, collision_id, camera)
    await _send_alerts(
        db,
        {
            "id": collision_id,
            "camera_id": camera_id,
            "camera_name": cam_name,
            "camera_location": cam_loc,
            "timestamp": ts_value.isoformat(),
            "video_file_id": video_doc.get("video_file_id"),
            "video_public_url": _make_public_clip_url(collision_id, video_doc.get("video_file_id")),
        },
    )
    return doc

def _resolve_ffmpeg_executable() -> Optional[str]:
    if _imageio_ffmpeg is None:
        return None

    try:
        ffmpeg_path = _imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None

    if ffmpeg_path and os.path.exists(ffmpeg_path):
        return ffmpeg_path
    return None

def _transcode_simulation_video_to_mp4(input_path: str, target_fps: Optional[float] = None) -> Optional[str]:
    ffmpeg_path = _resolve_ffmpeg_executable()
    if not ffmpeg_path:
        return None

    output_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as output_file:
            output_path = output_file.name

        def _run(cmd: List[str]) -> subprocess.CompletedProcess:
            return subprocess.run(cmd, capture_output=True, text=True)

        if target_fps is None:
            remux = _run([
                ffmpeg_path,
                "-y",
                "-i",
                input_path,
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                output_path,
            ])
            if remux.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                return output_path

        command = [
            ffmpeg_path,
            "-y",
            "-i",
            input_path,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
        ]

        if target_fps is not None and target_fps > 0:
            command += ["-vf", f"fps={float(target_fps)}"]

        command.append(output_path)

        transcode = _run(command)
        if transcode.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return output_path
    except Exception:
        pass

    if output_path and os.path.exists(output_path):
        try:
            os.remove(output_path)
        except Exception:
            pass
    return None

def _transcode_mp4_bytes_to_h264(video_bytes: bytes) -> Optional[bytes]:
    if not video_bytes:
        return None

    ffmpeg_path = _resolve_ffmpeg_executable()
    if not ffmpeg_path:
        return None

    input_path = None
    output_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as input_file:
            input_file.write(video_bytes)
            input_path = input_file.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as output_file:
            output_path = output_file.name

        command = [
            ffmpeg_path,
            "-y",
            "-i",
            input_path,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            output_path,
        ]

        transcode = subprocess.run(command, capture_output=True, text=True, timeout=180)
        if transcode.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            return None

        with open(output_path, "rb") as output_file:
            return output_file.read()
    except Exception:
        return None
    finally:
        for path in (input_path, output_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

def _probe_mp4_codec_hint(video_bytes: bytes) -> str:
    if not video_bytes:
        return ""

    header = video_bytes[:4096]
    if b"avc1" in header or b"h264" in header:
        return "h264"
    if b"mp4v" in header or b"FMP4" in header:
        return "mp4v"
    return ""

async def _capture_and_store_collision_video(db, collision_id: str, camera: dict):
    camera_id = camera.get("id")
    rtsp_url = camera.get("rtsp_url")

    if cv2 is None:
        await db.collision_videos.update_one(
            {"collision_id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "OpenCV is not installed on backend."}},
            upsert=True,
        )
        return

    if not camera_id or not rtsp_url:
        await db.collision_videos.update_one(
            {"collision_id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "Camera stream URL is missing."}},
            upsert=True,
        )
        return

    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker:
        await db.collision_videos.update_one(
            {"collision_id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "Failed to start camera recorder."}},
            upsert=True,
        )
        return

    event_time = _utc_now()
    pre_frames = worker.get_pre_frames(event_time)
    target_pre_frames = COLLISION_PRE_EVENT_SECONDS * COLLISION_CLIP_FPS
    if len(pre_frames) > target_pre_frames:
        pre_frames = pre_frames[-target_pre_frames:]
    collision_second = min(len(pre_frames) / float(COLLISION_CLIP_FPS), float(COLLISION_CLIP_SECONDS))

    frames = list(pre_frames)
    total_frames_target = COLLISION_CLIP_SECONDS * COLLISION_CLIP_FPS
    post_frames_target = max(total_frames_target - len(frames), 1)

    for _ in range(post_frames_target):
        frame = worker.get_latest_frame()
        if frame is not None:
            frames.append(frame)
        await asyncio.sleep(1.0 / COLLISION_CLIP_FPS)

    if not frames:
        await db.collision_videos.update_one(
            {"collision_id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "No video frames captured from camera stream."}},
            upsert=True,
        )
        return

    height, width = frames[0].shape[:2]
    tmp_path = None
    transcode_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_file:
            tmp_path = tmp_file.name

        writer = cv2.VideoWriter(
            tmp_path,
            cv2.VideoWriter_fourcc(*"mp4v"),
            COLLISION_CLIP_FPS,
            (width, height),
        )

        for frame in frames:
            if frame is None:
                continue
            fh, fw = frame.shape[:2]
            if fw != width or fh != height:
                frame = cv2.resize(frame, (width, height))
            writer.write(frame)
        writer.release()

        upload_path = tmp_path
        video_codec = "mp4v"

        ffmpeg_path = _resolve_ffmpeg_executable()
        if ffmpeg_path:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as transcoded_file:
                transcode_path = transcoded_file.name

            command = [
                ffmpeg_path,
                "-y",
                "-i",
                tmp_path,
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                transcode_path,
            ]

            transcode = subprocess.run(command, capture_output=True, text=True, timeout=180)
            if transcode.returncode == 0 and os.path.exists(transcode_path) and os.path.getsize(transcode_path) > 0:
                upload_path = transcode_path
                video_codec = "h264"
            else:
                logger.warning("H264 transcode failed; keeping mp4v collision clip")

        with open(upload_path, "rb") as file_obj:
            clip_bytes = file_obj.read()

        if not clip_bytes:
            raise RuntimeError("Generated clip file is empty.")

        filename = f"collision_{collision_id}.mp4"
        metadata = {
            "collision_id": collision_id,
            "camera_id": camera_id,
            "recorded_at": _utc_now_iso(),
            "duration_seconds": COLLISION_CLIP_SECONDS,
            "pre_event_seconds": COLLISION_PRE_EVENT_SECONDS,
            "post_event_seconds": COLLISION_POST_EVENT_SECONDS,
            "codec": video_codec,
        }

        file_id = await app.fs_bucket.upload_from_stream(
            filename,
            io.BytesIO(clip_bytes),
            metadata=metadata,
        )

        await db.collision_videos.update_one(
            {"collision_id": collision_id},
            {
                "$set": {
                    "video_status": "ready",
                    "video_file_id": str(file_id),
                    "video_filename": filename,
                    "video_mime_type": "video/mp4",
                    "video_duration_seconds": COLLISION_CLIP_SECONDS,
                    "video_pre_event_seconds": COLLISION_PRE_EVENT_SECONDS,
                    "video_post_event_seconds": COLLISION_POST_EVENT_SECONDS,
                    "video_collision_at_second": round(collision_second, 3),
                    "video_recorded_at": _utc_now_iso(),
                    "video_codec": video_codec,
                    "video_error": None,
                }
            },
            upsert=True,
        )
    except Exception as exc:
        logger.exception("Failed to generate/store collision video clip")
        await db.collision_videos.update_one(
            {"collision_id": collision_id},
            {"$set": {"video_status": "failed", "video_error": str(exc)}},
            upsert=True,
        )
    finally:
        for path in (tmp_path, transcode_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

async def _queue_collision_video_capture(db, collision_id: str, camera: Optional[dict]):
    if not camera or not camera.get("rtsp_url"):
        await db.collision_videos.update_one(
            {"collision_id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "Camera stream URL unavailable."}},
            upsert=True,
        )
        return

    asyncio.create_task(_capture_and_store_collision_video(db, collision_id, camera))

def _sanitize_upload_filename(raw_filename: Optional[str]) -> str:
    candidate = str(raw_filename or "").strip()
    if not candidate:
        candidate = f"simulation_{int(time.time())}.mp4"

    basename = Path(candidate).name
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", basename)
    if not safe_name:
        safe_name = f"simulation_{int(time.time())}.mp4"

    if "." not in safe_name:
        safe_name = f"{safe_name}.mp4"

    return safe_name[:160]

async def _save_upload_to_temp_file(video_file: UploadFile, max_bytes: int) -> Tuple[str, int]:
    suffix = Path(video_file.filename or "").suffix or ".mp4"
    temp_path = None
    bytes_written = 0

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            while True:
                chunk = await video_file.read(1024 * 1024)
                if not chunk:
                    break

                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"Simulation upload exceeds the maximum size of "
                            f"{SIMULATION_MAX_UPLOAD_MB:.0f} MB."
                        ),
                    )

                temp_file.write(chunk)

        if bytes_written <= 0:
            raise HTTPException(400, "Uploaded simulation video is empty.")

        return temp_path, bytes_written
    except Exception:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise

def _extract_collision_clip_from_video_sync(
    input_path: str, 
    output_path: str, 
    start_second: float, 
    end_second: float
) -> bool:
    """Extract a video clip from start_second to end_second using ffmpeg.
    
    Returns True if successful, False otherwise.
    """
    try:
        start_second = max(0.0, float(start_second))
        end_second = max(start_second, float(end_second))
        duration = end_second - start_second
        
        if duration <= 0:
            return False
        
        ffmpeg_exe = _resolve_ffmpeg_executable() or "ffmpeg"
        cmd = [
            ffmpeg_exe,
            "-ss", str(start_second),
            "-i", input_path,
            "-t", str(duration),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-c:a", "aac",
            "-q:v", "5",
            "-y",
            output_path,
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=60.0,
        )
        
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception:
        return False

def _normalize_codec_hint(codec_raw: str) -> str:
    token = str(codec_raw or "").strip().lower()
    token = "".join(ch for ch in token if ch.isalnum())
    if token in {"avc1", "h264", "x264"}:
        return "h264"
    if token in {"mp4v", "fmp4"}:
        return "mp4v"
    return token

def _analyze_simulation_video_sync(
    video_path: str,
    simulation_camera_id: str,
    analysis_fps: Optional[float] = None,
    max_analyzed_frames: Optional[int] = None,
) -> dict:
    if cv2 is None:
        raise RuntimeError("OpenCV is not installed on backend.")

    analysis_fps_value = SIMULATION_ANALYSIS_FPS
    if analysis_fps is not None:
        analysis_fps_value = float(analysis_fps)
        if not math.isfinite(analysis_fps_value) or analysis_fps_value <= 0:
            analysis_fps_value = SIMULATION_ANALYSIS_FPS

    capture = cv2.VideoCapture(video_path)
    transcode_path = None
    if capture is None or not capture.isOpened():
        transcode_path = _transcode_simulation_video_to_mp4(video_path, analysis_fps_value)
        if transcode_path:
            capture = cv2.VideoCapture(transcode_path)
    if capture is None or not capture.isOpened():
        if transcode_path and os.path.exists(transcode_path):
            try:
                os.remove(transcode_path)
            except Exception:
                pass
        detail = "Unable to open uploaded simulation video."
        if _resolve_ffmpeg_executable() is None:
            detail += " Install ffmpeg to support .mov and other formats."
        raise RuntimeError(detail)

    try:

        max_analyzed_frames_value = SIMULATION_MAX_ANALYZED_FRAMES
        if max_analyzed_frames_value <= 0:
            max_analyzed_frames_value = None
        if max_analyzed_frames is not None:
            max_analyzed_frames_value = int(max_analyzed_frames)
            if max_analyzed_frames_value <= 0:
                max_analyzed_frames_value = None

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if not math.isfinite(fps) or fps <= 0:
            fps = analysis_fps_value

        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if frame_count < 0:
            frame_count = 0

        duration_seconds = None
        if frame_count > 0 and fps > 0:
            duration_seconds = frame_count / fps

        sampled_every_n_frames = 1
        if fps > 0:
            sampled_every_n_frames = max(int(round(fps / analysis_fps_value)), 1)

        fourcc_value = int(capture.get(cv2.CAP_PROP_FOURCC) or 0)
        fourcc = ""
        if fourcc_value > 0:
            fourcc = "".join(chr((fourcc_value >> (8 * idx)) & 0xFF) for idx in range(4))
        codec_hint = _normalize_codec_hint(fourcc)

        analyzed_frames = 0
        sampled_frames = 0
        frame_index = -1
        best_inference = None
        best_confidence = 0.0
        best_frame_index = None
        best_frame_width = None
        best_frame_height = None
        early_exit_confidence = float(getattr(detection_service, "confidence_threshold", 0.0) or 0.0)
        if not math.isfinite(early_exit_confidence) or early_exit_confidence < 0:
            early_exit_confidence = 0.0

        while True:
            if max_analyzed_frames_value is not None and analyzed_frames >= max_analyzed_frames_value:
                break
            ok, frame = capture.read()
            if not ok or frame is None:
                break

            frame_index += 1
            sampled_frames += 1
            if sampled_every_n_frames > 1 and (frame_index % sampled_every_n_frames) != 0:
                continue

            inference = detection_service._detect_frame_sync(simulation_camera_id, frame)
            analyzed_frames += 1

            if not inference.get("detected"):
                continue

            confidence = float(inference.get("confidence") or 0.0)
            if best_inference is None or confidence >= best_confidence:
                best_confidence = confidence
                best_inference = inference
                best_frame_index = frame_index
                if getattr(frame, "shape", None) is not None and len(frame.shape) >= 2:
                    best_frame_height = int(frame.shape[0])
                    best_frame_width = int(frame.shape[1])

            if early_exit_confidence > 0 and confidence >= early_exit_confidence:
                break

        detected = best_inference is not None
        detected_at_second = None
        if detected and best_frame_index is not None and fps > 0:
            detected_at_second = float(best_frame_index) / float(fps)

        detail = ""
        if not detected:
            if analyzed_frames <= 0:
                detail = "No frames could be analyzed from the uploaded simulation video."
            else:
                detail = "No collision candidate detected in sampled simulation frames."

        return {
            "detected": detected,
            "detail": detail,
            "fps": float(fps),
            "frame_count": int(frame_count),
            "duration_seconds": float(duration_seconds) if duration_seconds is not None else None,
            "sampled_frames": int(sampled_frames),
            "analyzed_frames": int(analyzed_frames),
            "sampled_every_n_frames": int(sampled_every_n_frames),
            "detected_frame_index": int(best_frame_index) if best_frame_index is not None else None,
            "detected_at_second": detected_at_second,
            "confidence": float(best_confidence) if detected else None,
            "class_name": best_inference.get("class_name") if detected else None,
            "class_id": best_inference.get("class_id") if detected else None,
            "candidate_count": int(best_inference.get("candidate_count", 0)) if detected else 0,
            "top_candidates": best_inference.get("top_candidates") if detected else [],
            "pair_id": best_inference.get("pair_id") if detected else None,
            "boxes": best_inference.get("boxes") if detected else [],
            "frame_width": best_frame_width if detected else None,
            "frame_height": best_frame_height if detected else None,
            "codec_hint": codec_hint,
        }
    finally:
        capture.release()
        detection_service.reset_camera_state(simulation_camera_id)
        if transcode_path and os.path.exists(transcode_path):
            try:
                os.remove(transcode_path)
            except Exception:
                pass

async def ensure_default_captain(db):
    if not await db.users.find_one({"role": "captain"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "username": "captain",
            "email": "captain@safesight.local", "full_name": "Barangay Captain",
            "role": "captain", "phone_number": "+639123456789",
            "is_active": True, "hashed_password": hash_pw("password"),
            "created_at": datetime.utcnow().isoformat()
        })
        logger.info("Default captain account created  (user: captain / pass: password)")

# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
# AUTH
# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
@app.post("/api/auth/token")
async def login(form: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    user = await db.users.find_one({"username": form.username})
    if not user or not verify_pw(form.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return {"access_token": make_token({"sub": user["id"]}), "token_type": "bearer"}

@app.get("/api/auth/me")
async def me(user=Depends(get_current_user)):
    return clean(dict(user))

# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
# CAMERAS
# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
def _camera_failed_detail_from_worker(worker: CameraPreBufferWorker) -> str:
    snapshot = worker.get_health_snapshot()
    reason = snapshot.get("last_failure_reason") or "Camera stream became unavailable"
    return (
        f"{reason}. Failed to reconnect for more than {CAMERA_RECONNECT_FAIL_AFTER_SECONDS}s. "
        "Manual reconnect is required."
    )

def _camera_unavailable_detail(camera: dict) -> str:
    status_value = str(camera.get("status") or "inactive").strip().lower()
    if status_value == "failed":
        return camera.get("last_stream_error") or (
            "Camera failed to reconnect. Use manual reconnect in Camera Management."
        )
    return f"Camera is {status_value}."

async def _mark_camera_failed(db, camera_id: str, detail: str):
    updated = await db.cameras.find_one_and_update(
        {"id": camera_id, "status": "active"},
        {
            "$set": {
                "status": "failed",
                "last_stream_error": detail,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated:
        clip_recorder.remove_worker(camera_id)
    return updated

async def _refresh_camera_runtime_status(db, camera: Optional[dict]):
    if not camera:
        return camera

    camera_status = str(camera.get("status") or "").strip().lower()
    camera_id = camera.get("id", "")
    if camera_status == "error":
        updated = await db.cameras.find_one_and_update(
            {"id": camera_id, "status": "error"},
            {
                "$set": {
                    "status": "failed",
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        return updated if updated else camera

    if camera_status != "active":
        return camera

    worker = clip_recorder.get_worker(camera_id)
    if not worker:
        rtsp_url = str(camera.get("rtsp_url") or "").strip()
        if not rtsp_url:
            updated = await _mark_camera_failed(db, camera_id, "Camera stream URL is missing.")
            return updated if updated else camera
        worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
        if not worker:
            return camera

    if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
        detail = _camera_failed_detail_from_worker(worker)
        updated = await _mark_camera_failed(db, camera_id, detail)
        if updated:
            return updated
    return camera

class CameraCreate(BaseModel):
    name: str
    location: str
    rtsp_url: str
    description: Optional[str] = None
    map_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    map_longitude: Optional[float] = Field(default=None, ge=-180, le=180)

class CameraUpdate(BaseModel):
    name:        Optional[str] = None
    location:    Optional[str] = None
    rtsp_url:    Optional[str] = None
    description: Optional[str] = None
    status:      Optional[str] = None
    map_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    map_longitude: Optional[float] = Field(default=None, ge=-180, le=180)

class WebcamSimulationStart(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    send_sms: bool = True
    camera_id: Optional[str] = None

@app.get("/api/cameras/")
async def list_cameras(db=Depends(get_db), _=Depends(get_current_user)):
    docs = await db.cameras.find().sort("created_at", -1).to_list(None)
    refreshed = []
    for camera in docs:
        refreshed_camera = await _refresh_camera_runtime_status(db, camera)
        refreshed.append(clean(refreshed_camera if refreshed_camera else camera))
    return refreshed

@app.get("/api/cameras/{camera_id}/snapshot")
async def camera_snapshot(camera_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    if cv2 is None:
        raise HTTPException(503, "OpenCV is not installed on backend.")

    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    camera = await _refresh_camera_runtime_status(db, camera)

    if camera.get("status") != "active":
        raise HTTPException(409, _camera_unavailable_detail(camera))

    rtsp_url = camera.get("rtsp_url", "")
    if not rtsp_url:
        raise HTTPException(400, "Camera stream URL is missing")

    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker:
        raise HTTPException(503, "Camera stream is unavailable")

    frame = worker.get_latest_frame()
    if frame is None:
        await asyncio.sleep(0.2)
        frame = worker.get_latest_frame()

    if frame is None:
        if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
            detail = _camera_failed_detail_from_worker(worker)
            await _mark_camera_failed(db, camera_id, detail)
        raise HTTPException(503, "No frame available yet for this camera")

    ok, encoded = cv2.imencode(
        ".jpg",
        frame,
        [int(cv2.IMWRITE_JPEG_QUALITY), 80],
    )
    if not ok:
        raise HTTPException(500, "Failed to encode camera frame")

    return Response(
        content=encoded.tobytes(),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

async def _camera_mjpeg_stream_generator(
    request: Request,
    worker: CameraPreBufferWorker,
    camera_id: str,
    db,
    overlay_enabled: Optional[bool] = None,
):
    last_payload_ts = 0
    stream_started_ns = time.time_ns()
    last_payload_sent_ns = stream_started_ns
    restart_attempts = 0
    last_restart_ns = 0
    restart_backoff_ns = int(5 * 1_000_000_000)
    stale_restart_ns = int(max(CAMERA_RECONNECT_FAIL_AFTER_SECONDS, 10) * 1_000_000_000)
    health_probe_clock = 0.0
    use_overlay = LIVE_STREAM_OVERLAY_ENABLED and cv2 is not None
    if overlay_enabled is not None:
        use_overlay = use_overlay and bool(overlay_enabled)
    stale_inference_ns = int(max(LIVE_OVERLAY_INFERENCE_INTERVAL_SECONDS * 6.0, 2.0) * 1_000_000_000)
    overlay_inference_interval_ns = int(max(LIVE_OVERLAY_INFERENCE_INTERVAL_SECONDS, 0.05) * 1_000_000_000)
    overlay_inference_future = None
    overlay_last_inference_request_ns = 0
    overlay_state_camera_id = f"overlay-preview:{camera_id}" if use_overlay else None
    worker.add_live_subscriber()

    try:
        while True:
            if await request.is_disconnected():
                break

            payload = None
            frame = None
            if use_overlay:
                frame, payload_ts = worker.get_latest_frame_packet()
            else:
                payload, payload_ts = worker.get_latest_jpeg_packet()

            # Avoid sending stale payloads from a previous client session.
            if payload is None or payload_ts is None or payload_ts < stream_started_ns:
                if use_overlay and frame is not None and payload_ts is not None and payload_ts >= stream_started_ns:
                    pass
                else:
                    now_clock = time.perf_counter()
                    if now_clock - health_probe_clock >= 1.0:
                        health_probe_clock = now_clock
                        if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
                            detail = _camera_failed_detail_from_worker(worker)
                            await _mark_camera_failed(db, camera_id, detail)
                            break
                    now_ns = time.time_ns()
                    should_restart = (
                        (now_ns - last_payload_sent_ns) >= stale_restart_ns
                        and (now_ns - last_restart_ns) >= restart_backoff_ns
                        and restart_attempts < 3
                    )
                    if should_restart:
                        restart_attempts += 1
                        last_restart_ns = now_ns
                        try:
                            worker.remove_live_subscriber()
                            clip_recorder.remove_worker(camera_id)
                            worker = clip_recorder.ensure_worker(camera_id, worker.rtsp_url)
                            if worker:
                                worker.add_live_subscriber()
                                stream_started_ns = time.time_ns()
                                last_payload_ts = 0
                                last_payload_sent_ns = stream_started_ns
                                continue
                        except Exception:
                            break
                    await asyncio.sleep(0.005)
                    continue

            if use_overlay:
                frame_for_live = _resize_frame_for_live(frame)
                inference, inference_ts = worker.get_latest_inference_packet()

                if overlay_inference_future is not None and overlay_inference_future.done():
                    try:
                        inferred = overlay_inference_future.result()
                        if isinstance(inferred, dict):
                            worker.set_latest_inference(inferred, payload_ts)
                            inference, inference_ts = worker.get_latest_inference_packet()
                    except Exception:
                        pass
                    finally:
                        overlay_inference_future = None

                inference_stale = (
                    inference is None
                    or inference_ts is None
                    or (payload_ts - inference_ts) > stale_inference_ns
                )
                now_ns = time.time_ns()
                if (
                    inference_stale
                    and overlay_inference_future is None
                    and (now_ns - overlay_last_inference_request_ns) >= overlay_inference_interval_ns
                    and overlay_state_camera_id
                ):
                    try:
                        inference_frame = frame.copy()
                    except Exception:
                        inference_frame = frame_for_live

                    loop = asyncio.get_running_loop()
                    overlay_inference_future = loop.run_in_executor(
                        None,
                        detection_service._detect_frame_sync,
                        overlay_state_camera_id,
                        inference_frame,
                    )
                    overlay_last_inference_request_ns = now_ns

                if (
                    inference is not None
                    and inference_ts is not None
                    and (payload_ts - inference_ts) <= stale_inference_ns
                ):
                    frame_for_live = _draw_detection_overlay(frame_for_live, inference)

                ok_jpeg, encoded_jpeg = cv2.imencode(
                    ".jpg",
                    frame_for_live,
                    [int(cv2.IMWRITE_JPEG_QUALITY), LIVE_STREAM_JPEG_QUALITY],
                )
                if not ok_jpeg:
                    await asyncio.sleep(0.005)
                    continue
                payload = encoded_jpeg.tobytes()

            if payload is None or payload_ts is None or payload_ts < stream_started_ns:
                now_clock = time.perf_counter()
                if now_clock - health_probe_clock >= 1.0:
                    health_probe_clock = now_clock
                    if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
                        detail = _camera_failed_detail_from_worker(worker)
                        await _mark_camera_failed(db, camera_id, detail)
                        break
                await asyncio.sleep(0.005)
                continue

            if payload_ts <= last_payload_ts:
                await asyncio.sleep(0.005)
                continue

            last_payload_ts = payload_ts
            last_payload_sent_ns = time.time_ns()

            header = (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                + f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii")
            )

            yield header + payload + b"\r\n"
            await asyncio.sleep(0)
    finally:
        if overlay_inference_future is not None and not overlay_inference_future.done():
            overlay_inference_future.cancel()
        if overlay_state_camera_id:
            detection_service.reset_camera_state(overlay_state_camera_id)
        worker.remove_live_subscriber()

@app.get("/api/cameras/{camera_id}/stream")
async def camera_stream(
    camera_id: str,
    request: Request,
    token: Optional[str] = Query(default=None),
    fresh: bool = Query(default=False),
    overlay: Optional[bool] = Query(default=None),
    db=Depends(get_db),
):
    if cv2 is None:
        raise HTTPException(503, "OpenCV is not installed on backend.")

    await _get_current_user_from_header_or_query(request, db, token)

    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    camera = await _refresh_camera_runtime_status(db, camera)

    if camera.get("status") != "active":
        raise HTTPException(409, _camera_unavailable_detail(camera))

    rtsp_url = camera.get("rtsp_url", "")
    if not rtsp_url:
        raise HTTPException(400, "Camera stream URL is missing")

    if fresh:
        clip_recorder.remove_worker(camera_id)

    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker:
        raise HTTPException(503, "Camera stream is unavailable")

    if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
        detail = _camera_failed_detail_from_worker(worker)
        await _mark_camera_failed(db, camera_id, detail)
        raise HTTPException(503, detail)

    return StreamingResponse(
        _camera_mjpeg_stream_generator(request, worker, camera_id, db, overlay_enabled=overlay),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

@app.post("/api/simulation/webcam/start")
async def start_webcam_simulation(
    body: WebcamSimulationStart,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    camera_id = (body.camera_id or WEBCAM_SIMULATION_CAMERA_ID).strip() or WEBCAM_SIMULATION_CAMERA_ID
    session_id = str(uuid.uuid4())
    now_iso = datetime.utcnow().isoformat()
    name = (body.name or "Webcam Simulation").strip() or "Webcam Simulation"
    location = (body.location or "Local feed").strip() or "Local feed"
    rtsp_url = f"webcam://{camera_id}"

    update = {
        "id": camera_id,
        "name": name,
        "location": location,
        "rtsp_url": rtsp_url,
        "status": "active",
        "description": "Webcam simulation feed.",
        "simulation_session_id": session_id,
        "simulation_detect_once": True,
        "simulation_send_sms": bool(body.send_sms),
        "last_stream_error": None,
    }

    result = await db.cameras.find_one_and_update(
        {"id": camera_id},
        {"$set": update, "$setOnInsert": {"created_at": now_iso}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    clip_recorder.remove_worker(camera_id)
    clip_recorder.ensure_worker(camera_id, rtsp_url)
    detection_service.reset_camera_state(camera_id)
    detection_service.configure_detect_once_session(camera_id, session_id, True)

    return {
        "camera_id": camera_id,
        "session_id": session_id,
        "camera": clean(result),
    }

@app.post("/api/simulation/webcam/{camera_id}/frame")
async def upload_webcam_frame(
    camera_id: str,
    frame: UploadFile = File(...),
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    if cv2 is None:
        raise HTTPException(503, "OpenCV is not installed on backend.")

    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    rtsp_url = str(camera.get("rtsp_url") or "")
    if not _is_webcam_source(rtsp_url):
        raise HTTPException(400, "Camera is not configured for webcam simulation")

    payload = await frame.read()
    if not payload:
        raise HTTPException(400, "Uploaded frame is empty.")
    if len(payload) > 6 * 1024 * 1024:
        raise HTTPException(413, "Uploaded frame is too large.")

    buffer = np.frombuffer(payload, dtype=np.uint8)
    decoded = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if decoded is None:
        raise HTTPException(400, "Unable to decode uploaded frame.")

    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker or not hasattr(worker, "push_frame"):
        raise HTTPException(503, "Simulation worker is unavailable")

    worker.push_frame(decoded, jpeg_payload=payload)
    return {"ok": True}

@app.post("/api/simulation/webcam/{camera_id}/stop")
async def stop_webcam_simulation(
    camera_id: str,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        return {"ok": True}

    now_iso = datetime.utcnow().isoformat()
    update = {
        "status": "inactive",
        "simulation_detect_once": False,
        "simulation_session_id": None,
    }

    result = await db.cameras.find_one_and_update(
        {"id": camera_id},
        {"$set": update},
        return_document=ReturnDocument.AFTER,
    )

    clip_recorder.remove_worker(camera_id)
    detection_service.reset_camera_state(camera_id)
    detection_service.configure_detect_once_session(camera_id, None, False)

    return {"ok": True, "camera": clean(result) if result else None}

@app.post("/api/cameras/", status_code=201)
async def create_camera(body: CameraCreate, db=Depends(get_db), _=Depends(captain_only)):
    payload = body.model_dump()
    payload["name"] = payload["name"].strip()
    payload["location"] = payload["location"].strip()
    payload["rtsp_url"] = payload["rtsp_url"].strip()
    if payload.get("description") is not None:
        payload["description"] = payload["description"].strip()

    await _ensure_rtsp_reachable(payload["rtsp_url"])

    now_iso = datetime.utcnow().isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "status": "active",
        "created_at": now_iso,
        "last_stream_error": None,
        **payload,
    }
    await db.cameras.insert_one(doc)
    if doc.get("status") == "active":
        clip_recorder.ensure_worker(doc.get("id", ""), doc.get("rtsp_url", ""))
    return clean(doc)

@app.put("/api/cameras/{camera_id}")
async def update_camera(camera_id: str, body: CameraUpdate, db=Depends(get_db), _=Depends(captain_only)):
    existing = await db.cameras.find_one({"id": camera_id})
    if not existing:
        raise HTTPException(404, "Camera not found")

    raw_update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    update = {}
    for key, value in raw_update.items():
        if key == "status":
            update[key] = _normalize_camera_status(value)
        elif isinstance(value, str):
            update[key] = value.strip()
        else:
            update[key] = value

    if not update:
        return clean(existing)

    next_status = update.get("status", str(existing.get("status") or "active").strip().lower())
    next_rtsp_url = str(update.get("rtsp_url", existing.get("rtsp_url") or "")).strip()

    if "rtsp_url" in update and not next_rtsp_url:
        raise HTTPException(400, "Camera stream URL is missing")

    if "rtsp_url" in update:
        await _ensure_rtsp_reachable(next_rtsp_url)

    if next_status == "active" and existing.get("status") != "active" and "rtsp_url" not in update:
        if not next_rtsp_url:
            raise HTTPException(400, "Camera stream URL is missing")
        await _ensure_rtsp_reachable(next_rtsp_url)

    if next_status == "active":
        update["last_stream_error"] = None
    result = await db.cameras.find_one_and_update(
        {"id": camera_id}, {"$set": update}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(404, "Camera not found")

    if result.get("status") == "active":
        worker = clip_recorder.ensure_worker(result.get("id", ""), result.get("rtsp_url", ""))
        if not worker:
            detail = "Failed to initialize camera stream worker."
            failed = await _mark_camera_failed(db, camera_id, detail)
            if failed:
                return clean(failed)
    else:
        clip_recorder.remove_worker(result.get("id", ""))

    result = await _refresh_camera_runtime_status(db, result)
    return clean(result)

@app.post("/api/cameras/{camera_id}/reconnect")
async def reconnect_camera(camera_id: str, db=Depends(get_db), _=Depends(captain_only)):
    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    rtsp_url = str(camera.get("rtsp_url") or "").strip()
    if not rtsp_url:
        raise HTTPException(400, "Camera stream URL is missing")

    try:
        await _ensure_rtsp_reachable(rtsp_url)
    except HTTPException as exc:
        detail = str(exc.detail)
        await db.cameras.update_one(
            {"id": camera_id},
            {
                "$set": {
                    "status": "failed",
                    "last_stream_error": detail,
                }
            },
        )
        clip_recorder.remove_worker(camera_id)
        raise

    clip_recorder.remove_worker(camera_id)
    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker:
        detail = "Failed to initialize camera stream worker."
        await db.cameras.update_one(
            {"id": camera_id},
            {
                "$set": {
                    "status": "failed",
                    "last_stream_error": detail,
                }
            },
        )
        raise HTTPException(503, detail)

    result = await db.cameras.find_one_and_update(
        {"id": camera_id},
        {
            "$set": {
                "status": "active",
                "last_stream_error": None,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return clean(result)

@app.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: str, db=Depends(get_db), _=Depends(captain_only)):
    result = await db.cameras.delete_one({"id": camera_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Camera not found")
    clip_recorder.remove_worker(camera_id)
    return {"message": "Camera deleted"}

# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
# COLLISIONS
# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
class CollisionCreate(BaseModel):
    camera_id:        str
    confidence_score: float
    severity:         Optional[str] = "medium"
    collision_type:   Optional[str] = None
    description:      Optional[str] = None

class CollisionUpdate(BaseModel):
    status: Optional[str] = None  # pending | acknowledged | responded | resolved
    severity: Optional[str] = None  # low | medium | high
    collision_type: Optional[str] = None  # single_vehicle | rear_end | head_on | side_impact | multi_vehicle

@app.get("/api/collisions/")
async def list_collisions(db=Depends(get_db), _=Depends(get_current_user)):
    docs = await db.collisions.find().sort("occurred_at", -1).limit(200).to_list(None)
    return await _hydrate_collision_payloads(db, docs)

@app.post("/api/collisions/", status_code=201)
async def create_collision(body: CollisionCreate, db=Depends(get_db), _=Depends(get_current_user)):
    doc = await _create_collision_entry(
        db=db,
        camera_id=body.camera_id,
        confidence_score=body.confidence_score,
        severity=body.severity,
        collision_type=body.collision_type,
        description=body.description,
    )
    payloads = await _hydrate_collision_payloads(db, [doc])
    return payloads[0] if payloads else _serialize_collision(doc)

@app.put("/api/collisions/{collision_id}")
async def update_collision(collision_id: str, body: CollisionUpdate,
                           db=Depends(get_db), user=Depends(get_current_user)):
    update = {}
    status_event_needed = False

    existing = await db.collisions.find_one({"id": collision_id})
    if not existing:
        raise HTTPException(404, "Collision not found")

    if body.status:
        status_id = _normalize_collision_status(body.status)
        if not status_id:
            raise HTTPException(400, "Invalid collision status")
        if status_id != existing.get("status_id"):
            update["status_id"] = status_id
            status_event_needed = True

    if body.severity is not None:
        update["severity_id"] = _normalize_collision_severity(body.severity)

    if body.collision_type is not None:
        update["type_id"] = _normalize_collision_type(body.collision_type)

    if not update and not status_event_needed:
        raise HTTPException(400, "No collision fields provided for update")

    if update:
        update["updated_at"] = _utc_now_iso()
        result = await db.collisions.find_one_and_update(
            {"id": collision_id}, {"$set": update}, return_document=ReturnDocument.AFTER)
    else:
        result = existing

    if status_event_needed:
        await db.collision_status_events.insert_one({
            "id": str(uuid.uuid4()),
            "collision_id": collision_id,
            "status_id": update.get("status_id"),
            "actor_user_id": user.get("id"),
            "changed_at": _utc_now_iso(),
        })

    payloads = await _hydrate_collision_payloads(db, [result])
    return payloads[0] if payloads else _serialize_collision(result)

@app.get("/api/collisions/{collision_id}/video")
async def get_collision_video(collision_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    collision = await db.collisions.find_one({"id": collision_id})
    if not collision:
        raise HTTPException(404, "Collision not found")
    video = await db.collision_videos.find_one({"collision_id": collision_id})
    if not video:
        raise HTTPException(404, "No video clip available for this collision.")
    video_bytes, media_type, filename = await _load_collision_video_bytes(collision, video)

    return Response(
        content=video_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Content-Length": str(len(video_bytes)),
            "Accept-Ranges": "bytes",
        },
    )

@app.get("/api/public/clips/{collision_id}")
async def get_public_collision_video(
    collision_id: str,
    file_id: str = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    db=Depends(get_db),
):
    collision = await db.collisions.find_one({"id": collision_id})
    if not collision:
        raise HTTPException(404, "Collision not found")

    video = await db.collision_videos.find_one({"collision_id": collision_id})
    if not video:
        raise HTTPException(404, "Clip file not found")

    stored_file_id = str(video.get("video_file_id") or "").strip()
    requested_file_id = str(file_id or "").strip()
    if not stored_file_id or requested_file_id != stored_file_id:
        raise HTTPException(404, "Clip file not found")

    if not _verify_public_video_token(stored_file_id, int(exp), sig):
        raise HTTPException(403, "Invalid or expired public clip token")

    video_bytes, media_type, filename = await _load_collision_video_bytes(collision, video)
    return Response(
        content=video_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Content-Length": str(len(video_bytes)),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
    )

@app.post("/api/collisions/simulate")
async def simulate_collision_video(
    video_file: UploadFile = File(...),
    camera_id: Optional[str] = Query(default=None),
    create_event: bool = Query(default=True),
    send_sms: bool = Query(default=True),
    analysis_fps: Optional[float] = Query(default=None),
    max_analyzed_frames: Optional[int] = Query(default=None),
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    if cv2 is None:
        raise HTTPException(503, "OpenCV is not installed on backend.")

    if video_file is None:
        raise HTTPException(400, "Missing uploaded simulation video file.")

    analysis_fps_value = None
    if analysis_fps is not None:
        analysis_fps_value = float(analysis_fps)
        if not math.isfinite(analysis_fps_value) or analysis_fps_value <= 0:
            raise HTTPException(400, "analysis_fps must be greater than 0.")

    max_analyzed_frames_value = None
    if max_analyzed_frames is not None:
        max_analyzed_frames_value = int(max_analyzed_frames)
        if max_analyzed_frames_value <= 0:
            max_analyzed_frames_value = None

    filename = _sanitize_upload_filename(video_file.filename)
    simulation_camera_id = f"simulation:{uuid.uuid4()}"
    temp_path = None

    try:
        max_upload_bytes = int(SIMULATION_MAX_UPLOAD_MB * 1024 * 1024)
        temp_path, uploaded_size_bytes = await _save_upload_to_temp_file(video_file, max_upload_bytes)

        loop = asyncio.get_running_loop()
        analysis = await loop.run_in_executor(
            None,
            _analyze_simulation_video_sync,
            temp_path,
            simulation_camera_id,
            analysis_fps_value,
            max_analyzed_frames_value,
        )

        response_payload = {
            "detected": bool(analysis.get("detected")),
            "filename": filename,
            "uploaded_size_bytes": int(uploaded_size_bytes),
            "fps": analysis.get("fps"),
            "frame_count": analysis.get("frame_count"),
            "duration_seconds": analysis.get("duration_seconds"),
            "sampled_frames": analysis.get("sampled_frames"),
            "analyzed_frames": analysis.get("analyzed_frames"),
            "sampled_every_n_frames": analysis.get("sampled_every_n_frames"),
            "detected_frame_index": analysis.get("detected_frame_index"),
            "detected_at_second": analysis.get("detected_at_second"),
            "candidate_count": int(analysis.get("candidate_count") or 0),
            "top_candidates": analysis.get("top_candidates") or [],
            "boxes": analysis.get("boxes") or [],
            "detection_boxes": analysis.get("boxes") or [],
            "detection_pair_id": analysis.get("pair_id") or None,
            "detection_frame_width": analysis.get("frame_width"),
            "detection_frame_height": analysis.get("frame_height"),
            "class_name": analysis.get("class_name"),
            "class_id": analysis.get("class_id"),
            "confidence": analysis.get("confidence"),
            "event_created": False,
            "collision_id": None,
            "timestamp": None,
            "video_file_id": None,
            "video_public_url": None,
            "video_pre_event_seconds": None,
            "video_post_event_seconds": None,
            "video_duration_seconds": None,
            "video_collision_at_second": analysis.get("detected_at_second"),
            "sms_total_recipients": 0,
            "sms_sent": 0,
            "sms_failed": 0,
        }

        if not analysis.get("detected"):
            response_payload["detail"] = analysis.get("detail") or "No collision detected in simulation video."
            return response_payload

        if not create_event:
            response_payload["detail"] = "Collision candidate detected. Event creation is disabled for this run."
            return response_payload

        selected_camera = None
        if camera_id:
            selected_camera = await db.cameras.find_one({"id": camera_id})
            if not selected_camera:
                raise HTTPException(404, "Camera not found")

        collision_id = str(uuid.uuid4())
        source_camera_id = selected_camera.get("id") if selected_camera else f"simulation-upload:{collision_id}"
        source_camera_name = selected_camera.get("name") if selected_camera else "Simulated Camera"
        source_camera_location = selected_camera.get("location") if selected_camera else "Uploaded Video"

        # Extract collision clip from full video
        detected_at_second = float(analysis.get("detected_at_second") or 0.0)
        clip_start_second = max(0.0, detected_at_second - float(COLLISION_PRE_EVENT_SECONDS))
        clip_end_second = clip_start_second + float(COLLISION_CLIP_SECONDS)
        
        trimmed_path = None
        try:
            trimmed_path = os.path.join(tempfile.gettempdir(), f"clip_{collision_id}.mp4")
            trimmed_success = _extract_collision_clip_from_video_sync(
                temp_path, 
                trimmed_path, 
                clip_start_second, 
                clip_end_second
            )
            if not trimmed_success:
                trimmed_path = None
        except Exception:
            trimmed_path = None
        
        # Use trimmed clip if available, otherwise fall back to full upload
        video_file_path = trimmed_path if trimmed_path and os.path.exists(trimmed_path) else temp_path
        
        upload_stream_name = f"simulation_{collision_id}_{filename}"
        clip_metadata = {
            "collision_id": collision_id,
            "camera_id": source_camera_id,
            "recorded_at": _utc_now_iso(),
            "duration_seconds": float(COLLISION_CLIP_SECONDS),
            "codec": analysis.get("codec_hint") or "",
            "source": "simulation-upload",
            "source_filename": filename,
        }

        with open(video_file_path, "rb") as uploaded_stream:
            file_id = await app.fs_bucket.upload_from_stream(
                upload_stream_name,
                uploaded_stream,
                metadata=clip_metadata,
            )

        # Clean up trimmed file if it was created
        if trimmed_path and os.path.exists(trimmed_path):
            try:
                os.remove(trimmed_path)
            except Exception:
                pass

        confidence = float(analysis.get("confidence") or 0.0)
        detected_second = analysis.get("detected_at_second")
        detected_second_text = (
            f"{float(detected_second):.2f}s" if isinstance(detected_second, (int, float)) else "unknown time"
        )
        description = (
            f"Simulation-detected collision from {filename} at {detected_second_text}. "
            f"Class={analysis.get('class_name') or 'collision'}, confidence={confidence:.0%}."
        )

        now_iso = _utc_now_iso()
        collision_doc = {
            "id": collision_id,
            "camera_id": source_camera_id,
            "camera_name": source_camera_name,
            "camera_location": source_camera_location,
            "confidence_score": confidence,
            "severity_id": None,
            "type_id": None,
            "description": description,
            "status_id": "pending",
            "occurred_at": now_iso,
            "created_at": now_iso,
            "updated_at": None,
        }

        await db.collisions.insert_one(collision_doc)

        detection_doc, box_docs = _build_collision_detection_docs(
            collision_id,
            {
                "boxes": analysis.get("boxes") or [],
                "pair_id": analysis.get("pair_id") or None,
                "detection_frame_width": analysis.get("frame_width"),
                "detection_frame_height": analysis.get("frame_height"),
            },
        )
        if detection_doc:
            await db.collision_detections.insert_one(detection_doc)
            if box_docs:
                await db.collision_detection_boxes.insert_many(box_docs)

        video_doc = _initial_collision_video_doc(collision_id)
        video_doc.update({
            "video_status": "ready",
            "video_file_id": str(file_id),
            "video_filename": upload_stream_name,
            "video_mime_type": str(video_file.content_type or "video/mp4"),
            "video_duration_seconds": float(COLLISION_CLIP_SECONDS),
            "video_pre_event_seconds": float(COLLISION_PRE_EVENT_SECONDS),
            "video_post_event_seconds": float(COLLISION_POST_EVENT_SECONDS),
            "video_collision_at_second": float(COLLISION_PRE_EVENT_SECONDS),
            "video_recorded_at": now_iso,
            "video_codec": analysis.get("codec_hint") or "",
            "video_error": None,
        })
        await db.collision_videos.insert_one(video_doc)

        await db.collision_status_events.insert_one({
            "id": str(uuid.uuid4()),
            "collision_id": collision_id,
            "status_id": "pending",
            "actor_user_id": user.get("id"),
            "changed_at": now_iso,
        })

        collision_payload = _build_collision_payload(
            collision=collision_doc,
            camera={"name": source_camera_name, "location": source_camera_location},
            video=video_doc,
            detection=detection_doc,
            box_docs=box_docs,
            status_events=[],
            user_map=None,
        )

        alert_summary = {"total_recipients": 0, "sent": 0, "failed": 0, "recipients": []}
        if send_sms:
            alert_summary = await _send_alerts(db, collision_payload)

        response_payload.update(
            {
                "event_created": True,
                "collision_id": collision_payload.get("id"),
                "timestamp": collision_payload.get("timestamp"),
                "video_file_id": collision_payload.get("video_file_id"),
                "video_public_url": collision_payload.get("video_public_url"),
                "video_pre_event_seconds": collision_payload.get("video_pre_event_seconds"),
                "video_post_event_seconds": collision_payload.get("video_post_event_seconds"),
                "video_duration_seconds": collision_payload.get("video_duration_seconds"),
                "video_collision_at_second": collision_payload.get("video_collision_at_second"),
                "camera_id": collision_payload.get("camera_id"),
                "camera_name": collision_payload.get("camera_name"),
                "camera_location": collision_payload.get("camera_location"),
                "detection_boxes": collision_payload.get("detection_boxes") or [],
                "detection_pair_id": collision_payload.get("detection_pair_id"),
                "detection_frame_width": collision_payload.get("detection_frame_width"),
                "detection_frame_height": collision_payload.get("detection_frame_height"),
                "sms_total_recipients": int(alert_summary.get("total_recipients") or 0),
                "sms_sent": int(alert_summary.get("sent") or 0),
                "sms_failed": int(alert_summary.get("failed") or 0),
            }
        )

        return response_payload
    finally:
        detection_service.reset_camera_state(simulation_camera_id)
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        try:
            await video_file.close()
        except Exception:
            pass

@app.post("/api/collisions/mock-detection")
async def mock_collision(camera_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    import random
    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    doc = await _create_collision_entry(
        db=db,
        camera_id=camera_id,
        confidence_score=round(random.uniform(0.70, 0.99), 2),
        severity=None,
        description="Mock collision - testing",
        camera_doc=camera,
    )
    payloads = await _hydrate_collision_payloads(db, [doc])
    return payloads[0] if payloads else clean(doc)

@app.get("/api/detection/status")
async def detection_status(db=Depends(get_db), _=Depends(get_current_user)):
    if detection_service.enabled:
        await detection_service.start(db)
    return detection_service.status()

@app.post("/api/detection/enable")
async def enable_detection(db=Depends(get_db), _=Depends(captain_only)):
    detection_service.set_enabled(True)
    await detection_service.start(db)
    return detection_service.status()

@app.post("/api/detection/disable")
async def disable_detection(_=Depends(captain_only)):
    detection_service.set_enabled(False)
    return detection_service.status()

@app.post("/api/detection/test/{camera_id}")
async def test_detection_on_camera(
    camera_id: str,
    create_event: bool = Query(default=True),
    _=Depends(get_current_user),
):
    return await detection_service.test_camera(camera_id, create_event=create_event)

# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
# USERS
# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
class UserCreate(BaseModel):
    username:     str
    email:        str
    full_name:    str
    role:         str   # captain | responder
    phone_number: str
    password:     str

class UserUpdate(BaseModel):
    username:     Optional[str] = None
    full_name:    Optional[str] = None
    email:        Optional[str] = None
    phone_number: Optional[str] = None
    role:         Optional[str] = None
    is_active:    Optional[bool] = None
    password:     Optional[str] = None

@app.get("/api/users/")
async def list_users(db=Depends(get_db), _=Depends(captain_only)):
    docs = await db.users.find().to_list(None)
    return [clean(dict(d)) for d in docs]

@app.post("/api/users/", status_code=201)
async def create_user(body: UserCreate, db=Depends(get_db), _=Depends(captain_only)):
    if await db.users.find_one({"$or": [{"username": body.username}, {"email": body.email}]}):
        raise HTTPException(400, "Username or email already exists")
    _validate_password(body.password)
    phone_number = _normalize_phone_number(body.phone_number)
    doc = {
        "id": str(uuid.uuid4()), "username": body.username,
        "email": body.email, "full_name": body.full_name,
        "role": body.role, "phone_number": phone_number,
        "is_active": True, "hashed_password": hash_pw(body.password),
        "created_at": datetime.utcnow().isoformat()
    }
    await db.users.insert_one(doc)
    return clean(dict(doc))

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, db=Depends(get_db), _=Depends(captain_only)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}

    # Prevent duplicate username/email when updating an existing account.
    duplicate_checks = []
    if "username" in update:
        duplicate_checks.append({"username": update["username"]})
    if "email" in update:
        duplicate_checks.append({"email": update["email"]})
    if duplicate_checks:
        duplicate = await db.users.find_one({"id": {"$ne": user_id}, "$or": duplicate_checks})
        if duplicate:
            raise HTTPException(400, "Username or email already exists")

    if "password" in update:
        if update["password"]:
            _validate_password(update["password"])
            update["hashed_password"] = hash_pw(update.pop("password"))
        else:
            update.pop("password")

    if "phone_number" in update:
        update["phone_number"] = _normalize_phone_number(update["phone_number"])

    result = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": update}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(404, "User not found")
    return clean(dict(result))

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, db=Depends(get_db), user=Depends(captain_only)):
    if user["id"] == user_id:
        raise HTTPException(400, "Cannot delete yourself")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "User not found")
    return {"message": "User deleted"}

# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
# ALERTS
# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
class SmsTestRequest(BaseModel):
    camera_id: Optional[str] = None
    message: Optional[str] = None

@app.get("/api/alerts/")
async def list_alerts(db=Depends(get_db), user=Depends(get_current_user)):
    query = {} if user["role"] == "captain" else {"user_id": user["id"]}
    docs  = await db.alerts.find(query).sort("sent_at", -1).limit(200).to_list(None)
    return [clean(d) for d in docs]

async def _send_alerts(db, collision: dict):
    """Send collision SMS alerts to active responders and persist delivery logs."""
    summary = {
        "total_recipients": 0,
        "sent": 0,
        "failed": 0,
        "recipients": [],
    }

    camera_id = collision.get("camera_id") if isinstance(collision, dict) else None
    if camera_id:
        camera = await db.cameras.find_one({"id": camera_id})
        if camera and camera.get("simulation_send_sms") is False:
            return summary

    responders = await db.users.find({"is_active": True, "role": "responder"}).to_list(None)
    summary["total_recipients"] = len(responders)

    if not responders:
        logger.warning("No active responders to notify for collision %s", collision.get("id"))
        return summary

    msg = _build_collision_alert_message(collision, include_replay_link=False)
    for responder in responders:
        send_result = await _send_sms_via_api(responder.get("phone_number", ""), msg)
        stored_message = send_result.get("message_used") or msg
        await _store_alert_record(
            db=db,
            collision_id=collision.get("id"),
            user_doc=responder,
            message=stored_message,
            send_result=send_result,
            is_test=False,
        )

        if send_result.get("ok"):
            summary["sent"] += 1
        else:
            summary["failed"] += 1

        summary["recipients"].append(
            {
                "name": responder.get("full_name"),
                "phone_number": responder.get("phone_number"),
                "status": "sent" if send_result.get("ok") else "failed",
                "error": send_result.get("error"),
            }
        )

    return summary

@app.post("/api/alerts/test-sms")
async def send_test_sms(body: SmsTestRequest, db=Depends(get_db), captain=Depends(captain_only)):
    if not SMS_API_URL:
        raise HTTPException(400, "SMS API is not configured. Set SMS_API_URL in backend/.env.")

    responders = await db.users.find({"is_active": True, "role": "responder"}).to_list(None)
    if not responders:
        raise HTTPException(400, "No active responders found. Add at least one responder user first.")

    camera = None
    if body.camera_id:
        camera = await db.cameras.find_one({"id": body.camera_id})
        if not camera:
            raise HTTPException(404, "Camera not found")

    if not camera:
        camera = await db.cameras.find_one({"map_latitude": {"$ne": None}, "map_longitude": {"$ne": None}})

    cam_name = camera["name"] if camera else "Unknown camera"
    cam_location = camera["location"] if camera else "Unknown location"

    default_test_message = SMS_TEST_MESSAGE.strip() if SMS_TEST_MESSAGE else ""
    base_message = body.message.strip() if body.message and body.message.strip() else (
        default_test_message
        if default_test_message
        else "SafeSight notice for {name}: alert log updated. Ref {ref}."
    )

    sent = 0
    failed = 0
    recipients = []

    for responder in responders:
        responder_name = responder.get("full_name") or "Responder"
        message = _format_test_sms_message(base_message, cam_name, cam_location, responder_name)
        if not message:
            message = f"SafeSight notice for {responder_name}. Ref {uuid.uuid4().hex[:6].upper()}."

        send_result = await _send_sms_via_api(responder.get("phone_number", ""), message)
        if not send_result.get("ok") and _provider_rejected_spam(send_result):
            fallback_template = SMS_TEST_SPAM_FALLBACK_MESSAGE.strip() if SMS_TEST_SPAM_FALLBACK_MESSAGE else ""
            fallback_message = _format_test_sms_message(
                fallback_template,
                cam_name,
                cam_location,
                responder_name,
            )
            if fallback_message and fallback_message != message:
                fallback_result = await _send_sms_via_api(responder.get("phone_number", ""), fallback_message)
                fallback_result["used_spam_fallback"] = True
                fallback_result["initial_error"] = send_result.get("error")
                send_result = fallback_result
        stored_message = send_result.get("message_used") or message
        await _store_alert_record(
            db=db,
            collision_id=None,
            user_doc=responder,
            message=stored_message,
            send_result=send_result,
            is_test=True,
        )

        if send_result.get("ok"):
            sent += 1
        else:
            failed += 1

        recipients.append({
            "name": responder.get("full_name"),
            "phone_number": responder.get("phone_number"),
            "status": "sent" if send_result.get("ok") else "failed",
            "error": send_result.get("error"),
        })

    return {
        "message": "Test SMS dispatch completed.",
        "total_recipients": len(responders),
        "sent": sent,
        "failed": failed,
        "recipients": recipients,
    }

# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
# DASHBOARD STATS
# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
@app.get("/api/dashboard/stats")
async def dashboard_stats(db=Depends(get_db), _=Depends(get_current_user)):
    total_cameras  = await db.cameras.count_documents({})
    active_cameras = await db.cameras.count_documents({"status": "active"})
    total_col      = await db.collisions.count_documents({})
    pending_col    = await db.collisions.count_documents({"status_id": "pending"})
    total_alerts   = await db.alerts.count_documents({})
    return {
        "total_cameras":   total_cameras,
        "active_cameras":  active_cameras,
        "total_collisions": total_col,
        "pending_collisions": pending_col,
        "total_alerts":    total_alerts,
    }

# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
# HEALTH
# ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "SafeSight API"}
