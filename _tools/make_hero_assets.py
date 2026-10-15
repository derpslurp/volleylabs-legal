"""Makes the launch site's hero frames, skeletons, icon and app still.

Everyone except the owner is blurred: a YOLO segmentation model finds the
person under the owner's hint point (owner_hints.json) and any ball, and the
rest of the frame is blurred, so spectators the detector misses are covered
too. The skeleton comes from the same MediaPipe model the app's pipeline uses,
run on the owner's crop, in the app's joint order.

Run with the ServeSense backend venv, from a scratch directory (the seg model
downloads into the working directory):
  PY -I LEGAL/_tools/make_hero_assets.py --ss SS --site LEGAL --debug SCRATCH/hero-debug
"""
import argparse
import json
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from ultralytics import YOLO

# No takeoff: in that frame another player's face sits behind the owner's head
# and the detector does not see them as a separate person, so it cannot be blurred.
NAMES = ("contact", "follow", "landing")
JOINTS = (0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28)  # app/pipeline/thumbnail_pose.py
BONES = ((1, 2), (1, 3), (3, 5), (2, 4), (4, 6), (1, 7), (2, 8), (7, 8),
         (7, 9), (9, 11), (8, 10), (10, 12))  # mobile/lib/pose.ts
PERSON, BALL = 0, 32  # COCO classes
BLUR_SIGMA = 22       # at 600 px wide: faces and jersey numbers unreadable
DIM = 0.72            # the blurred scene is darkened so the player stands out
KEEP_GROW_PX = 6      # grow the owner mask so the edges of limbs stay sharp
CROP_PAD = 0.2        # padding around the owner box for the pose model


def owner_mask(seg: YOLO, img: np.ndarray, hint: list[float]) -> tuple[np.ndarray, np.ndarray]:
    """(keep mask, owner box x1 y1 x2 y2) for the person under the hint plus any ball."""
    h, w = img.shape[:2]
    res = seg(img, conf=0.15, verbose=False)[0]
    if res.masks is None:
        raise SystemExit("segmentation found nothing")
    masks = np.stack([cv2.resize(m, (w, h)) for m in res.masks.data.cpu().numpy()]) > 0.5
    cls = res.boxes.cls.cpu().numpy().astype(int)
    hx, hy = int(hint[0] * w), int(hint[1] * h)
    under = [i for i in range(len(cls)) if cls[i] == PERSON and masks[i][hy, hx]]
    if not under:
        raise SystemExit(f"no person under hint {hint}")
    owner = min(under, key=lambda i: masks[i].sum())  # the nearest, not a big box behind
    keep = masks[owner].copy()
    for i in range(len(cls)):
        if cls[i] == BALL:
            keep |= masks[i]
    return keep, res.boxes.xyxy[owner].cpu().numpy()


def blur_others(img: np.ndarray, keep: np.ndarray) -> np.ndarray:
    grown = cv2.dilate(keep.astype(np.uint8), np.ones((2 * KEEP_GROW_PX + 1,) * 2, np.uint8))
    alpha = cv2.GaussianBlur(grown.astype(np.float32), (0, 0), 3)[..., None]
    scene = cv2.GaussianBlur(img, (0, 0), BLUR_SIGMA).astype(np.float32) * DIM
    return (img.astype(np.float32) * alpha + scene * (1 - alpha)).clip(0, 255).astype(np.uint8)


def owner_pose(landmarker, img: np.ndarray, box: np.ndarray) -> list[list[float]]:
    h, w = img.shape[:2]
    x1, y1, x2, y2 = box
    px, py = (x2 - x1) * CROP_PAD, (y2 - y1) * CROP_PAD
    x1, y1 = int(max(0, x1 - px)), int(max(0, y1 - py))
    x2, y2 = int(min(w, x2 + px)), int(min(h, y2 + py))
    rgb = np.ascontiguousarray(cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2RGB))
    found = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not found.pose_landmarks:
        raise SystemExit("no pose found on the owner")
    lms = found.pose_landmarks[0]
    return [[round((x1 + lms[j].x * (x2 - x1)) / w, 4),
             round((y1 + lms[j].y * (y2 - y1)) / h, 4),
             round(lms[j].visibility, 2)] for j in JOINTS]


def debug_overlay(img: np.ndarray, pose: list[list[float]], hint: list[float]) -> np.ndarray:
    out = img.copy()
    h, w = img.shape[:2]

    def pt(p):
        return int(p[0] * w), int(p[1] * h)

    for a, b in BONES:
        if pose[a][2] >= 0.5 and pose[b][2] >= 0.5:
            cv2.line(out, pt(pose[a]), pt(pose[b]), (255, 160, 110), 4)
    cv2.circle(out, pt(hint), 8, (0, 0, 255), -1)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ss", type=Path, required=True)
    ap.add_argument("--site", type=Path, required=True)
    ap.add_argument("--debug", type=Path, required=True)
    args = ap.parse_args()
    onboarding = args.ss / "mobile" / "assets" / "onboarding"
    out = args.site / "assets"
    out.mkdir(exist_ok=True)
    args.debug.mkdir(parents=True, exist_ok=True)
    hints = json.loads((Path(__file__).parent / "owner_hints.json").read_text())

    seg = YOLO("yolov8s-seg.pt")
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(
            model_asset_path=str(args.ss / "backend" / "models" / "pose_landmarker_lite.task")),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
    )
    poses = {}
    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as landmarker:
        for name in NAMES:
            img = cv2.imread(str(onboarding / f"{name}.jpg"))
            keep, box = owner_mask(seg, img, hints[name])
            poses[name] = owner_pose(landmarker, img, box)
            blurred = blur_others(img, keep)
            cv2.imwrite(str(out / f"hero-{name}.webp"), blurred, [cv2.IMWRITE_WEBP_QUALITY, 80])
            cv2.imwrite(str(out / f"hero-{name}.jpg"), blurred, [cv2.IMWRITE_JPEG_QUALITY, 82])
            cv2.imwrite(str(args.debug / f"{name}.jpg"), debug_overlay(blurred, poses[name], hints[name]))
    (out / "hero-poses.js").write_text(
        "// Made by _tools/make_hero_assets.py. [x, y, visibility] per joint, app order.\n"
        f"window.HERO_POSES = {json.dumps(poses, separators=(',', ':'))};\n", encoding="utf-8")

    icon = cv2.imread(str(args.ss / "mobile" / "assets" / "icon.png"))
    cv2.imwrite(str(out / "icon-180.png"), cv2.resize(icon, (180, 180), interpolation=cv2.INTER_AREA))

    # One still from the result-screen recording, not the video: its first
    # seconds show a bystander's face. Frame 191 is the breakdown and progress
    # chart, with nobody in it.
    cap = cv2.VideoCapture(str(onboarding / "results-demo.mp4"))
    cap.set(cv2.CAP_PROP_POS_FRAMES, 191)
    ok, frame = cap.read()
    if not ok:
        raise SystemExit("could not read the demo video")
    cv2.imwrite(str(out / "results-progress.webp"), frame, [cv2.IMWRITE_WEBP_QUALITY, 80])
    print("done:", ", ".join(f"{n} {sum(p[2] >= 0.5 for p in poses[n])}/13 joints sure" for n in NAMES))


if __name__ == "__main__":
    main()
