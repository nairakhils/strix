from pathlib import Path

import numpy as np

from strix.scene import write

EXTENTS = (4.0, 20.0, 60.0)
PIXELS = 900
SEPARATION = 30.0
MASS = 1.0
SECONDS = 30.0
PREVIEW = 256
EMPTY = -30.0
LEVEL = 99.5
DECADES = 5.0
SETTINGS = (
    "mass_ratio",
    "eccentricity",
    "mach",
    "alpha",
    "setup",
    "central_object",
    "thermodynamics",
)


def setting(config, key):
    value = config[key][()]
    return value.decode() if isinstance(value, bytes) else value.item()


def open_product(path):
    import h5py

    return h5py.File(path, "r")


def position(f, name):
    return np.array([f[f"{name}_x"][()].item(), f[f"{name}_y"][()].item()])


def load(path):
    with open_product(path) as f:
        config = f["__config__"]
        return {
            "time": float(f["__time__"][()]),
            "settings": {key: setting(config, key) for key in SETTINGS if key in config},
            "softening": setting(config, "dx") * setting(config, "rsoft")
            if "rsoft" in config
            else 0.0,
            "bodies": (position(f, "M1"), position(f, "M2")),
            "sigma": f["mass_density"][()],
            "x": f["x_vertices"][()],
            "y": f["y_vertices"][()],
        }


def time_of(path):
    with open_product(path) as f:
        return float(f["__time__"][()])


def mesh(product):
    x, y = product["x"], product["y"]
    centre = np.array([x[0, :-1].mean(), y[0, :-1].mean()])
    edges = np.hypot(x[:, 0] - centre[0], y[:, 0] - centre[1])
    start = np.arctan2(y[0, 0] - centre[1], x[0, 0] - centre[0])
    return centre, np.log(np.sqrt(edges[1:] * edges[:-1])), start


def bilinear(values, radial, angular):
    count, around = values.shape
    inside = np.isfinite(radial)
    radial = np.nan_to_num(radial)
    i = np.clip(np.floor(radial).astype(int), 0, count - 2)
    di = radial - i
    j = np.floor(angular).astype(int)
    dj = angular - j
    j0, j1 = j % around, (j + 1) % around
    near = (1 - dj) * values[i, j0] + dj * values[i, j1]
    far = (1 - dj) * values[i + 1, j0] + dj * values[i + 1, j1]
    return np.where(inside, (1 - di) * near + di * far, EMPTY)


def resample(product, extents=EXTENTS, pixels=PIXELS):
    q = product["settings"]["mass_ratio"]
    donor, accretor = product["bodies"]
    centre, logs, start = mesh(product)
    origin = (donor + q * accretor) / (1 + q) - centre
    axis = (accretor - donor) / np.hypot(*(accretor - donor))
    values = np.log10(np.maximum(product["sigma"], 1e-300))
    step = 2 * np.pi / values.shape[1]
    maps = []
    for extent in extents:
        grid = np.linspace(-extent, extent, pixels)
        x, y = np.meshgrid(grid, grid)
        dx = origin[0] + x * axis[0] - y * axis[1]
        dy = origin[1] + x * axis[1] + y * axis[0]
        r = np.maximum(np.hypot(dx, dy), 1e-300)
        radial = np.interp(np.log(r), logs, np.arange(logs.size), left=np.nan, right=np.nan)
        angular = np.mod(np.arctan2(dy, dx) - start, 2 * np.pi) / step - 0.5
        maps.append(bilinear(values, radial, angular))
    return np.stack(maps).astype(np.float16)


def ceiling(product, extent):
    preview = resample(product, (extent,), PREVIEW).astype(float)
    return float(np.percentile(preview[preview > EMPTY], LEVEL))


def convert(
    paths,
    out,
    *,
    extents=EXTENTS,
    pixels=PIXELS,
    separation=SEPARATION,
    mass=MASS,
    seconds=SECONDS,
):
    paths = sorted(map(Path, paths), key=time_of)
    if not paths:
        raise ValueError("no Sailfish products given")
    if len(paths) == 1:
        paths *= 2
    first = load(paths[0])
    settings = first["settings"]
    q = settings["mass_ratio"]
    hi = max(ceiling(load(path), extents[0]) for path in paths)
    samples = len(paths)
    columns = {
        "time": [time_of(path) for path in paths],
        "a": np.ones(samples),
        "e": np.full(samples, settings.get("eccentricity", 0.0)),
        "m1": np.full(samples, 1 / (1 + q)),
        "m2": np.full(samples, q / (1 + q)),
    }
    fields = {
        "maps": (resample(load(path), extents, pixels) for path in paths),
        "extents": list(extents),
        "range": [hi - DECADES, hi],
        "mach": settings["mach"],
        "softening": first["softening"],
    }
    return write(
        out,
        columns,
        units="binary",
        scale={"length": separation, "mass": mass},
        rate=(samples - 1) / seconds,
        fields=fields,
        source={"code": "sailfish", "products": [path.name for path in paths], **settings},
    )
