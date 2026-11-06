import argparse
from pathlib import Path

from strix import sailfish
from strix.engine import render, view


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser(
        prog="strix", description="Show or render a binary star scene."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    shown = commands.add_parser("view", help="open the interactive viewer")
    shown.add_argument("scene", type=Path)
    shown.add_argument("--port", type=int, default=0)
    shown.add_argument("--no-browser", action="store_true")

    rendered = commands.add_parser("render", help="render an mp4")
    rendered.add_argument("scene", type=Path)
    rendered.add_argument("out", type=Path)
    rendered.add_argument("--width", type=int, default=1920)
    rendered.add_argument("--height", type=int, default=1080)

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
    if args.command == "view":
        view(args.scene, port=args.port, open_browser=not args.no_browser)
    elif args.command == "sailfish":
        sailfish.convert(
            args.products,
            args.out,
            separation=args.separation,
            mass=args.mass,
            seconds=args.seconds,
            pixels=args.pixels,
        )
    else:
        render(args.scene, args.out, width=args.width, height=args.height)


if __name__ == "__main__":
    main()
