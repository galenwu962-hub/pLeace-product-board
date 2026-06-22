import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PORT = int(os.environ.get("PORT", "9000"))
STATE_FILE = Path(os.environ.get("STATE_FILE", "/mnt/dashboard/dashboard-state.json"))
ALLOWED_ORIGIN = os.environ.get(
    "ALLOWED_ORIGIN",
    "https://galenwu962-hub.github.io",
)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_json(204, {})

    def do_GET(self):
        if self.path.rstrip("/") not in ("", "/state"):
            self.send_json(404, {"error": "not_found"})
            return

        try:
            if not STATE_FILE.exists():
                self.send_json(404, {"error": "state_not_initialized"})
                return
            self.send_json(200, json.loads(STATE_FILE.read_text(encoding="utf-8")))
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def do_PUT(self):
        if self.path.rstrip("/") != "/state":
            self.send_json(404, {"error": "not_found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            temporary = STATE_FILE.with_suffix(".tmp")
            temporary.write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            temporary.replace(STATE_FILE)
            self.send_json(200, {"ok": True, "updatedAt": payload.get("updatedAt")})
        except Exception as error:
            self.send_json(400, {"error": str(error)})

    def log_message(self, format_string, *args):
        print(format_string % args, flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
