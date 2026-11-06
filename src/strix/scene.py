import json
import struct
from pathlib import Path

import numpy as np

FORMAT = "strix"
VERSION = 2
SAMPLE_RATE = 50
ALIGNMENT = 8

SYSTEMS = {
    "binary": {"time": "orbit", "length": "a", "mass": "M"},
    "solar": {"time": "Myr", "length": "Rsun", "mass": "Msun"},
}
UNITS = {
    "time": "time",
    "a": "length",
    "e": "",
    "m1": "mass",
    "m2": "mass",
    "r1": "length",
    "r2": "length",
    "teff1": "K",
    "teff2": "K",
    "kind1": "",
    "kind2": "",
    "type1": "",
    "type2": "",
    "spin1": "Omega/Omega_crit",
    "spin2": "Omega/Omega_crit",
    "wind1": "Msun/yr",
    "wind2": "Msun/yr",
    "transfer": "Msun/yr",
    "stage": "",
    "label": "",
}
REQUIRED = ("time", "a", "e", "m1", "m2")
TEXT = ("kind1", "kind2", "type1", "type2", "stage", "label")
KINDS = ("point", "star", "WD", "NS", "BH", "none")
STAGES = ("", "transfer", "envelope")
ORBIT = ("time", "m1", "m2", "a", "e")
STARS = (*ORBIT, "r1", "r2", "teff1", "teff2")
EVENTS = {
    "transfer": ("donor", STARS, ()),
    "collapse": ("star", ORBIT, ("hydrogen", "helium")),
    "envelope": ("donor", STARS, ()),
}
FIELD_KEYS = ("maps", "extents", "range", "mach", "softening")
MEDIA = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
DTYPES = {"float64": "<f8", "uint16": "<u2", "uint8": "u1"}


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
    for name, allowed in (("kind1", KINDS), ("kind2", KINDS), ("stage", STAGES)):
        wrong = sorted(set(map(str, columns.get(name, ()))) - set(allowed))
        if wrong:
            raise ValueError(f"{name} has unknown values: {', '.join(wrong)}")
    return lengths.pop()


def check_units(units, scale):
    if units not in SYSTEMS:
        raise ValueError(f"units must be one of {', '.join(SYSTEMS)}")
    if (units == "binary") != (scale is not None):
        raise ValueError("binary units need a scale, solar units take none")
    if scale is not None and not (set(scale) == {"length", "mass"} and min(scale.values()) > 0):
        raise ValueError("scale must give positive length and mass")


def check_state(state, where, keys):
    missing = [key for key in keys if key not in state]
    if missing:
        raise ValueError(f"{where} is missing {', '.join(missing)}")


def check_span(event, samples):
    first, last = event["during"]
    if not 0 <= first <= last <= event["until"] < samples:
        raise ValueError(f"{event['kind']} samples out of order: {first}, {last}, {event['until']}")


def check_events(events, samples):
    for event in events:
        kind = event["kind"]
        if kind not in EVENTS:
            raise ValueError(f"unknown event kind: {kind}")
        role, keys, fields = EVENTS[kind]
        if event[role] not in (1, 2):
            raise ValueError(f"{role} must be 1 or 2, not {event[role]}")
        check_state(event, kind, fields)
        check_span(event, samples)
        check_state(event["start"], f"{kind} start", keys)
        check_state(event["end"], f"{kind} end", keys)


def encode(name, values, strings):
    if name in TEXT:
        indices = [strings.setdefault(str(value), len(strings)) for value in values]
        return "uint16", np.asarray(indices, DTYPES["uint16"])
    return "float64", np.asarray(values, DTYPES["float64"])


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
    scale=None,
    rate=SAMPLE_RATE,
    events=(),
    fields=None,
    palette=None,
    types=None,
    sky=None,
    assets=None,
    source=None,
):
    assets = dict(assets or {})
    samples = check_columns(columns)
    check_units(units, scale)
    check_events(events, samples)
    if not rate > 0:
        raise ValueError("rate must be positive")
    if sky is not None and sky not in assets:
        raise ValueError(f"sky asset {sky} not found")
    strings = {}
    blobs = []
    entries = []
    offset = 0

    def place(entry, blob):
        nonlocal offset
        entries.append({**entry, "offset": offset, "length": len(blob)})
        blobs.append(blob)
        offset = aligned(offset + len(blob))

    for name, values in columns.items():
        dtype, array = encode(name, values, strings)
        unit = SYSTEMS[units].get(UNITS[name], UNITS[name])
        place({"name": name, "dtype": dtype, "units": unit}, array.tobytes())
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
        "strings": list(strings),
        "columns": entries[:column_count],
        "assets": entries[column_count:],
        "events": list(events),
        "fields": None if fields is None else write_fields(path, samples, fields),
        "palette": palette,
        "types": types,
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
    strings = header["strings"]
    columns = {}
    for column in header["columns"]:
        values = np.frombuffer(
            data,
            DTYPES[column["dtype"]],
            header["samples"],
            start + column["offset"],
        )
        columns[column["name"]] = (
            [strings[index] for index in values] if column["name"] in TEXT else values
        )
    assets = {
        asset["name"]: data[start + asset["offset"] : start + asset["offset"] + asset["length"]]
        for asset in header["assets"]
    }
    return header, columns, assets
