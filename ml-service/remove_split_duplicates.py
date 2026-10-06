from pathlib import Path
import hashlib

BASE = Path("data")

splits = ["train", "val", "test"]

hashes = {}

for split in splits:
    hashes[split] = {}

    image_dir = BASE / split / "images"

    for image in image_dir.iterdir():
        if image.is_file():
            h = hashlib.sha256(image.read_bytes()).hexdigest()
            hashes[split][h] = image


def remove_train_duplicate(image_hash, other_split):
    train_image = hashes["train"][image_hash]
    other_image = hashes[other_split][image_hash]

    train_label = BASE / "train" / "labels" / f"{train_image.stem}.txt"

    print(f"\nDuplicate found:")
    print(f"  TRAIN: {train_image.name}")
    print(f"  {other_split.upper()}: {other_image.name}")

    train_image.unlink()

    if train_label.exists():
        train_label.unlink()

    print(f"  Removed TRAIN copy: {train_image.name}")
    print(f"  Removed label:      {train_label.name}")


removed = 0

# Train vs validation
for h in set(hashes["train"]) & set(hashes["val"]):
    remove_train_duplicate(h, "val")
    removed += 1

# Train vs test
for h in set(hashes["train"]) & set(hashes["test"]):
    # It is possible the train copy was already removed above,
    # so check that it still exists.
    train_image = hashes["train"][h]

    if train_image.exists():
        remove_train_duplicate(h, "test")
        removed += 1

print("\n" + "=" * 50)
print("DUPLICATE CLEANUP COMPLETE")
print("=" * 50)
print(f"Training images removed: {removed}")