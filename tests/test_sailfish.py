import h5py
import numpy as np
import pytest

import strix
from strix import sailfish
from strix.cli import parse_arguments

Q = 0.25


def frame(phase):
    axis = np.array([np.cos(phase), np.sin(phase)])
    return axis, np.array([-axis[1], axis[0]])


def density(x, y):
    return 0.3 * x + 0.1 * y - 2


def product(path, time, phase=0.7):
    axis, across = frame(phase)
    donor = -Q / (1 + Q) * axis
    accretor = 1 / (1 + Q) * axis
    edges = np.geomspace(0.05, 10, 241)
    angles = phase + 0.01 + np.linspace(0, 2 * np.pi, 193)
    centres = np.sqrt(edges[1:] * edges[:-1])[:, None], 0.5 * (angles[1:] + angles[:-1])[None, :]
    x = donor[0] + centres[0] * np.cos(centres[1])
    y = donor[1] + centres[0] * np.sin(centres[1])
    with h5py.File(path, "w") as f:
        f["__time__"] = time
        f["x_vertices"] = donor[0] + edges[:, None] * np.cos(angles)[None, :]
        f["y_vertices"] = donor[1] + edges[:, None] * np.sin(angles)[None, :]
        f["mass_density"] = 10 ** density(x * axis[0] + y * axis[1], x * across[0] + y * across[1])
        for name, at in (("M1", donor), ("M2", accretor)):
            f[f"{name}_x"] = [[at[0]]]
            f[f"{name}_y"] = [[at[1]]]
        config = f.create_group("__config__")
        settings = {"mass_ratio": Q, "eccentricity": 0.0, "mach": 10.0, "alpha": 0.1, "dx": 0.01}
        for key, value in {**settings, "rsoft": 1.0, "setup": b"steady"}.items():
            config[key] = value
    return path


def test_maps_sit_in_the_binary_frame(tmp_path):
    maps = sailfish.resample(sailfish.load(product(tmp_path / "prods.0001.h5", 10.0)), (2.0,), 41)
    grid = np.linspace(-2, 2, 41)
    x, y = np.meshgrid(grid, grid)
    near = np.hypot(x + Q / (1 + Q), y)
    ring = (near > 0.1) & (near < 1.9)
    assert maps.shape == (1, 41, 41)
    np.testing.assert_allclose(maps[0][ring], density(x, y)[ring], atol=0.02)
    assert np.all(maps[0][near < 0.04] == sailfish.EMPTY)


def test_products_become_a_scene(tmp_path):
    paths = [product(tmp_path / f"prods.{n:04d}.h5", time) for n, time in ((2, 20.0), (1, 10.0))]
    out = sailfish.convert(paths, tmp_path / "run.strix", extents=(2.0, 6.0), pixels=16, seconds=4)
    header, columns, _ = strix.read(out)
    assert (header["units"], header["scale"], header["rate"]) == (
        "binary",
        {"length": 30.0, "mass": 1.0},
        0.25,
    )
    np.testing.assert_array_equal(columns["time"], [10.0, 20.0])
    np.testing.assert_allclose(columns["m1"] + columns["m2"], 1)
    assert set(columns) == {"time", "a", "e", "m1", "m2"}
    fields = header["fields"]
    assert (fields["extents"], fields["pixels"], fields["mach"], fields["softening"]) == (
        [2.0, 6.0],
        16,
        10.0,
        0.01,
    )
    assert fields["range"][1] - fields["range"][0] == sailfish.DECADES
    assert header["source"]["products"] == ["prods.0001.h5", "prods.0002.h5"]
    assert strix.read_field(out, header, 1).shape == (2, 16, 16)


def test_one_product_holds_still(tmp_path):
    out = sailfish.convert(
        [product(tmp_path / "prods.0001.h5", 10.0)], tmp_path / "run.strix", pixels=8
    )
    header, columns, _ = strix.read(out)
    assert header["samples"] == 2
    np.testing.assert_array_equal(columns["time"], [10.0, 10.0])


def test_no_products_are_refused(tmp_path):
    with pytest.raises(ValueError, match="no Sailfish products"):
        sailfish.convert([], tmp_path / "run.strix")


def test_command_line():
    args = parse_arguments(["sailfish", "a.h5", "b.h5", "run.strix", "--separation", "12"])
    assert [str(path) for path in args.products] == ["a.h5", "b.h5"]
    assert (str(args.out), args.separation, args.mass) == ("run.strix", 12.0, sailfish.MASS)
