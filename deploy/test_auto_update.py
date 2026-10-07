"""Exercise real Git updates, npm tests/builds, HTTP verification and rollback.

Run: python3 deploy/test_auto_update.py
Uses an isolated temporary checkout and a local static HTTP server.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest


ROOT = Path(__file__).resolve().parent.parent
RUNNER = ROOT / "deploy/auto-update.sh"


class DeploymentTest(unittest.TestCase):
    def test_real_updates_failures_and_local_changes(self):
        with tempfile.TemporaryDirectory(prefix="matiane-deploy-test-") as directory:
            base = Path(directory)
            remote, app, web, writer = [base / name for name in ("remote.git", "app", "web", "writer")]
            (web / "releases").mkdir(parents=True)
            app.mkdir()

            def command(*args, cwd=None):
                result = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                return result.stdout.strip()

            command("git", "clone", "--bare", str(ROOT), str(remote))
            initial = command("git", "-C", str(ROOT), "rev-parse", "HEAD")
            command("git", "-C", str(remote), "update-ref", "refs/heads/main", initial)
            command("git", "-C", str(remote), "symbolic-ref", "HEAD", "refs/heads/main")
            command("git", "clone", str(remote), str(app / "source"))
            command("git", "clone", str(remote), str(writer))
            # The one-time installer may already serve this exact commit without metadata.
            manual_release = web / "releases" / initial
            manual_release.mkdir()
            (manual_release / "index.html").write_text("Earlier manual installation")
            (web / "current").symlink_to(manual_release)

            class Handler(http.server.SimpleHTTPRequestHandler):
                inject_failure = False

                def log_message(self, *_):
                    pass

                def do_GET(self):
                    if self.inject_failure and self.path == "/index.html":
                        self.send_response(503 if self.inject_failure == "http-error" else 200)
                        self.end_headers()
                        if self.inject_failure != "http-error":
                            self.wfile.write(b"wrong website")
                    else:
                        super().do_GET()

            server = http.server.ThreadingHTTPServer(
                ("127.0.0.1", 0), functools.partial(Handler, directory=str(web / "current"))
            )
            threading.Thread(target=server.serve_forever, daemon=True).start()
            environment = {
                **os.environ,
                "MATIANE_APP_ROOT": str(app),
                "MATIANE_WEB_ROOT": str(web),
                "MATIANE_REPOSITORY": str(remote),
                "MATIANE_CHECK_URL": f"http://127.0.0.1:{server.server_port}",
                "NPM_CONFIG_CACHE": os.environ.get("NPM_CONFIG_CACHE", str(base / "npm-cache")),
            }

            def update(success=True):
                result = subprocess.run(["bash", str(RUNNER)], env=environment, capture_output=True, text=True)
                if success:
                    self.assertEqual(result.returncode, 0, result.stdout[-6000:] + result.stderr[-3000:])
                else:
                    self.assertNotEqual(result.returncode, 0)
                return result

            def commit(message):
                command("git", "-C", str(writer), "add", ".")
                command("git", "-C", str(writer), "-c", "user.name=Deployment test", "-c",
                        "user.email=deployment-test@example.invalid", "commit", "-m", message)
                command("git", "-C", str(writer), "push", "origin", "main")
                return command("git", "-C", str(writer), "rev-parse", "HEAD")

            def deployed():
                return json.loads((web / "current/deploy-info.json").read_text())["commit"]

            try:
                update()
                self.assertEqual(deployed(), initial)
                self.assertTrue((manual_release / "index.html").is_file())
                timestamp = (web / "current").lstat().st_mtime_ns
                self.assertIn("Already serving", update().stdout)
                self.assertEqual((web / "current").lstat().st_mtime_ns, timestamp)
                print("Verified: real build, served files, and repeatable update.", flush=True)

                # Emulate a lazy chunk required by a browser tab open before the next release.
                (web / "current/assets/old-lazy-chunk.js").write_text("export default 'old';")
                index = writer / "index.html"
                index.write_text(index.read_text().replace("Stories worth keeping", "Automated deployment test"))
                second = commit("Update the test page")
                update()
                self.assertEqual(deployed(), second)
                self.assertTrue((web / "current/assets/old-lazy-chunk.js").is_file())
                print("Verified: Git updates publish and retain earlier lazy chunks.", flush=True)

                main = writer / "src/main.jsx"
                valid_main = main.read_text()
                main.write_text(valid_main + "\nconst = intentionally invalid;\n")
                commit("Introduce an invalid test build")
                update(success=False)
                self.assertEqual(deployed(), second)
                print("Verified: failed builds keep the active site unchanged.", flush=True)

                main.write_text(valid_main)
                fixed = commit("Repair the test build")
                # curl --fail must stop verification even when its old output file matches.
                (app / ".served-file").write_bytes((web / "current/index.html").read_bytes())
                Handler.inject_failure = "http-error"
                result = update(success=False)
                self.assertIn("previous site was restored", result.stderr)
                self.assertEqual(deployed(), second)
                Handler.inject_failure = True
                result = update(success=False)
                self.assertIn("previous site was restored", result.stderr)
                self.assertEqual(deployed(), second)
                Handler.inject_failure = False
                update()
                self.assertEqual(deployed(), fixed)
                print("Verified: HTTP failures roll back and later updates recover.", flush=True)

                index.write_text(index.read_text() + "\n<!-- next revision -->\n")
                commit("Create another incoming update")
                local_file = app / "source/src/model.js"
                local_file.write_text(local_file.read_text() + "\n// Existing user change\n")
                preserved = local_file.read_bytes()
                update(success=False)
                self.assertEqual(local_file.read_bytes(), preserved)
                self.assertEqual(deployed(), fixed)
                print("Verified: pre-existing local edits are preserved.", flush=True)
            finally:
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
