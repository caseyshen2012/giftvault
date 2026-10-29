#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent


class GiftVaultHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/list/"):
            self.path = "/index.html"
        super().do_GET()


if __name__ == "__main__":
    address = ("127.0.0.1", 8000)
    print(f"GiftVault running at http://{address[0]}:{address[1]}")
    ThreadingHTTPServer(address, GiftVaultHandler).serve_forever()
