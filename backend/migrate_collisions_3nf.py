from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import argparse
import os
import uuid

from dotenv import load_dotenv
from pymongo import MongoClient


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


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso_datetime(value: str | None) -> datetime | None:
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


def _normalize_collision_severity(value: str | None) -> str | None:
    if value is None:
        return None
    severity_value = str(value or "medium").strip().lower()
    if severity_value not in {"low", "medium", "high"}:
        severity_value = "medium"
    return severity_value


def _normalize_collision_type(value: str | None) -> str | None:
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


def _normalize_collision_status(value: str | None) -> str | None:
    if value is None:
        return None
    status_value = str(value or "").strip().lower()
    if status_value not in {"pending", "acknowledged", "responded", "resolved"}:
        return None
    return status_value


def _normalize_detection_boxes(raw_boxes: list | None) -> list:
    normalized = []
    if not isinstance(raw_boxes, list):
        return normalized

    for raw_box in raw_boxes:
        if not isinstance(raw_box, dict):
            continue

        coords = raw_box.get("coords")
        if not isinstance(coords, (list, tuple)) or len(coords) != 4:
            continue

        try:
            x1, y1, x2, y2 = [float(value) for value in coords]
        except Exception:
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

        normalized.append(
            {
                "coords": [x1, y1, x2, y2],
                "class_id": class_id,
                "class_name": str(raw_box.get("class_name") or "object"),
                "confidence": confidence_value,
                "track_id": raw_box.get("track_id"),
                "is_ghost": bool(raw_box.get("is_ghost")),
            }
        )

    return normalized


def _build_detection_docs(collision_id: str, collision_doc: dict) -> tuple[dict | None, list]:
    raw_boxes = collision_doc.get("detection_boxes") or collision_doc.get("boxes") or []
    boxes = _normalize_detection_boxes(raw_boxes)

    frame_width = collision_doc.get("detection_frame_width")
    frame_height = collision_doc.get("detection_frame_height")

    detection_doc = None
    box_docs = []

    if boxes or frame_width or frame_height or collision_doc.get("detection_pair_id"):
        detection_id = str(uuid.uuid4())
        detection_doc = {
            "id": detection_id,
            "collision_id": collision_id,
            "detection_pair_id": collision_doc.get("detection_pair_id"),
            "detection_frame_width": frame_width,
            "detection_frame_height": frame_height,
        }

        for box in boxes:
            coords = box.get("coords") or []
            if len(coords) != 4:
                continue
            x1, y1, x2, y2 = coords
            box_docs.append(
                {
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
                }
            )

    return detection_doc, box_docs


def _ensure_reference_data(db) -> None:
    for item in COLLISION_STATUS_REFERENCE:
        db.collision_statuses.update_one({"id": item["id"]}, {"$set": item}, upsert=True)
    for item in COLLISION_SEVERITY_REFERENCE:
        db.collision_severities.update_one({"id": item["id"]}, {"$set": item}, upsert=True)
    for item in COLLISION_TYPE_REFERENCE:
        db.collision_types.update_one({"id": item["id"]}, {"$set": item}, upsert=True)


def _build_user_lookup(users: list[dict]) -> dict:
    lookup = {}
    for user in users:
        if not isinstance(user, dict):
            continue
        user_id = user.get("id")
        username = str(user.get("username") or "").strip().lower()
        full_name = str(user.get("full_name") or "").strip().lower()
        if user_id:
            lookup[user_id] = user_id
        if username:
            lookup[username] = user_id
        if full_name:
            lookup[full_name] = user_id
    return lookup


def migrate(apply: bool, keep_legacy: bool) -> int:
    load_dotenv(Path(__file__).parent / ".env")
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "safesight")

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[db_name]

    _ensure_reference_data(db)

    collisions = list(db.collisions.find({}))
    if not collisions:
        print("No collisions found. Nothing to migrate.")
        return 0

    print(f"Found {len(collisions)} collision records.")

    if not apply:
        print("Dry run only. Re-run with --apply to write changes.")
        return 0

    if keep_legacy:
        if db.collisions_legacy.count_documents({}) == 0:
            db.collisions_legacy.insert_many(collisions)
            print("Backed up collisions into collisions_legacy.")
        else:
            print("collisions_legacy already has data; skipping backup.")

    db.collisions.delete_many({})
    db.collision_videos.delete_many({})
    db.collision_detections.delete_many({})
    db.collision_detection_boxes.delete_many({})
    db.collision_status_events.delete_many({})

    users = list(db.users.find({}))
    user_lookup = _build_user_lookup(users)

    migrated = 0
    for raw in collisions:
        collision_id = raw.get("id") or str(uuid.uuid4())
        timestamp_value = raw.get("timestamp") or raw.get("occurred_at")
        parsed_ts = _parse_iso_datetime(timestamp_value) if timestamp_value else None
        occurred_at = parsed_ts.isoformat() if parsed_ts else _utc_now_iso()

        status_id = _normalize_collision_status(raw.get("status")) or "pending"
        severity_id = _normalize_collision_severity(raw.get("severity"))
        type_id = _normalize_collision_type(raw.get("collision_type"))

        collision_doc = {
            "id": collision_id,
            "camera_id": raw.get("camera_id"),
            "confidence_score": raw.get("confidence_score"),
            "severity_id": severity_id,
            "type_id": type_id,
            "description": raw.get("description"),
            "status_id": status_id,
            "occurred_at": occurred_at,
            "created_at": raw.get("created_at") or occurred_at,
            "updated_at": raw.get("updated_at"),
        }
        db.collisions.insert_one(collision_doc)

        video_doc = {
            "id": str(uuid.uuid4()),
            "collision_id": collision_id,
            "video_status": raw.get("video_status") or "missing",
            "video_file_id": raw.get("video_file_id"),
            "video_filename": raw.get("video_filename"),
            "video_mime_type": raw.get("video_mime_type"),
            "video_duration_seconds": raw.get("video_duration_seconds"),
            "video_pre_event_seconds": raw.get("video_pre_event_seconds"),
            "video_post_event_seconds": raw.get("video_post_event_seconds"),
            "video_collision_at_second": raw.get("video_collision_at_second"),
            "video_recorded_at": raw.get("video_recorded_at"),
            "video_codec": raw.get("video_codec"),
            "video_error": raw.get("video_error"),
        }
        db.collision_videos.insert_one(video_doc)

        detection_doc, box_docs = _build_detection_docs(collision_id, raw)
        if detection_doc:
            db.collision_detections.insert_one(detection_doc)
            if box_docs:
                db.collision_detection_boxes.insert_many(box_docs)

        events = []
        ack_at = raw.get("acknowledged_at")
        if ack_at:
            actor_name = str(raw.get("acknowledged_by") or "").strip().lower()
            actor_id = user_lookup.get(actor_name) if actor_name else None
            events.append({
                "id": str(uuid.uuid4()),
                "collision_id": collision_id,
                "status_id": "acknowledged",
                "actor_user_id": actor_id,
                "changed_at": ack_at,
            })

        responded_at = raw.get("responded_at")
        if responded_at:
            actor_name = str(raw.get("responded_by") or "").strip().lower()
            actor_id = user_lookup.get(actor_name) if actor_name else None
            events.append({
                "id": str(uuid.uuid4()),
                "collision_id": collision_id,
                "status_id": "responded",
                "actor_user_id": actor_id,
                "changed_at": responded_at,
            })

        resolved_at = raw.get("resolved_at")
        if resolved_at:
            actor_name = str(raw.get("resolved_by") or "").strip().lower()
            actor_id = user_lookup.get(actor_name) if actor_name else None
            events.append({
                "id": str(uuid.uuid4()),
                "collision_id": collision_id,
                "status_id": "resolved",
                "actor_user_id": actor_id,
                "changed_at": resolved_at,
            })

        if not events:
            events.append({
                "id": str(uuid.uuid4()),
                "collision_id": collision_id,
                "status_id": status_id,
                "actor_user_id": None,
                "changed_at": occurred_at,
            })

        if events:
            db.collision_status_events.insert_many(events)

        migrated += 1

    print(f"Migration completed. Migrated {migrated} collisions.")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize collisions into 3NF collections.")
    parser.add_argument("--apply", action="store_true", help="Apply migration changes.")
    parser.add_argument("--keep-legacy", action="store_true", help="Backup legacy collisions into collisions_legacy.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    return migrate(apply=args.apply, keep_legacy=args.keep_legacy)


if __name__ == "__main__":
    raise SystemExit(main())
