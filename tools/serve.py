# Local preview of website/ at http://localhost:8765 (or another port: python3 tools/serve.py 8766).
# Like "python3 -m http.server", but it tells the browser not to keep copies,
# so a normal reload always shows the latest files.
# Run from the repo root: python3 tools/serve.py
import functools
import http.server
import sys
from pathlib import Path


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


site = Path(__file__).resolve().parent.parent / "website"
handler = functools.partial(NoCache, directory=str(site))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f"Serving website/ at http://localhost:{port} (no browser cache). Stop with Ctrl-C.")
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
