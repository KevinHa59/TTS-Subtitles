import json
import os
import re
import sys
import time
from collections import Counter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def get_result_dict(result):
    value = getattr(result, "json", None)
    if callable(value):
        value = value()
    if value is None:
        value = result
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except Exception:
            return {}
    if not isinstance(value, dict):
        return {}
    return value.get("res", value)


def extract_lines(result, threshold):
    data = get_result_dict(result)
    texts = data.get("rec_texts") or []
    scores = data.get("rec_scores") or []
    boxes = data.get("rec_boxes")
    if boxes is None:
        boxes = data.get("rec_polys")
    if boxes is None:
        boxes = []
    items = []
    for index, text in enumerate(texts):
        text = str(text).strip()
        try:
            score = float(scores[index]) if index < len(scores) else 1.0
        except (TypeError, ValueError):
            score = 0.0
        if not text or score < threshold:
            continue
        y = 0.0
        x = float(index)
        if index < len(boxes):
            try:
                coords = boxes[index].tolist() if hasattr(boxes[index], "tolist") else boxes[index]
                if len(coords) == 4 and not isinstance(coords[0], (list, tuple)):
                    x, y = float(coords[0]), float(coords[1])
                else:
                    flat = [point for point in coords]
                    x = min(float(point[0]) for point in flat)
                    y = sum(float(point[1]) for point in flat) / len(flat)
            except Exception:
                pass
        items.append((y, x, text, score))
    if not items:
        return "", 0.0
    items.sort(key=lambda item: (item[0], item[1]))
    line_groups = []
    for item in items:
        if not line_groups or abs(item[0] - line_groups[-1][0][0]) > 22:
            line_groups.append([item])
        else:
            line_groups[-1].append(item)
    lines = ["".join(part[2] for part in group).strip() for group in line_groups]
    text = "\n".join(line for line in lines if line)
    score = sum(part[3] for part in items) / len(items)
    return text, score


def image_similarity(left, right, cv2):
    if left is None or right is None:
        return 0.0
    first = cv2.resize(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY), (160, 48), interpolation=cv2.INTER_AREA).astype("float32")
    second = cv2.resize(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY), (160, 48), interpolation=cv2.INTER_AREA).astype("float32")
    mean_a, mean_b = first.mean(), second.mean()
    var_a, var_b = first.var(), second.var()
    cov = ((first - mean_a) * (second - mean_b)).mean()
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    denominator = (mean_a ** 2 + mean_b ** 2 + c1) * (var_a + var_b + c2)
    if denominator <= 0:
        return 1.0 if (first == second).all() else 0.0
    return ((2 * mean_a * mean_b + c1) * (2 * cov + c2)) / denominator


def gray_similarity(first, second):
    if first is None or second is None:
        return 0.0
    first = first.astype("float32")
    second = second.astype("float32")
    mean_a, mean_b = first.mean(), second.mean()
    var_a, var_b = first.var(), second.var()
    cov = ((first - mean_a) * (second - mean_b)).mean()
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    denominator = (mean_a ** 2 + mean_b ** 2 + c1) * (var_a + var_b + c2)
    return 1.0 if denominator <= 0 and (first == second).all() else (
        ((2 * mean_a * mean_b + c1) * (2 * cov + c2)) / denominator if denominator > 0 else 0.0
    )


def box_crop(image, polygons, cv2):
    if polygons is None or len(polygons) == 0:
        return None
    points = []
    for polygon in polygons:
        try:
            points.extend(polygon.tolist() if hasattr(polygon, "tolist") else polygon)
        except Exception:
            continue
    if not points:
        return None
    height, width = image.shape[:2]
    x1 = max(0, min(width - 1, int(min(point[0] for point in points))))
    y1 = max(0, min(height - 1, int(min(point[1] for point in points))))
    x2 = max(x1 + 1, min(width, int(max(point[0] for point in points)) + 1))
    y2 = max(y1 + 1, min(height, int(max(point[1] for point in points)) + 1))
    return image[y1:y2, x1:x2]


def recognize_batch(pipeline, candidates, confidence_threshold, converter):
    crops = []
    owners = []
    for candidate_index, candidate in enumerate(candidates):
        candidate["recognized"] = []
        polygons = candidate["polygons"]
        if polygons is None or len(polygons) == 0:
            continue
        line_crops = list(pipeline._crop_by_polys(candidate["image"], polygons))
        for line_index, crop in enumerate(line_crops):
            if crop is not None and crop.size:
                crops.append(crop)
                owners.append((candidate_index, candidate["polygons"][line_index]))
    if not crops:
        return
    rec_results = list(pipeline.text_rec_model(crops))
    for owner, result in zip(owners, rec_results):
        candidate_index, polygon = owner
        try:
            text = str(result.get("rec_text", "")).strip()
            score = float(result.get("rec_score", 0.0))
        except (AttributeError, TypeError, ValueError):
            continue
        if text and score >= confidence_threshold:
            if converter:
                text = converter.convert(text)
            points = polygon.tolist() if hasattr(polygon, "tolist") else polygon
            x = min(float(point[0]) for point in points)
            y = sum(float(point[1]) for point in points) / len(points)
            candidates[candidate_index]["recognized"].append((y, x, text, score))
    for candidate in candidates:
        candidate["recognized"].sort(key=lambda item: (item[0], item[1]))
        candidate["text"] = "\n".join(item[2] for item in candidate["recognized"])
        candidate["score"] = (
            sum(item[3] for item in candidate["recognized"]) / len(candidate["recognized"])
            if candidate["recognized"] else 0.0
        )


def normalize(text):
    return re.sub(r"\s+", "", text).strip()


def levenshtein_ratio(left, right):
    left = normalize(left)
    right = normalize(right)
    if not left and not right:
        return 1.0
    previous = list(range(len(right) + 1))
    for row, char_left in enumerate(left, start=1):
        current = [row]
        for column, char_right in enumerate(right, start=1):
            current.append(min(
                current[column - 1] + 1,
                previous[column] + 1,
                previous[column - 1] + (char_left != char_right),
            ))
        previous = current
    return 1.0 - previous[-1] / max(len(left), len(right), 1)


def build_cues(observations, duration, interval, similarity_threshold, max_merge_gap, minimum_duration):
    groups = []
    active = []
    last_detection = None
    for observation in observations:
        timestamp, text, confidence = observation[:3]
        if not text:
            if active and last_detection is not None and timestamp - last_detection > max(interval * 1.6, 0.7):
                groups.append(active)
                active = []
                last_detection = None
            continue
        if active:
            previous = max(active, key=lambda item: item[0])[1]
            similarity = levenshtein_ratio(previous, text)
            gap = timestamp - last_detection if last_detection is not None else 0
            if gap > max_merge_gap or similarity < similarity_threshold / 100.0:
                groups.append(active)
                active = []
        active.append((timestamp, text, confidence))
        last_detection = timestamp
    if active:
        groups.append(active)

    cues = []
    for group in groups:
        variants = Counter(normalize(item[1]) for item in group)
        chosen = max(variants, key=lambda value: (variants[value], len(value)))
        representative = max((item[1] for item in group if normalize(item[1]) == chosen), key=len)
        start = max(0.0, group[0][0] - interval * 0.5)
        end = min(duration, group[-1][0] + interval * 0.5)
        if end <= start:
            end = min(duration, start + interval)
        if representative and end - start >= minimum_duration:
            cues.append({
                "startTime": round(start, 3),
                "endTime": round(end, 3),
                "text": representative,
                "confidence": round(sum(item[2] for item in group) / len(group), 4),
                "alignment": group[0][3] if len(group[0]) > 3 else "bottom-center",
            })
    return cues


def main():
    if len(sys.argv) != 5:
        raise RuntimeError("Usage: worker.py VIDEO DET_MODEL REC_MODEL OPTIONS_JSON")
    video_path, detection_model, recognition_model = sys.argv[1:4]
    options = json.loads(sys.argv[4])
    confidence_threshold = max(0.0, min(1.0, float(options.get("confidence", 75)) / 100))

    # Paddle's oneDNN CPU kernel currently fails on the PP-OCRv5 det graph
    # with an unsupported PIR ArrayAttribute. Force the portable CPU kernels.
    os.environ["FLAGS_use_mkldnn"] = "0"

    import cv2
    from paddleocr import PaddleOCR
    converter = None
    if options.get("normalizeTraditional"):
        from opencc import OpenCC
        converter = OpenCC("t2s")

    emit({"type": "progress", "processed": 0, "total": 0, "message": "Đang nạp PaddleOCR vào bộ nhớ…"})
    ocr = PaddleOCR(
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_detection_model_dir=detection_model,
        text_recognition_model_name="PP-OCRv5_mobile_rec",
        text_recognition_model_dir=recognition_model,
        device="cpu",
        enable_mkldnn=False,
        cpu_threads=max(1, min(32, int(options.get("cpuThreads", 8)))),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=bool(options.get("angleClassification", False)),
    )
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise RuntimeError("Không mở được video bằng OpenCV.")
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if frame_count > 0 else 0.0
    time_start = max(0.0, float(options.get("timeStart", 0)))
    time_end = min(duration, float(options["timeEnd"])) if options.get("timeEnd") is not None else duration
    if time_end <= time_start:
        raise RuntimeError("Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc/video.")
    step = max(1, int(options.get("framesToSkip", 1)) + 1)
    interval = step / fps
    start_frame = max(0, int(time_start * fps))
    end_frame = min(frame_count, int(time_end * fps)) if frame_count else 0
    total_samples = max(1, (max(0, end_frame - start_frame) + step - 1) // step) if frame_count else 0
    zones = []
    if options.get("useFullFrame"):
        zones.append(("full", options.get("alignment1", "bottom-center")))
    elif all(options.get(key) is not None for key in ("cropX", "cropY", "cropWidth", "cropHeight")):
        zones.append(("custom", options.get("alignment1", "bottom-center")))
    else:
        zones.append((options.get("zone1", "lower"), options.get("alignment1", "bottom-center")))
        if options.get("useDualZone"):
            zones.append((options.get("zone2", "center"), options.get("alignment2", "bottom-center")))
    observations = [[] for _ in zones]
    pipeline = ocr.paddlex_pipeline._pipeline
    previous_unique = [None for _ in zones]
    previous_gray = [None for _ in zones]
    previous_observation = [None for _ in zones]
    pending_records = []
    pending_observations = [[] for _ in zones]
    batch_size = 24
    frame_index = 0
    sampled = 0
    last_report = 0.0

    def flush_batch():
        if pending_records:
            detected = list(pipeline.text_det_model([record["image"] for record in pending_records]))
            unique_candidates = []
            for record, detection in zip(pending_records, detected):
                polygons = pipeline._sort_boxes(detection.get("dt_polys", []))
                record["polygons"] = polygons
                tight = box_crop(record["image"], polygons, cv2)
                if tight is None or not tight.size:
                    previous_unique[record["zone"]] = None
                    record["reference"] = None
                    continue
                previous = previous_unique[record["zone"]]
                if previous is not None and image_similarity(tight, previous["tight"], cv2) * 100 >= float(options.get("ssimThreshold", 92)):
                    record["reference"] = previous
                    continue
                candidate = {"image": record["image"], "polygons": polygons, "tight": tight, "text": "", "score": 0.0}
                record["reference"] = candidate
                unique_candidates.append(candidate)
                previous_unique[record["zone"]] = candidate
            recognize_batch(pipeline, unique_candidates, confidence_threshold, converter)

        for zone_index, items in enumerate(pending_observations):
            for item in items:
                reference = item.get("reference", item)
                seen = set()
                while isinstance(reference, dict) and "reference" in reference and id(reference) not in seen:
                    seen.add(id(reference))
                    reference = reference["reference"]
                text = reference.get("text", "") if isinstance(reference, dict) else ""
                score = reference.get("score", 0.0) if isinstance(reference, dict) else 0.0
                item["text"], item["score"] = text, score
                item.pop("reference", None)
                item.pop("image", None)
                item.pop("polygons", None)
                observations[zone_index].append((item["timestamp"], text, score, item["alignment"]))
            items.clear()
        pending_records.clear()

    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if frame_index >= end_frame:
            break
        if frame_index >= start_frame and (frame_index - start_frame) % step == 0:
            height, width = frame.shape[:2]
            timestamp = frame_index / fps
            for zone_index, (zone_name, alignment) in enumerate(zones):
                if zone_name == "lower":
                    crop = frame[int(height * 2 / 3):height, :]
                elif zone_name == "center":
                    crop = frame[int(height / 3):int(height * 2 / 3), :]
                elif zone_name == "upper":
                    crop = frame[:int(height / 3), :]
                elif zone_name == "custom":
                    crop_x = max(0, min(width, int(options["cropX"])))
                    crop_y = max(0, min(height, int(options["cropY"])))
                    crop_width = max(0, min(width - crop_x, int(options["cropWidth"])))
                    crop_height = max(0, min(height - crop_y, int(options["cropHeight"])))
                    crop = frame[crop_y:crop_y + crop_height, crop_x:crop_x + crop_width]
                    if crop.size == 0:
                        continue
                else:
                    crop = frame
                threshold = options.get("brightnessThreshold")
                if threshold is not None:
                    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                    crop = crop.copy()
                    crop[gray < int(threshold)] = 0
                max_width = int(options.get("maxImageWidth", 720) or 0)
                if max_width > 0 and crop.shape[1] > max_width:
                    scaled_height = max(1, round(crop.shape[0] * max_width / crop.shape[1]))
                    crop = cv2.resize(crop, (max_width, scaled_height), interpolation=cv2.INTER_AREA)
                else:
                    crop = crop.copy()
                gray_small = cv2.resize(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), (96, 32), interpolation=cv2.INTER_AREA)
                if previous_gray[zone_index] is not None and gray_similarity(gray_small, previous_gray[zone_index]) * 100 >= float(options.get("ssimThreshold", 92)):
                    record = {"timestamp": timestamp, "zone": zone_index, "alignment": alignment,
                              "reference": previous_observation[zone_index]}
                else:
                    record = {"timestamp": timestamp, "zone": zone_index, "alignment": alignment,
                              "image": crop}
                    previous_gray[zone_index] = gray_small
                    pending_records.append(record)
                previous_observation[zone_index] = record
                pending_observations[zone_index].append(record)
            sampled += 1
            if len(pending_records) >= batch_size:
                flush_batch()
            now = time.time()
            if now - last_report >= 0.5:
                emit({
                    "type": "progress", "processed": sampled, "total": total_samples,
                    "message": f"Đang nhận diện theo nhóm · {sampled}/{total_samples}",
                })
                last_report = now
        frame_index += 1
    capture.release()
    flush_batch()
    if duration <= 0:
        duration = frame_index / fps
    cues = []
    for zone_observations in observations:
        cues.extend(build_cues(
            zone_observations, duration, interval,
            float(options.get("similarity", 80)),
            float(options.get("maxMergeGap", 0.6)),
            float(options.get("minimumDuration", 0.2)),
        ))
    cues.sort(key=lambda cue: (cue["startTime"], cue["alignment"]))
    emit({"type": "result", "subtitles": cues})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        raise
