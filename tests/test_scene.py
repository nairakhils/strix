import json
import struct

import numpy as np
import pytest

import strix
from strix.cli import parse_arguments

SCALE = {"length": 30.0, "mass": 1.0}


def write(path, columns, **options):
    return strix.write(path, columns, **{"units": "solar", **options})


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


def binary(samples=5):
    return {
        "time": np.linspace(0, 1, samples),
        "a": np.full(samples, 30.0),
        "e": np.zeros(samples),
        "m1": np.full(samples, 12.0),
        "m2": np.full(samples, 8.0),
        "r1": np.full(samples, 5.0),
        "r2": np.full(samples, 3.5),
        "teff1": np.full(samples, 28000.0),
        "teff2": np.full(samples, 22000.0),
        "kind1": ["star"] * samples,
        "kind2": ["star"] * (samples - 1) + ["BH"],
    }


def transfer(**changes):
    orbit = {"time": 0.0, "m1": 12.0, "m2": 8.0, "a": 30.0, "e": 0.0}
    state = {**orbit, "r1": 9.0, "r2": 4.0, "teff1": 28000.0, "teff2": 22000.0}
    event = {
        "kind": "transfer",
        "donor": 1,
        "during": [1, 2],
        "until": 3,
        "start": state,
        "end": {**state, "time": 0.5, "m1": 6.0, "m2": 14.0},
    }
    return {**event, **changes}


def test_round_trip(tmp_path):
    columns = {**binary(), "label": ["", "", "Mass Transfer", "", ""], "stage": [""] * 5}
    path = write(
        tmp_path / "run.strix",
        columns,
        events=[transfer()],
        types={"BH": {"name": "Black hole", "icon": "BH.png"}},
        assets={"BH.png": b"\x89PNG..."},
        source={"code": "test"},
    )
    header, read, assets = strix.read(path)
    assert header["samples"] == 5
    assert header["rate"] == strix.SAMPLE_RATE
    assert header["events"] == [transfer()]
    assert assets == {"BH.png": b"\x89PNG..."}
    np.testing.assert_array_equal(read["time"], columns["time"])
    assert read["kind2"] == columns["kind2"]
    assert read["label"][2] == "Mass Transfer"
    assert (header["units"], header["scale"]) == ("solar", None)
    assert {column["name"]: column["units"] for column in header["columns"]}["a"] == "Rsun"


def test_point_binary_in_binary_units(tmp_path):
    path = strix.write(tmp_path / "run.strix", orbit(), units="binary", scale=SCALE, rate=4)
    header, read, _ = strix.read(path)
    assert (header["units"], header["scale"], header["rate"]) == ("binary", SCALE, 4)
    units = {column["name"]: column["units"] for column in header["columns"]}
    assert (units["time"], units["a"], units["m1"]) == ("orbit", "a", "M")
    np.testing.assert_array_equal(read["time"], orbit()["time"])
    assert header["fields"] is None


@pytest.mark.parametrize(
    ("options", "message"),
    [
        ({"units": "cgs"}, "units must be one of"),
        ({"units": "binary"}, "need a scale"),
        ({"units": "solar", "scale": SCALE}, "take none"),
        ({"units": "binary", "scale": {"length": 30.0}}, "positive length and mass"),
        ({"units": "binary", "scale": SCALE, "rate": 0}, "rate must be positive"),
    ],
)
def test_bad_units_are_refused(tmp_path, options, message):
    with pytest.raises(ValueError, match=message):
        strix.write(tmp_path / "run.strix", orbit(), **options)


def test_fields_sit_beside_the_scene(tmp_path):
    fields = {"maps": maps(4), "extents": [4, 20], "range": [-6, -1], "mach": 10.0}
    path = strix.write(tmp_path / "run.strix", orbit(), units="binary", scale=SCALE, fields=fields)
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
        strix.write(tmp_path / "run.strix", orbit(), units="binary", scale=SCALE, fields=fields)


def test_columns_are_aligned_for_typed_arrays(tmp_path):
    path = write(tmp_path / "run.strix", binary(7))
    data = path.read_bytes()
    (length,) = struct.unpack_from("<I", data)
    header = json.loads(data[4 : 4 + length])
    start = -(-(4 + length) // 8) * 8
    assert all((start + column["offset"]) % 8 == 0 for column in header["columns"])


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"mass": [1.0] * 5}, "unknown columns"),
        ({"kind1": ["star", "giant", "star", "star", "star"]}, "kind1 has unknown values"),
        ({"stage": ["", "overflow", "", "", ""]}, "stage has unknown values"),
        ({"regime1": ["OB", "WR", "dusty", "", ""]}, "regime1 has unknown values"),
        ({"a": [1.0, 2.0]}, "differ in length"),
    ],
)
def test_bad_columns_are_refused(tmp_path, change, message):
    with pytest.raises(ValueError, match=message):
        write(tmp_path / "run.strix", {**binary(), **change})


def test_missing_columns_are_named(tmp_path):
    columns = binary()
    del columns["e"]
    with pytest.raises(ValueError, match="missing columns: e"):
        write(tmp_path / "run.strix", columns)


@pytest.mark.parametrize(
    ("event", "message"),
    [
        (transfer(during=[3, 2]), "out of order"),
        (transfer(until=9), "out of order"),
        (transfer(donor=0), "donor must be 1 or 2"),
        (transfer(kind="merger"), "unknown event kind"),
        (transfer(start={"time": 0.0}), "transfer start is missing"),
    ],
)
def test_bad_events_are_refused(tmp_path, event, message):
    with pytest.raises(ValueError, match=message):
        write(tmp_path / "run.strix", binary(), events=[event])


def collapse(**changes):
    state = {"time": 1.0, "m1": 12.0, "m2": 8.0, "a": 30.0, "e": 0.0}
    event = {
        "kind": "collapse",
        "star": 1,
        "hydrogen": 0.0,
        "helium": 1.3,
        "during": [1, 3],
        "until": 4,
        "start": state,
        "end": {**state, "m1": 1.4, "a": -5.0, "e": 3.0},
    }
    return {**event, **changes}


def test_collapse_events(tmp_path):
    header, _, _ = strix.read(write(tmp_path / "run.strix", binary(), events=[collapse()]))
    assert header["events"] == [collapse()]
    with pytest.raises(ValueError, match="star must be 1 or 2"):
        write(tmp_path / "run.strix", binary(), events=[collapse(star=3)])
    with pytest.raises(ValueError, match="collapse end is missing e"):
        write(
            tmp_path / "run.strix",
            binary(),
            events=[collapse(end={"time": 1.0, "m1": 1.4, "m2": 8.0, "a": 30.0})],
        )
    bare = {key: value for key, value in collapse().items() if key != "hydrogen"}
    with pytest.raises(ValueError, match="collapse is missing hydrogen"):
        write(tmp_path / "run.strix", binary(), events=[bare])


def envelope(**changes):
    state = {"time": 1.0, "m1": 9.7, "m2": 34.4, "a": 2235.0, "e": 0.05}
    stars = {"r1": 0.0, "r2": 1057.0, "teff1": 0.0, "teff2": 4786.0}
    event = {
        "kind": "envelope",
        "donor": 2,
        "during": [1, 3],
        "until": 4,
        "start": {**state, **stars},
        "end": {**state, "m2": 13.3, "a": 9.1, "e": 0.0, **stars, "r2": 1.2},
    }
    return {**event, **changes}


def test_envelope_events(tmp_path):
    header, _, _ = strix.read(write(tmp_path / "run.strix", binary(), events=[envelope()]))
    assert header["events"] == [envelope()]
    with pytest.raises(ValueError, match="donor must be 1 or 2"):
        write(tmp_path / "run.strix", binary(), events=[envelope(donor=0)])
    with pytest.raises(ValueError, match="envelope start is missing r1"):
        start = {key: value for key, value in envelope()["start"].items() if key != "r1"}
        write(tmp_path / "run.strix", binary(), events=[envelope(start=start)])


def test_sky_must_be_an_asset(tmp_path):
    with pytest.raises(ValueError, match="sky asset"):
        write(tmp_path / "run.strix", binary(), sky="sky.png")


def test_command_line():
    shown = parse_arguments(["view", "run.strix", "--scale", "log"])
    assert (shown.command, shown.scale, shown.port) == ("view", "log", 0)
    rendered = parse_arguments(
        ["render", "run.strix", "run.mp4", "--width", "1280", "--height", "720"]
    )
    assert (rendered.command, rendered.width, rendered.height) == ("render", 1280, 720)
    assert (shown.camera, rendered.camera) == ("fixed", "fixed")
    followed = parse_arguments(["render", "run.strix", "run.mp4", "--camera", "follow"])
    assert followed.camera == "follow"
