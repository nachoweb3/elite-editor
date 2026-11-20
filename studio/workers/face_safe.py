"""Sample faces in an output video range so overlays can avoid every detected face."""
import json
import sys
from pathlib import Path

import cv2
import mediapipe as mp

GRID_COLS = 8
GRID_ROWS = 6
# Una muestra por segundo permite seguir una cara con suavidad sin analizar
# todos los fotogramas de un short de 30-60 segundos.
SAMPLE_EVERY = 30

video, request_file, output_file = sys.argv[1:4]
request = json.loads(Path(request_file).read_text(encoding="utf-8"))
cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
duration = frame_count / fps if frame_count else 0.0

model = Path(__file__).resolve().parents[1] / "models/face_landmarker.task"
detector = mp.tasks.vision.FaceLandmarker.create_from_options(
    mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=5,
        min_face_detection_confidence=0.35,
    )
)
yunet_model = Path(__file__).resolve().parents[1] / "models/face_detection_yunet_2023mar.onnx"
yunet = (
    cv2.FaceDetectorYN.create(str(yunet_model), "", (960, 960), 0.3, 0.3, 5000)
    if yunet_model.exists()
    else None
)

results = []
for requested in request.get("ranges", []):
    start = max(0.0, float(requested["start"]))
    end = min(duration or float(requested["end"]), float(requested["end"]))
    first = max(0, int(round(start * fps)))
    last = min(frame_count - 1, int(round(end * fps))) if frame_count else 0
    cap.set(cv2.CAP_PROP_POS_FRAMES, first)
    faces = []
    seen = set()
    frames = 0
    detected_frames = 0
    grid = [[0.0 for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]
    samples = []
    for frame_index in range(first, last + 1):
        ok, frame = cap.read()
        if not ok:
            break
        frames += 1
        height, width = frame.shape[:2]
        scaled = cv2.resize(frame, (960, max(1, round(height * 960 / width))))

        # Text, UI panels and dense desktop content produce many edges. The grid
        # lets the overlay pick a calm corner instead of covering readable text.
        if frame_index % 3 == 0:
            gray = cv2.cvtColor(scaled, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 70, 160)
            for row in range(GRID_ROWS):
                y0 = round(row * edges.shape[0] / GRID_ROWS)
                y1 = round((row + 1) * edges.shape[0] / GRID_ROWS)
                for col in range(GRID_COLS):
                    x0 = round(col * edges.shape[1] / GRID_COLS)
                    x1 = round((col + 1) * edges.shape[1] / GRID_COLS)
                    cell = edges[y0:y1, x0:x1]
                    if cell.size:
                        density = float(cv2.countNonZero(cell)) / float(cell.size)
                        grid[row][col] = max(grid[row][col], density)
        rgb = cv2.cvtColor(scaled, cv2.COLOR_BGR2RGB)
        found = []
        try:
            detected = detector.detect(
                mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            )
            for landmarks in detected.face_landmarks:
                xs = [max(0.0, min(1.0, point.x)) for point in landmarks]
                ys = [max(0.0, min(1.0, point.y)) for point in landmarks]
                found.append(
                    {
                        "x": min(xs),
                        "y": min(ys),
                        "w": max(xs) - min(xs),
                        "h": max(ys) - min(ys),
                    }
                )
        except Exception:
            pass
        if yunet is not None:
            try:
                yunet.setInputSize((scaled.shape[1], scaled.shape[0]))
                _, detected_faces = yunet.detect(scaled)
                for face in detected_faces if detected_faces is not None else []:
                    x, y, w, h = [float(value) for value in face[:4]]
                    score = float(face[-1])
                    if score < 0.3:
                        continue
                    found.append(
                        {
                            "x": max(0.0, min(1.0, x / scaled.shape[1])),
                            "y": max(0.0, min(1.0, y / scaled.shape[0])),
                            "w": max(0.0, min(1.0, w / scaled.shape[1])),
                            "h": max(0.0, min(1.0, h / scaled.shape[0])),
                        }
                    )
            except Exception:
                pass
        if found:
            detected_frames += 1
            if (frame_index - first) % SAMPLE_EVERY == 0:
                largest = max(found, key=lambda face: face["w"] * face["h"])
                samples.append({"t": frame_index / fps, "face": largest})
        elif (frame_index - first) % SAMPLE_EVERY == 0:
            samples.append({"t": frame_index / fps, "face": None})
        for face in found:
            key = (
                round(face["x"], 3),
                round(face["y"], 3),
                round(face["w"], 3),
                round(face["h"], 3),
            )
            if key not in seen:
                seen.add(key)
                faces.append(face)
    results.append(
        {
            "start": start,
            "end": end,
            "frames": frames,
            "detectedFrames": detected_frames,
            "faces": faces,
            "samples": samples,
            "grid": grid,
            "gridCols": GRID_COLS,
            "gridRows": GRID_ROWS,
        }
    )

cap.release()
detector.close()
Path(output_file).write_text(
    json.dumps(
        {
            "ranges": results,
            "fps": fps,
            "frameCount": frame_count,
            "yunet": yunet is not None,
        }
    ),
    encoding="utf-8",
)
