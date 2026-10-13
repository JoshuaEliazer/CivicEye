
from pathlib import Path, PurePosixPath
from collections import Counter
import hashlib
import random
import zipfile
import yaml

ROOT = Path(__file__).resolve().parent
DOWNLOADS = Path.home() / "Downloads"
OUT = ROOT / "data"

SOURCES = [
    {
        "kind": "pothole",
        "zip": "Pothole detection.v2i.yolo26.zip",
        "map": {2: 0},
    },
    {
        "kind": "leakage",
        "zip": "water leak.v3i.yolo26.zip",
        "map": {0: 1},
    },
    {
        "kind": "garbage",
        "zip": "YOLO Waste Detection.v1-v1.yolo26.zip",
        "map": {
            0: 2, 1: 2, 2: 2, 3: 2, 7: 2, 8: 2, 9: 2,
            10: 2, 12: 2, 13: 2, 15: 2, 16: 2, 17: 2,
            18: 2, 19: 2, 20: 2, 21: 2, 22: 2, 23: 2,
            24: 2, 25: 2, 26: 2, 27: 2, 28: 2, 29: 2,
            30: 2, 31: 2, 32: 2, 34: 2, 35: 2, 36: 2,
            37: 2, 38: 2, 39: 2, 40: 2, 41: 2,
        },
    },
]

SPLITS = ("train", "valid", "test")
GARBAGE_TRAIN_CAP = 2500
RANDOM_SEED = 42
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def normalized_entries(z):
    # Normalize ZIP paths regardless of slash convention.
    return {
        name.replace("\\", "/").lstrip("/"): name
        for name in z.namelist()
    }


def read_target_labels(text, class_map):
    result = []

    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue

        try:
            source_class = int(parts[0])
            x, y, w, h = map(float, parts[1:5])
        except ValueError:
            continue

        if source_class not in class_map:
            continue

        if not all(0.0 <= v <= 1.0 for v in (x, y, w, h)):
            continue
        if w <= 0 or h <= 0:
            continue

        result.append(
            f"{class_map[source_class]} "
            f"{x:.8f} {y:.8f} {w:.8f} {h:.8f}"
        )

    return result


def collect_records(source):
    zip_path = DOWNLOADS / source["zip"]
    if not zip_path.is_file():
        raise FileNotFoundError(f"ZIP not found: {zip_path}")

    records = []
    with zipfile.ZipFile(zip_path) as z:
        entries = normalized_entries(z)

        for image_path in entries:
            p = PurePosixPath(image_path)
            if (
                p.suffix.lower() not in IMAGE_EXTENSIONS
                or len(p.parts) < 3
                or p.parent.parent.name.lower() not in SPLITS
                or p.parent.name.lower() != "images"
            ):
                continue

            split = p.parent.parent.name.lower()
            label_path = str(
                p.parent.parent / "labels" / (p.stem + ".txt")
            )
            original_label = entries.get(label_path)

            if original_label is None:
                continue

            raw_label = z.read(original_label).decode(
                "utf-8", errors="ignore"
            )
            labels = read_target_labels(raw_label, source["map"])
            if not labels:
                continue

            image_bytes = z.read(entries[image_path])
            digest = hashlib.sha256(image_bytes).hexdigest()

            records.append({
                "kind": source["kind"],
                "split": split,
                "image_path": image_path,
                "label_lines": labels,
                "digest": digest,
                "image_bytes": image_bytes,
            })

    return records


def main():
    if OUT.exists() and any(OUT.iterdir()):
        raise RuntimeError(
            f"{OUT} already contains files. "
            "Move or rename that folder before rebuilding; "
            "this script will not overwrite it."
        )

    print("Reading ZIPs and filtering target-class annotations...")
    all_records = []

    for source in SOURCES:
        records = collect_records(source)
        counts = Counter(r["split"] for r in records)
        print(f'{source["kind"]}: {len(records)} usable images; '
              f'splits={dict(counts)}')

        if not any(r["split"] == "train" for r in records):
            raise RuntimeError(
                f'No usable training images for {source["kind"]}.'
            )
        all_records.extend(records)

    # Deduplicate exact image content globally, preferring train,
    # then validation, then test. This prevents exact-image split leakage.
    split_priority = {"train": 0, "valid": 1, "test": 2}
    all_records.sort(
        key=lambda r: (
            split_priority[r["split"]],
            r["kind"],
            r["image_path"],
        )
    )

    seen_hashes = set()
    unique_records = []
    duplicate_count = 0

    for record in all_records:
        if record["digest"] in seen_hashes:
            duplicate_count += 1
            continue
        seen_hashes.add(record["digest"])
        unique_records.append(record)

    print("Exact duplicate images skipped:", duplicate_count)

    # Cap only garbage TRAIN data; preserve validation and test data.
    garbage_train = [
        r for r in unique_records
        if r["kind"] == "garbage" and r["split"] == "train"
    ]
    if len(garbage_train) > GARBAGE_TRAIN_CAP:
        rng = random.Random(RANDOM_SEED)
        keep_ids = {
            id(r) for r in rng.sample(
                garbage_train, GARBAGE_TRAIN_CAP
            )
        }
        unique_records = [
            r for r in unique_records
            if not (
                r["kind"] == "garbage"
                and r["split"] == "train"
                and id(r) not in keep_ids
            )
        ]

    # Ensure all required classes remain represented in training.
    train_kinds = {
        r["kind"] for r in unique_records if r["split"] == "train"
    }
    if train_kinds != {"pothole", "leakage", "garbage"}:
        raise RuntimeError(
            f"Missing class in training split: {train_kinds}"
        )

    print("Writing final dataset...")
    for split in SPLITS:
        (OUT / split / "images").mkdir(parents=True, exist_ok=True)
        (OUT / split / "labels").mkdir(parents=True, exist_ok=True)

    counts = Counter()
    boxes = Counter()

    for i, record in enumerate(unique_records):
        split = record["split"]
        suffix = PurePosixPath(record["image_path"]).suffix.lower()
        filename = f'{record["kind"]}_{i:06d}{suffix}'

        image_out = OUT / split / "images" / filename
        label_out = OUT / split / "labels" / f"{Path(filename).stem}.txt"

        image_out.write_bytes(record["image_bytes"])
        label_out.write_text(
            "\n".join(record["label_lines"]) + "\n",
            encoding="utf-8",
        )

        counts[(split, record["kind"])] += 1
        boxes[(split, record["kind"])] += len(record["label_lines"])

    data_yaml = {
        "path": OUT.resolve().as_posix(),
        "train": "train/images",
        "val": "valid/images",
        "test": "test/images",
        "nc": 3,
        "names": ["pothole", "leakage", "garbage"],
    }
    (OUT / "data.yaml").write_text(
        yaml.safe_dump(data_yaml, sort_keys=False),
        encoding="utf-8",
    )

    print("\nFINAL DATASET COUNTS")
    for split in SPLITS:
        print(f"\n{split.upper()}")
        for kind in ("pothole", "leakage", "garbage"):
            print(
                f"  {kind:8s}: {counts[(split, kind)]:5d} images, "
                f"{boxes[(split, kind)]:6d} boxes"
            )

    print("\nDataset YAML:", OUT / "data.yaml")
    print("Dataset preparation completed.")


if __name__ == "__main__":
    main()
