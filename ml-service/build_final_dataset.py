from pathlib import Path
import shutil
import random
from collections import defaultdict

# ============================================================
# CivicEye Final Dataset Builder
#
# Classes:
#   0 = pothole
#   1 = leakage
#   2 = garbage
#
# Original datasets under dataset_sources/ are NEVER modified.
# ============================================================

BASE = Path(__file__).resolve().parent
SOURCE = BASE / "dataset_sources"
OUTPUT = BASE / "data"

SEED = 42

# Final number of garbage TRAIN images.
GARBAGE_TRAIN_TARGET = 1876

# Leakage has no validation split.
LEAKAGE_VAL_RATIO = 0.20

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp"
}

random.seed(SEED)


# ============================================================
# BASIC UTILITIES
# ============================================================

def get_images(folder):
    if not folder.exists():
        return []

    return sorted(
        [
            p for p in folder.iterdir()
            if p.is_file()
            and p.suffix.lower() in IMAGE_EXTENSIONS
        ],
        key=lambda p: p.name.lower()
    )


def read_labels(label_path):

    labels = []

    with open(label_path, "r", encoding="utf-8") as f:

        for raw in f:

            line = raw.strip()

            if not line:
                continue

            parts = line.split()

            if len(parts) != 5:
                raise ValueError(
                    f"Invalid YOLO label: {label_path}"
                )

            class_id = int(parts[0])

            values = [float(x) for x in parts[1:]]

            if not all(
                0.0 <= x <= 1.0
                for x in values
            ):
                raise ValueError(
                    f"Invalid coordinates: {label_path}"
                )

            labels.append(parts)

    return labels


def write_labels(label_path, labels):

    with open(
        label_path,
        "w",
        encoding="utf-8"
    ) as f:

        for parts in labels:
            f.write(" ".join(parts) + "\n")


def get_pairs(split_folder):

    image_dir = split_folder / "images"
    label_dir = split_folder / "labels"

    if not image_dir.exists():
        return []

    pairs = []

    for image in get_images(image_dir):

        label = label_dir / f"{image.stem}.txt"

        if label.exists():
            pairs.append((image, label))

    return pairs


def copy_pair(
    image,
    label,
    split,
    prefix,
    index
):

    labels = read_labels(label)

    if not labels:
        raise ValueError(
            f"Empty label: {label}"
        )

    new_stem = f"{prefix}_{index:06d}"

    destination_image = (
        OUTPUT
        / split
        / "images"
        / f"{new_stem}{image.suffix.lower()}"
    )

    destination_label = (
        OUTPUT
        / split
        / "labels"
        / f"{new_stem}.txt"
    )

    shutil.copy2(
        image,
        destination_image
    )

    write_labels(
        destination_label,
        labels
    )


def prepare_output():

    if OUTPUT.exists():

        print(
            "Removing previous final dataset..."
        )

        shutil.rmtree(OUTPUT)

    for split in ["train", "val", "test"]:

        (
            OUTPUT
            / split
            / "images"
        ).mkdir(
            parents=True,
            exist_ok=True
        )

        (
            OUTPUT
            / split
            / "labels"
        ).mkdir(
            parents=True,
            exist_ok=True
        )


# ============================================================
# GARBAGE SOURCE-CATEGORY STRATIFICATION
# ============================================================

def read_original_garbage_categories():

    """
    Read the ORIGINAL garbage dataset labels.

    The converted dataset has only CivicEye class 2,
    so original category information must be obtained
    from the original ZIP-extracted dataset.

    Returns:
        dictionary:
        original image stem -> set of source categories
    """

    raw_root = (
        SOURCE
        / "garbage"
        / "raw"
    )

    # The garbage ZIP was not extracted completely because
    # of Windows long-path issues. Therefore we first look
    # for the original extracted train dataset.

    train_images = (
        raw_root
        / "train"
        / "images"
    )

    train_labels = (
        raw_root
        / "train"
        / "labels"
    )

    if not train_images.exists() or not train_labels.exists():

        print(
            "WARNING: Original garbage train dataset "
            "not available at expected raw path."
        )

        return {}

    categories = {}

    for image in get_images(train_images):

        label = train_labels / f"{image.stem}.txt"

        if not label.exists():
            continue

        class_ids = set()

        with open(
            label,
            "r",
            encoding="utf-8"
        ) as f:

            for line in f:

                parts = line.strip().split()

                if len(parts) == 5:

                    class_ids.add(
                        int(parts[0])
                    )

        if class_ids:

            categories[image.stem] = class_ids

    return categories


def stratified_garbage_selection(
    garbage_pairs,
    target
):

    """
    Select garbage images using source-category information
    when available.

    If original category information cannot be recovered,
    use deterministic random sampling rather than pretending
    the selection is stratified.
    """

    original_categories = (
        read_original_garbage_categories()
    )

    if not original_categories:

        print()
        print(
            "Original category labels unavailable."
        )

        print(
            "Using deterministic random sampling "
            "instead of false stratification."
        )

        random.shuffle(garbage_pairs)

        return garbage_pairs[:target]

    # Group converted pairs according to original categories.

    groups = defaultdict(list)

    unclassified = []

    for image, label in garbage_pairs:

        source_categories = (
            original_categories.get(
                image.stem
            )
        )

        if not source_categories:

            unclassified.append(
                (image, label)
            )

            continue

        # If an image contains multiple source categories,
        # assign it to the first sorted category for
        # deterministic grouping.

        category = sorted(
            source_categories
        )[0]

        groups[category].append(
            (image, label)
        )

    print()
    print(
        "Original garbage categories found:"
    )

    for category in sorted(groups):

        print(
            f"  category {category}: "
            f"{len(groups[category])} images"
        )

    print()

    # Shuffle each group deterministically.

    for category in groups:

        random.shuffle(
            groups[category]
        )

    # First allocate approximately equal representation
    # across available categories.

    categories = sorted(groups)

    selected = []

    if categories:

        base_per_category = (
            target // len(categories)
        )

        remainder = (
            target % len(categories)
        )

        for i, category in enumerate(categories):

            quota = base_per_category

            if i < remainder:
                quota += 1

            available = groups[category]

            selected.extend(
                available[:quota]
            )

    # If some categories had fewer examples than quota,
    # fill remaining slots from all unused examples.

    if len(selected) < target:

        selected_keys = {
            image.name
            for image, label in selected
        }

        remaining = []

        for category in categories:

            for pair in groups[category]:

                if pair[0].name not in selected_keys:

                    remaining.append(pair)

        for pair in unclassified:

            if pair[0].name not in selected_keys:

                remaining.append(pair)

        random.shuffle(remaining)

        needed = target - len(selected)

        selected.extend(
            remaining[:needed]
        )

    return selected[:target]


# ============================================================
# START
# ============================================================

print("=" * 65)
print("CIVICEYE FINAL DATASET BUILDER")
print("=" * 65)

print()
print("Class mapping:")
print("  0 = pothole")
print("  1 = leakage")
print("  2 = garbage")
print()

prepare_output()


# ============================================================
# POTHOLE
# ============================================================

print("=" * 65)
print("1. POTHOLE")
print("=" * 65)

pothole = (
    SOURCE
    / "pothole"
    / "converted"
)

pothole_train = get_pairs(
    pothole / "train"
)

pothole_val = get_pairs(
    pothole / "valid"
)

pothole_test = get_pairs(
    pothole / "test"
)

print(
    f"Train: {len(pothole_train)}"
)

print(
    f"Val:   {len(pothole_val)}"
)

print(
    f"Test:  {len(pothole_test)}"
)


for i, pair in enumerate(
    pothole_train,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "train",
        "pothole",
        i
    )


for i, pair in enumerate(
    pothole_val,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "val",
        "pothole",
        i
    )


for i, pair in enumerate(
    pothole_test,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "test",
        "pothole",
        i
    )


# ============================================================
# LEAKAGE
# ============================================================

print()
print("=" * 65)
print("2. LEAKAGE")
print("=" * 65)

leakage = (
    SOURCE
    / "leakage"
    / "converted"
)

leakage_train = get_pairs(
    leakage / "train"
)

leakage_test = get_pairs(
    leakage / "test"
)

print(
    f"Original train: {len(leakage_train)}"
)

print(
    f"Test:           {len(leakage_test)}"
)

# Deterministic split.

random.shuffle(
    leakage_train
)

val_count = round(
    len(leakage_train)
    * LEAKAGE_VAL_RATIO
)

leakage_val = (
    leakage_train[:val_count]
)

leakage_train_final = (
    leakage_train[val_count:]
)

print(
    f"Final train:    {len(leakage_train_final)}"
)

print(
    f"Final val:      {len(leakage_val)}"
)


for i, pair in enumerate(
    leakage_train_final,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "train",
        "leakage",
        i
    )


for i, pair in enumerate(
    leakage_val,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "val",
        "leakage",
        i
    )


for i, pair in enumerate(
    leakage_test,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "test",
        "leakage",
        i
    )


# ============================================================
# GARBAGE
# ============================================================

print()
print("=" * 65)
print("3. GARBAGE")
print("=" * 65)

garbage = (
    SOURCE
    / "garbage"
    / "converted"
)

garbage_train = get_pairs(
    garbage / "train"
)

garbage_val = get_pairs(
    garbage / "val"
)

garbage_test = get_pairs(
    garbage / "test"
)

print(
    f"Available train: {len(garbage_train)}"
)

print(
    f"Val:              {len(garbage_val)}"
)

print(
    f"Test:             {len(garbage_test)}"
)

if len(garbage_train) < GARBAGE_TRAIN_TARGET:

    raise ValueError(
        "Not enough garbage training images."
    )

garbage_selected = (
    stratified_garbage_selection(
        garbage_train,
        GARBAGE_TRAIN_TARGET
    )
)

print()
print(
    "Selected garbage train:",
    len(garbage_selected)
)


for i, pair in enumerate(
    garbage_selected,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "train",
        "garbage",
        i
    )


for i, pair in enumerate(
    garbage_val,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "val",
        "garbage",
        i
    )


for i, pair in enumerate(
    garbage_test,
    1
):

    copy_pair(
        pair[0],
        pair[1],
        "test",
        "garbage",
        i
    )


# ============================================================
# FINAL STATISTICS
# ============================================================

print()
print("=" * 65)
print("4. FINAL DATASET STATISTICS")
print("=" * 65)

for split in [
    "train",
    "val",
    "test"
]:

    print()
    print(split.upper())

    for name, class_id in [
        ("pothole", 0),
        ("leakage", 1),
        ("garbage", 2)
    ]:

        image_dir = (
            OUTPUT
            / split
            / "images"
        )

        label_dir = (
            OUTPUT
            / split
            / "labels"
        )

        images = list(
            image_dir.glob(
                f"{name}_*"
            )
        )

        labels = list(
            label_dir.glob(
                f"{name}_*.txt"
            )
        )

        boxes = 0

        for label in labels:

            for parts in read_labels(
                label
            ):

                if int(parts[0]) != class_id:

                    raise ValueError(
                        f"Wrong class in {label}"
                    )

                boxes += 1

        print(
            f"{name:8} | "
            f"images={len(images):5} | "
            f"labels={len(labels):5} | "
            f"boxes={boxes:5}"
        )


# ============================================================
# DATA.YAML
# ============================================================

data_yaml = """path: .

train: train/images
val: val/images
test: test/images

nc: 3

names:
  0: pothole
  1: leakage
  2: garbage
"""

with open(
    OUTPUT / "data.yaml",
    "w",
    encoding="utf-8"
) as f:

    f.write(data_yaml)


# ============================================================
# GLOBAL PAIR VALIDATION
# ============================================================

print()
print("=" * 65)
print("5. GLOBAL VALIDATION")
print("=" * 65)

total_images = 0
total_labels = 0

for split in [
    "train",
    "val",
    "test"
]:

    image_dir = (
        OUTPUT
        / split
        / "images"
    )

    label_dir = (
        OUTPUT
        / split
        / "labels"
    )

    images = list(
        image_dir.iterdir()
    )

    labels = list(
        label_dir.glob("*.txt")
    )

    total_images += len(images)
    total_labels += len(labels)

    image_stems = {
        p.stem
        for p in images
    }

    label_stems = {
        p.stem
        for p in labels
    }

    missing_labels = (
        image_stems - label_stems
    )

    missing_images = (
        label_stems - image_stems
    )

    if missing_labels:

        raise ValueError(
            f"{split}: "
            f"{len(missing_labels)} images "
            f"without labels"
        )

    if missing_images:

        raise ValueError(
            f"{split}: "
            f"{len(missing_images)} labels "
            f"without images"
        )

    print(
        f"{split}: "
        f"{len(images)} images / "
        f"{len(labels)} labels ✓"
    )


print()
print("=" * 65)
print("FINAL RESULT")
print("=" * 65)

print(
    f"Total images: {total_images}"
)

print(
    f"Total labels: {total_labels}"
)

if total_images != total_labels:

    raise ValueError(
        "Image/label mismatch!"
    )

print()
print("Image/label matching: PASS ✓")
print("Class validation: PASS ✓")
print("Dataset structure: PASS ✓")
print("data.yaml: CREATED ✓")

print()
print("CIVICEYE FINAL DATASET BUILD COMPLETE!")