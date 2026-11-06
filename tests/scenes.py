from itertools import pairwise
from pathlib import Path

import numpy as np

import strix

OUT = Path(__file__).resolve().parents[1] / "src" / "strix" / "web" / "tests" / "scenes"
NUMBERS = ("time", "a", "e", "m1", "m2", "r1", "r2", "teff1", "teff2", "spin1", "spin2")
NUMBERS += ("wind1", "wind2", "period1", "period2", "field1", "field2")
LINEAR = ("time", "e", "m1", "m2")
REMNANTS = {"NS": "NS", "BH": "BH", "HeWD": "WD", "COWD": "WD", "ONeWD": "WD"}
SCHWARZSCHILD = 4.245e-6
NS_RADIUS = 10 / 695700
EVENTS = {"transfer": "Mass transfer", "collapse": "Supernova", "envelope": "Common envelope"}

STABLE = """
frame time a    e      m1    m2    r1   r2   teff1  teff2  spin1  spin2 wind1  wind2
0     0    108  0      68    38    10.5 7.4  50000  44000  0      0     8e-7   1.4e-7
94    3.96 107  .      57.5  40.6  45   12.5 27500  40000  .      0.4   .      2.5e-7
204   3.97 92   .      48    50    35.5 12.4 28500  43500  .      1     .      .
210   3.99 91.7 .      46    52    25   .    33500  44000  .      .     .      .
310   .    93.5 .      45.7  .     34   .    30500  .      .      .     .      .
360   .    178  .      24.8  52.4  1.6  .    130000 .      .      .     0      0
420   .    .    .      .     .     .    .    .      .      .      .     .      .
421   4.0  .    .      .     .     .    .    .      .      .      .     1.7e-5 9e-7
520   4.4  197  .      18.2  .     1.35 13.7 138000 42800  .      0.92  1.4e-5 1e-6
620   .    .    .      18.15 .     1.33 13.8 136000 42700  .      .     .      .
670   .    198  0.0026 17.97 .     bh   .    3000   .      .      .     0      .
719   5.3  205  .      .     50.9  .    19   .      37700  .      0.7   .      1.3e-6
770   6.13 212  .      .     50    .    28   .      33000  .      0.83  .      1.6e-6
870   .    209  0.0025 .     49.5  .    98   .      19700  .      0.05  .      6.3e-6
920   .    85.5 0      .     19    .    1.39 .      127000 3.7e-5 .     .      0
980   .    .    .      .     .     .    .    .      .      .      .     .      .
981   6.14 .    .      .     .     .    .    .      .      .      .     .      9e-6
1080  6.6  96.3 .      .     14.8  .    1.19 .      135000 .      .     .      .
1180  6.61 96.6 .      .     14.75 .    1.2  .      .      .      0.01  .      1e-5
1230  .    97.1 0.0045 .     14.6  .    bh   .      3000   .      .     .      .
1329  .    .    .      .     .     .    .    .      .      .      .     .      .
"""

ENVELOPE = """
frame time  a    e     m1   m2   r1   r2   teff1  teff2  spin2 wind1  wind2
0     0     750  0     35   31   6.2  5.8  46000  45000  0     1e-7   6e-8
150   5.89  778  .     33.7 30.2 15   13   37000  35600  .     6e-7   2.5e-7
250   .     .    .     .    .    96   .    15200  .      .     .      .
350   6.128 810  .     32.6 30.3 300  14.7 10800  34000  0.03  5e-6   .
400   6.129 1990 .     12.4 36   1.13 11.3 121000 40700  1     0      0
460   .     .    .     .    .    .    .    .      .      .     .      .
468   6.16  .    .     .    .    .    .    .      .      .     1.8e-7 4e-7
560   6.47  2000 .     12.3 .    1.06 12.7 131000 38900  0.92  .      .
660   6.48  2010 .     12.2 .    1.13 .    132000 .      .     3.3e-7 .
710   .     2120 0.056 9.73 .    bh   .    3000   .      .     0      .
759   7.05  2140 .     .    35.6 .    17.2 .      34300  0.76  .      .
810   7.32  2150 .     .    35.4 .    15.7 .      37100  1     .      7e-7
820   .     .    .     .    .    .    19   .      34000  .     .      .
910   7.33  .    .     .    .    .    113  .      14400  0.45  .      .
960   .     .    .     .    .    .    147  .      11000  .     .      .
991   7.54  2230 .     .    34.5 .    395  .      7800   0.2   .      1.75e-6
1110  7.58  2235 0.055 .    34.4 .    1057 .      4800   0.12  .      .
1160  .     9.09 0     .    13.3 .    1.19 .      123000 .     .      .
1305  .     .    .     .    .    .    .    .      .      .     .      .
1315  7.61  .    .     .    .    .    .    .      .      .     .      2.2e-7
1380  7.88  9.12 .     .    13.2 .    1.11 .      133000 .     .      2.8e-7
1480  7.89  9.14 .     .    .    .    1.16 .      136000 .     .      3.7e-7
1530  .     9.91 0.08  .    11.5 .    bh   .      3000   .     .      0
1629  .     .    .     .    .    .    .    .      .      .     .      .
"""

UNBOUND = """
frame time   a      e     m1   m2   r1   r2   teff1  teff2 spin2 wind1  wind2   period1 field1
0     0      43     0     17   15   4.1  3.8  36300  34600 0     1.5e-9 7.7e-10 0       0
100   12.16  43.1   .     .    .    9.8  7.2  31000  30600 .     1.1e-8 3e-9    .       .
200   12.165 .      .     16.7 15.2 16.6 .    25500  30800 0.03  8.5e-8 .       .       .
250   12.166 142    .     4.44 27.5 0.56 6.9  93400  41300 1     0      0       .       .
310   .      .      .     .    .    .    .    .      .     .     .      .       .       .
315   12.2   .      .     .    .    .    .    .      .     .     3.3e-8 2.9e-8  .       .
410   13.5   143    .     4.37 .    0.56 8.1  110000 39800 0.92  8.5e-8 4e-8    .       .
510   13.6   .      .     4.3  .    3    8.2  95000  39700 .     3e-7   .       .       .
560   .      -6.81  20.58 1.5  .    ns   .    1.9e6  .     .     0      .       0.16    1.39e13
609   14.2   -6.83  .     .    27.4 .    9.15 7.8e5  38500 0.86  .      .       2.35    .
660   16.0   -6.88  .     .    27.3 .    13.6 4e5    34800 0.99  .      9.5e-8  4.9     .
760   .      .      .     .    .    .    69   .      16000 0.45  .      4e-7    .       .
807   16.4   -6.98  .     .    27.2 .    330  .      7500  0.21  .      4e-6    5.25    .
835   .      -7.05  .     .    27.1 .    480  .      6260  0.17  .      .       .       .
1360  16.7   -9.48  .     .    22.8 .    2000 .      3100  0.02  .      1.5e-5  5.59    .
1460  .      -9.61  .     .    22.5 .    2470 .      2220  .     .      2.4e-5  .       .
1510  .      -9.625 .     .    15.9 .    bh   .      3000  .     .      0       .       .
1609  .      .      .     .    .    .    .    .      .     .     .      .       .       .
"""


def value(name, token, state):
    if token == "bh":
        return SCHWARZSCHILD * state[f"m{name[-1]}"]
    if token == "ns":
        return NS_RADIUS
    return float(token)


def keyframes(text):
    header, *rows = (line.split() for line in text.strip().splitlines())
    state = dict.fromkeys(NUMBERS, 0.0)
    keys = []
    for frame, *tokens in rows:
        for name, token in zip(header[1:], tokens, strict=True):
            if token != ".":
                state[name] = value(name, token, state)
        keys.append((int(frame), dict(state)))
    return keys


def blend(start, end, x, name):
    if name in LINEAR or start <= 0 or end <= 0:
        return start + (end - start) * x
    return start * (end / start) ** x


def tracks(samples, keys):
    columns = {name: np.empty(samples) for name in NUMBERS}
    for (first, start), (last, end) in pairwise(keys):
        x = np.linspace(0, 1, last - first + 1)
        for name in NUMBERS:
            columns[name][first : last + 1] = blend(start[name], end[name], x, name)
    return columns


def runs(samples, changes):
    values = [None] * samples
    for (frame, value), (until, _) in zip(changes, [*changes[1:], (samples, None)], strict=True):
        values[frame:until] = [value] * (until - frame)
    return values


def stars(state):
    keys = ("time", "m1", "m2", "a", "e", "r1", "r2", "teff1", "teff2")
    return {key: float(state[key]) for key in keys}


def orbit(state):
    return {key: float(state[key]) for key in ("time", "m1", "m2", "a", "e")}


def scene(text, types, regimes, events):
    keys = keyframes(text)
    samples = keys[-1][0] + 1
    states = dict(keys)
    types = [runs(samples, changes) for changes in types]
    labels = [f"{one} + {two}" for one, two in zip(*types, strict=True)]
    stage = [""] * samples
    rates = np.zeros(samples)
    written = []
    for kind, who, (first, last), until, layers in events:
        before, after = states[first], states[last + 1]
        labels[first : last + 1] = [EVENTS[kind]] * (last - first + 1)
        span = {"during": [first, last], "until": until}
        if kind == "collapse":
            ends = {"start": orbit(before), "end": orbit(after)}
            written.append({"kind": kind, "star": who, **layers, **span, **ends})
            continue
        ends = {"start": stars(before), "end": stars(after)}
        written.append({"kind": kind, "donor": who, **span, **ends})
        name = "envelope" if kind == "envelope" else "transfer"
        stage[first - 1 : until + 1] = [name] * (until - first + 2)
        if kind == "transfer":
            years = max((after["time"] - before["time"]) * 1e6, 1e-6)
            rates[first - 1 : until + 1] = (before[f"m{who}"] - after[f"m{who}"]) / years
    columns = {
        **tracks(samples, keys),
        "kind1": [REMNANTS.get(name, "star") for name in types[0]],
        "kind2": [REMNANTS.get(name, "star") for name in types[1]],
        "type1": types[0],
        "type2": types[1],
        "regime1": runs(samples, regimes[0]),
        "regime2": runs(samples, regimes[1]),
        "transfer": rates,
        "stage": stage,
        "label": labels,
    }
    return columns, written


def stable():
    types = [
        [(0, "MS"), (210, "HG"), (360, "HeMS"), (520, "HeHG"), (670, "BH")],
        [(0, "MS"), (770, "HG"), (920, "HeMS"), (1080, "HeHG"), (1230, "BH")],
    ]
    regimes = [[(0, "OB"), (421, "WR")], [(0, "OB"), (981, "WR")]]
    events = [
        ("transfer", 1, (94, 203), 203, None),
        ("transfer", 1, (310, 359), 420, None),
        ("collapse", 1, (620, 669), 719, {"hydrogen": 0.0, "helium": 4.4}),
        ("transfer", 2, (870, 919), 980, None),
        ("collapse", 2, (1180, 1229), 1279, {"hydrogen": 0.0, "helium": 3.6}),
    ]
    return scene(STABLE, types, regimes, events)


def envelope():
    types = [
        [(0, "MS"), (150, "HG"), (250, "CHeB"), (400, "HeMS"), (560, "HeHG"), (710, "BH")],
        [(0, "MS"), (810, "HG"), (910, "CHeB"), (1160, "HeMS"), (1380, "HeHG"), (1530, "BH")],
    ]
    regimes = [[(0, "OB"), (468, "WR")], [(0, "OB"), (991, "RSG"), (1315, "WR")]]
    events = [
        ("transfer", 1, (350, 399), 460, None),
        ("collapse", 1, (660, 709), 759, {"hydrogen": 0.0, "helium": 3.1}),
        ("envelope", 2, (1110, 1159), 1305, None),
        ("collapse", 2, (1480, 1529), 1579, {"hydrogen": 0.0, "helium": 3.3}),
    ]
    return scene(ENVELOPE, types, regimes, events)


def unbound():
    types = [
        [(0, "MS"), (100, "HG"), (250, "HeMS"), (410, "HeHG"), (560, "NS")],
        [(0, "MS"), (660, "HG"), (760, "CHeB"), (1360, "EAGB"), (1510, "BH")],
    ]
    regimes = [[(0, "OB"), (315, "WR")], [(0, "OB"), (807, "RSG"), (835, "GB")]]
    events = [
        ("transfer", 1, (200, 249), 310, None),
        ("collapse", 1, (510, 559), 609, {"hydrogen": 0.0, "helium": 1.32}),
        ("collapse", 2, (1460, 1509), 1559, {"hydrogen": 11.6, "helium": 2.3}),
    ]
    return scene(UNBOUND, types, regimes, events)


SCENES = (stable, envelope, unbound)


def write(index, folder=OUT):
    columns, events = SCENES[index]()
    return strix.write(
        Path(folder) / f"example_{index}.strix",
        columns,
        units="solar",
        events=events,
        source={"code": "strix", "scene": SCENES[index].__name__},
    )


if __name__ == "__main__":
    for index in range(len(SCENES)):
        print(write(index))
