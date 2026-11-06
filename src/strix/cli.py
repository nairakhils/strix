import argparse
from pathlib import Path

from strix import sailfish


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser(
        prog="strix", description="Turn simulations into strix scenes."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    converted = commands.add_parser("sailfish", help="turn Sailfish products into a scene")
    converted.add_argument("products", type=Path, nargs="+")
    converted.add_argument("out", type=Path)
    converted.add_argument(
        "--separation", type=float, default=sailfish.SEPARATION, help="a in Rsun"
    )
    converted.add_argument("--mass", type=float, default=sailfish.MASS, help="M in Msun")
    converted.add_argument("--seconds", type=float, default=sailfish.SECONDS, help="movie length")
    converted.add_argument("--pixels", type=int, default=sailfish.PIXELS)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_arguments(argv)
    sailfish.convert(
        args.products,
        args.out,
        separation=args.separation,
        mass=args.mass,
        seconds=args.seconds,
        pixels=args.pixels,
    )


if __name__ == "__main__":
    main()
