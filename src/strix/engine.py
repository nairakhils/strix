import shutil
import socket
import subprocess
import time
import webbrowser
from pathlib import Path

WEB = Path(__file__).resolve().parents[2] / "web"


def node(tool, *arguments):
    if shutil.which("node") is None:
        raise RuntimeError("strix needs Node.js to show or render a scene")
    if not (WEB / "node_modules").is_dir():
        raise RuntimeError(f"run npm install in {WEB} first")
    return ["node", str(WEB / "tools" / tool), *map(str, arguments)]


def checked(scene):
    scene = Path(scene).resolve()
    if not scene.is_file():
        raise FileNotFoundError(scene)
    return scene


def render(scene, out, *, width=1920, height=1080):
    scene = checked(scene)
    out = Path(out).resolve()
    command = node(
        "render.mjs", "--scene", scene, "--out", out, "--width", width, "--height", height
    )
    subprocess.run(command, cwd=WEB, check=True)
    return out


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def wait_for(server, port):
    deadline = time.monotonic() + 10
    while server.poll() is None and time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                return
        except OSError:
            time.sleep(0.05)
    server.terminate()
    server.wait()
    raise RuntimeError(f"the strix server did not start on port {port}")


def view(scene, *, port=0, open_browser=True):
    scene = checked(scene)
    port = port or free_port()
    server = subprocess.Popen(node("serve.mjs", "--scene", scene, "--port", port), cwd=WEB)
    try:
        wait_for(server, port)
        url = f"http://localhost:{port}/"
        print(url)
        if open_browser:
            webbrowser.open(url)
        server.wait()
    except KeyboardInterrupt:
        server.terminate()
        server.wait()
