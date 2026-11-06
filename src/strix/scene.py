import json
import struct
from pathlib import Path

import numpy as np

FORMAT = "strix"
VERSION = 2
SAMPLE_RATE = 50
ALIGNMENT = 8

SYSTEMS = {"binary": {"time": "orbit", "length": "a", "mass": "M"}}
UNITS = {"time": "time", "a": "length", "e": "", "m1": "mass", "m2": "mass"}
REQUIRED = ("time", "a", "e", "m1", "m2")
FIELD_KEYS = ("maps", "extents", "range", "mach", "softening")
MEDIA = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def aligned(size):
    return (size + ALIGNMENT - 1) // ALIGNMENT * ALIGNMENT


def check_columns(columns):
    unknown = sorted(set(columns) - set(UNITS))
    if unknown:
        raise ValueError(f"unknown columns: {', '.join(unknown)}")
    missing = [name for name in REQUIRED if name not in columns]
    if missing:
        raise ValueError(f"missing columns: {', '.join(missing)}")
    lengths = {len(values) for values in columns.values()}
    if len(lengths) != 1:
        raise ValueError("columns differ in length")
    return lengths.pop()


def check_units(units, scale):
    if units not in SYSTEMS:
        raise ValueError(f"units must be one of {', '.join(SYSTEMS)}")
    if scale is None or not (set(scale) == {"length", "mass"} and min(scale.values()) > 0):
        raise ValueError("scale must give positive length and mass")


def field_folder(path):
    path = Path(path)
    return path.with_name(f"{path.stem}.fields")


def field_name(sample, level):
    return f"{sample}_{level}.f16"


def write_fields(path, samples, fields):
    unknown = sorted(set(fields) - set(FIELD_KEYS))
    if unknown:
        raise ValueError(f"unknown field keys: {', '.join(unknown)}")
    extents = [float(extent) for extent in fields["extents"]]
    lo, hi = map(float, fields["range"])
    if extents != sorted(set(extents)) or not lo < hi:
        raise ValueError("field extents and range must rise")
    folder = field_folder(path)
    folder.mkdir(parents=True, exist_ok=True)
    pixels = None
    count = 0
    for sample, maps in enumerate(fields["maps"]):
        maps = np.asarray(maps, np.float16)
        if maps.ndim != 3 or maps.shape[0] != len(extents) or maps.shape[1] != maps.shape[2]:
            raise ValueError(f"field {sample} must be one square map per extent")
        if pixels is not None and maps.shape[1] != pixels:
            raise ValueError(f"field {sample} has {maps.shape[1]} pixels, not {pixels}")
        pixels = maps.shape[1]
        for level, values in enumerate(maps):
            values.tofile(folder / field_name(sample, level))
        count += 1
    if count != samples:
        raise ValueError(f"{count} fields for {samples} samples")
    return {
        "extents": extents,
        "pixels": pixels,
        "range": [lo, hi],
        "mach": float(fields["mach"]),
        "softening": float(fields.get("softening", 0)),
    }


def read_field(path, header, sample):
    fields = header["fields"]
    folder = field_folder(path)
    shape = (fields["pixels"], fields["pixels"])
    return np.stack(
        [
            np.fromfile(folder / field_name(sample, level), np.float16).reshape(shape)
            for level in range(len(fields["extents"]))
        ]
    )


def media_type(name):
    media = MEDIA.get(Path(name).suffix.lower())
    if media is None:
        raise ValueError(f"unsupported asset type: {name}")
    return media


def write(
    path,
    columns,
    *,
    units,
    scale,
    rate=SAMPLE_RATE,
    fields=None,
    sky=None,
    assets=None,
    source=None,
):
    assets = dict(assets or {})
    samples = check_columns(columns)
    check_units(units, scale)
    if not rate > 0:
        raise ValueError("rate must be positive")
    if sky is not None and sky not in assets:
        raise ValueError(f"sky asset {sky} not found")
    blobs = []
    entries = []
    offset = 0

    def place(entry, blob):
        nonlocal offset
        entries.append({**entry, "offset": offset, "length": len(blob)})
        blobs.append(blob)
        offset = aligned(offset + len(blob))

    for name, values in columns.items():
        unit = SYSTEMS[units].get(UNITS[name], UNITS[name])
        place(
            {"name": name, "dtype": "float64", "units": unit}, np.asarray(values, "<f8").tobytes()
        )
    column_count = len(entries)
    for name, data in assets.items():
        place({"name": name, "type": media_type(name)}, bytes(data))

    header = {
        "format": FORMAT,
        "version": VERSION,
        "samples": samples,
        "rate": rate,
        "units": units,
        "scale": scale,
        "columns": entries[:column_count],
        "assets": entries[column_count:],
        "fields": None if fields is None else write_fields(path, samples, fields),
        "sky": sky,
        "source": source,
    }
    text = json.dumps(header, allow_nan=False, separators=(",", ":")).encode()
    start = aligned(4 + len(text))
    with open(path, "wb") as f:
        f.write(struct.pack("<I", len(text)))
        f.write(text)
        f.write(bytes(start - 4 - len(text)))
        for blob in blobs:
            f.write(blob)
            f.write(bytes(aligned(len(blob)) - len(blob)))
    return Path(path)


def read(path):
    data = Path(path).read_bytes()
    (length,) = struct.unpack_from("<I", data)
    header = json.loads(data[4 : 4 + length])
    if header.get("format") != FORMAT or header.get("version") != VERSION:
        raise ValueError(f"{path} is not a strix {VERSION} file")
    start = aligned(4 + length)
    columns = {
        column["name"]: np.frombuffer(data, "<f8", header["samples"], start + column["offset"])
        for column in header["columns"]
    }
    assets = {
        asset["name"]: data[start + asset["offset"] : start + asset["offset"] + asset["length"]]
        for asset in header["assets"]
    }
    return header, columns, assets
