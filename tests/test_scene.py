import json
import struct

import numpy as np
import pytest

import strix

SCALE = {"length": 30.0, "mass": 1.0}


def write(path, columns, **options):
    return strix.write(path, columns, **{"units": "binary", "scale": SCALE, **options})


def orbit(samples=4):
    return {
        "time": np.arange(samples) * 50.0,
        "a": np.ones(samples),
        "e": np.zeros(samples),
        "m1": np.full(samples, 1 / 1.4),
        "m2": np.full(samples, 0.4 / 1.4),
    }


def maps(samples, extents=(4, 20), pixels=8):
    for sample in range(samples):
        yield np.full((len(extents), pixels, pixels), -2.0 - sample)


def test_round_trip(tmp_path):
    path = write(
        tmp_path / "run.strix",
        orbit(),
        rate=4,
        sky="sky.png",
        assets={"sky.png": b"\x89PNG..."},
        source={"code": "test"},
    )
    header, read, assets = strix.read(path)
    assert (header["samples"], header["rate"], header["sky"]) == (4, 4, "sky.png")
    assert (header["units"], header["scale"], header["source"]) == (
        "binary",
        SCALE,
        {"code": "test"},
    )
    assert assets == {"sky.png": b"\x89PNG..."}
    units = {column["name"]: column["units"] for column in header["columns"]}
    assert (units["time"], units["a"], units["e"], units["m1"]) == ("orbit", "a", "", "M")
    np.testing.assert_array_equal(read["time"], orbit()["time"])
    assert header["fields"] is None


@pytest.mark.parametrize(
    ("options", "message"),
    [
        ({"units": "cgs"}, "units must be one of"),
        ({"scale": None}, "positive length and mass"),
        ({"scale": {"length": 30.0}}, "positive length and mass"),
        ({"rate": 0}, "rate must be positive"),
    ],
)
def test_bad_units_are_refused(tmp_path, options, message):
    with pytest.raises(ValueError, match=message):
        write(tmp_path / "run.strix", orbit(), **options)


def test_fields_sit_beside_the_scene(tmp_path):
    fields = {"maps": maps(4), "extents": [4, 20], "range": [-6, -1], "mach": 10.0}
    path = write(tmp_path / "run.strix", orbit(), fields=fields)
    header, _, _ = strix.read(path)
    assert header["fields"] == {
        "extents": [4.0, 20.0],
        "pixels": 8,
        "range": [-6.0, -1.0],
        "mach": 10.0,
        "softening": 0.0,
    }
    names = sorted(item.name for item in (tmp_path / "run.fields").iterdir())
    assert names[:3] == ["0_0.f16", "0_1.f16", "1_0.f16"]
    field = strix.read_field(path, header, 3)
    assert (field.shape, field.dtype, float(field[1, 0, 0])) == ((2, 8, 8), np.float16, -5.0)


@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"maps": maps(3), "extents": [4, 20], "range": [-6, -1], "mach": 10}, "3 fields for 4"),
        (
            {"maps": maps(4, (4,)), "extents": [4, 20], "range": [-6, -1], "mach": 10},
            "one square map",
        ),
        ({"maps": maps(4), "extents": [4, 20], "range": [-1, -6], "mach": 10}, "must rise"),
        ({"maps": maps(4), "extents": [20, 4], "range": [-6, -1], "mach": 10}, "must rise"),
        (
            {"maps": maps(4), "extents": [4, 20], "range": [-6, -1], "mach": 10, "gamma": 1},
            "unknown",
        ),
    ],
)
def test_bad_fields_are_refused(tmp_path, fields, message):
    with pytest.raises(ValueError, match=message):
        write(tmp_path / "run.strix", orbit(), fields=fields)


def test_columns_are_aligned_for_typed_arrays(tmp_path):
    path = write(tmp_path / "run.strix", orbit(7))
    data = path.read_bytes()
    (length,) = struct.unpack_from("<I", data)
    header = json.loads(data[4 : 4 + length])
    start = -(-(4 + length) // 8) * 8
    assert all((start + column["offset"]) % 8 == 0 for column in header["columns"])


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"mass": [1.0] * 4}, "unknown columns"),
        ({"a": [1.0, 2.0]}, "differ in length"),
    ],
)
def test_bad_columns_are_refused(tmp_path, change, message):
    with pytest.raises(ValueError, match=message):
        write(tmp_path / "run.strix", {**orbit(), **change})


def test_missing_columns_are_named(tmp_path):
    columns = orbit()
    del columns["e"]
    with pytest.raises(ValueError, match="missing columns: e"):
        write(tmp_path / "run.strix", columns)


def test_sky_must_be_an_asset(tmp_path):
    with pytest.raises(ValueError, match="sky asset"):
        write(tmp_path / "run.strix", orbit(), sky="sky.png")
