"""Check the generated HTTP/TLS gateway with real Nginx in isolated containers.

Requires Docker, Python 3, Bash and OpenSSL. Does not contact or change the VPS.
Run: python3 deploy/test_coolify_connection.py
"""
from pathlib import Path
import subprocess
import tempfile
import unittest
import uuid


ROOT = Path(__file__).resolve().parent.parent
HOST = "coolify.57.129.177.67.sslip.io"

MOCK = r'''
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import base64, hashlib, json
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *_): pass
    def do_GET(self):
        if self.headers.get("Upgrade", "").lower() == "websocket":
            self.send_response(101)
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            key = self.headers["Sec-WebSocket-Key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            self.send_header("Sec-WebSocket-Accept", base64.b64encode(hashlib.sha1(key.encode()).digest()).decode())
            self.end_headers()
            self.close_connection = True
            return
        data = json.dumps({"path": self.path, "host": self.headers.get("Host"),
                           "proto": self.headers.get("X-Forwarded-Proto")}).encode()
        self.send_response(401 if self.path == "/api/v1/version" else 200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
'''

CLIENT = r'''
import http.client, json, socket, ssl, sys, time
destination, host, mode = sys.argv[1:]
context = ssl.create_default_context(cafile="/test/certs/ca.crt")
def request(path, tls=False, websocket=False, host_header=None):
    raw = socket.create_connection((destination, 443 if tls else 80), timeout=5)
    sock = context.wrap_socket(raw, server_hostname=host) if tls else raw
    extra = "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n" if websocket else "Connection: close\r\n"
    sock.sendall((f"GET {path} HTTP/1.1\r\nHost: {host_header or host}\r\n" + extra + "\r\n").encode())
    response = http.client.HTTPResponse(sock)
    response.begin()
    result = response.status, dict(response.getheaders()), response.read()
    sock.close()
    return result
for attempt in range(30):
    try:
        status, headers, body = request("/.well-known/acme-challenge/proof")
        break
    except OSError:
        if attempt == 29: raise
        time.sleep(0.1)
assert status == 200 and body == b"acme-proof", (status, body)
status, _, body = request("/", host_header="57.129.177.67")
assert status == 200 and body == b"Existing Matiane", (status, body)
if mode == "http":
    status, _, body = request("/api/health")
    assert status == 200 and json.loads(body)["proto"] == "http"
else:
    status, headers, _ = request("/api/health")
    assert status == 301 and headers["Location"] == "https://" + host + "/api/health"
    status, _, body = request("/api/health", tls=True)
    assert status == 200 and json.loads(body)["host"] == host and json.loads(body)["proto"] == "https"
    status, _, _ = request("/api/v1/version", tls=True)
    assert status == 401
    for path in ("/app/example", "/terminal/ws"):
        status, headers, _ = request(path, tls=True, websocket=True)
        assert status == 101 and headers["Upgrade"].lower() == "websocket"
print("Verified " + mode + ": ACME, backend routing, headers" + (", verified TLS, redirects and WebSockets" if mode == "tls" else ""))
'''


class GatewayTest(unittest.TestCase):
    def test_http_and_verified_https(self):
        prefix = "matiane-gateway-test-" + uuid.uuid4().hex[:10]
        network, mock, nginx = prefix, prefix + "-mock", prefix + "-nginx"

        def run(*args, input=None):
            result = subprocess.run(args, input=input, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            return result.stdout.strip()

        with tempfile.TemporaryDirectory(prefix="matiane-gateway-") as directory:
            base = Path(directory)
            # Docker may run containers with a different UID from the workspace user.
            base.chmod(0o755)
            (base / "acme/.well-known/acme-challenge").mkdir(parents=True)
            (base / "acme/.well-known/acme-challenge/proof").write_text("acme-proof")
            for path in (base / "acme").rglob("*"):
                path.chmod(0o755 if path.is_dir() else 0o644)
            (base / "acme").chmod(0o755)
            certs = base / "certs"
            certs.mkdir()
            run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                "-subj", "/CN=Matiane test CA", "-keyout", str(certs / "ca.key"), "-out", str(certs / "ca.crt"))
            run("openssl", "req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=" + HOST,
                "-keyout", str(certs / "privkey.pem"), "-out", str(certs / "leaf.csr"))
            (certs / "extensions").write_text("subjectAltName=DNS:" + HOST + "\nextendedKeyUsage=serverAuth\n")
            run("openssl", "x509", "-req", "-in", str(certs / "leaf.csr"), "-CA", str(certs / "ca.crt"),
                "-CAkey", str(certs / "ca.key"), "-CAcreateserial", "-days", "1",
                "-extfile", str(certs / "extensions"), "-out", str(certs / "fullchain.pem"))
            (base / "mock.py").write_text(MOCK)
            configs = base / "config"
            configs.mkdir()
            (configs / "legacy.conf").write_text('server { listen 80; server_name 57.129.177.67; location / { return 200 "Existing Matiane"; } }\n')
            try:
                run("docker", "network", "create", network)
                run("docker", "run", "-d", "--network", network, "--name", mock,
                    "-v", str(base) + ":/test:ro",
                    "python:3.12-alpine", "python", "/test/mock.py")
                for mode in ("http", "tls"):
                    config = run("bash", "-c", 'source "$1"; render_coolify_nginx "$2" "$3" "$4" "$4" "$4"',
                                 "renderer", str(ROOT / "deploy/connect-coolify.sh"), HOST, mode, mock + ":8000")
                    (configs / "default.conf").write_text(config + "\n")
                    if mode == "http":
                        run("docker", "run", "-d", "--network", network, "--name", nginx,
                            "-v", str(configs) + ":/etc/nginx/conf.d:ro",
                            "-v", str(certs) + ":/etc/letsencrypt/live/" + HOST + ":ro",
                            "-v", str(base / "acme") + ":/var/lib/coolify-codex-acme:ro", "nginx:1.28.0-alpine")
                    else:
                        run("docker", "exec", nginx, "nginx", "-t")
                        run("docker", "exec", nginx, "nginx", "-s", "reload")
                    output = run("docker", "exec", "-i", mock, "python", "-", nginx, HOST, mode, input=CLIENT)
                    print(output, flush=True)
            finally:
                for container in (nginx, mock):
                    subprocess.run(["docker", "rm", "-f", container], capture_output=True)
                subprocess.run(["docker", "network", "rm", network], capture_output=True)


if __name__ == "__main__":
    unittest.main()
