"""Verify actual Nginx publication, retained chunks and HTTP-failure rollback.

Build matiane:coolify-test first, then run this script. Uses isolated containers.
"""
from pathlib import Path
import json
import os
import subprocess
import tempfile
import time
import unittest
import uuid


class PublicationTest(unittest.TestCase):
    def test_publication_and_rollback(self):
        prefix = 'matiane-publication-test-' + uuid.uuid4().hex[:8]
        network, legacy = prefix, prefix + '-nginx'
        public_root = '/var/www/matiane'

        def run(*args, check=True):
            result = subprocess.run(args, capture_output=True, text=True)
            if check:
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            return result

        with tempfile.TemporaryDirectory(prefix=prefix) as directory:
            base = Path(directory)
            base.chmod(0o755)
            root = base / 'matiane'
            previous = root / 'releases/old'
            (previous / 'assets').mkdir(parents=True)
            root.chmod(0o755)
            (previous / 'assets/old-open-tab.js').write_text('old chunk')
            (previous / 'index.html').write_text('previous website')
            (root / 'current').symlink_to(public_root + '/releases/old')
            for path in root.rglob('*'):
                if not path.is_symlink():
                    path.chmod(0o755 if path.is_dir() else 0o644)
            config = base / 'default.conf'
            config.write_text('server { listen 80; server_name _; root /var/www/matiane/current; '
                              'location /fail/ { return 503; } location / { try_files $uri $uri/ /index.html; } }')
            try:
                run('docker', 'network', 'create', network)
                run('docker', 'run', '-d', '--name', legacy, '--network', network,
                    '-v', str(root) + ':' + public_root + ':ro',
                    '-v', str(config) + ':/etc/nginx/conf.d/default.conf:ro', 'nginx:1.28.0-alpine')
                for attempt in range(30):
                    ready = run('docker', 'exec', legacy, 'wget', '-qO-', 'http://127.0.0.1', check=False)
                    if ready.returncode == 0:
                        break
                    time.sleep(0.1)
                if ready.returncode:
                    diagnostic = run('docker', 'exec', legacy, 'ls', '-ld', '/var/www/matiane', '/var/www/matiane/current', '/var/www/matiane/releases', '/var/www/matiane/releases/old', '/var/www/matiane/current/index.html', check=False)
                    self.fail(ready.stderr + diagnostic.stdout + diagnostic.stderr)
                self.assertEqual(ready.stdout, 'previous website')

                def publish(revision, suffix=''):
                    return run('docker', 'run', '--rm', '--network', network,
                               '-v', str(root) + ':' + public_root,
                               '-e', 'MATIANE_PUBLICATION_ROOT=' + public_root,
                               '-e', 'MATIANE_CHECK_URL=http://' + legacy + suffix,
                               '-e', 'SOURCE_COMMIT=' + revision,
                               '--entrypoint', 'sh', os.environ.get('MATIANE_TEST_IMAGE', 'matiane:coolify-test'),
                               '/docker-entrypoint.d/40-publish-matiane.sh', check=False)

                good = 'a' * 40
                result = publish(good)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(root.joinpath('current').readlink().as_posix(), public_root + '/releases/' + good + '-coolify')
                self.assertEqual((root / 'releases' / (good + '-coolify') / 'assets/old-open-tab.js').read_text(), 'old chunk')
                metadata = run('docker', 'exec', legacy, 'wget', '-qO-', 'http://127.0.0.1/deploy-info.json')
                self.assertEqual(json.loads(metadata.stdout)['commit'], good)
                for bad_url in ('/fail', '/wrong-prefix'):
                    failed = publish('b' * 40, bad_url)
                    self.assertNotEqual(failed.returncode, 0)
                    self.assertIn('previous website was restored', failed.stderr)
                    metadata = run('docker', 'exec', legacy, 'wget', '-qO-', 'http://127.0.0.1/deploy-info.json')
                    self.assertEqual(json.loads(metadata.stdout)['commit'], good)
                self.assertEqual(publish(good).returncode, 0)
                self.assertFalse(list(root.glob('.current-*')))
                print('Verified HTTP publication, retained chunks, failed/mismatched HTTP rollback and idempotence.')
            finally:
                subprocess.run(['docker', 'rm', '-f', legacy], capture_output=True)
                subprocess.run(['docker', 'network', 'rm', network], capture_output=True)
                # Releases were created by container root; remove only this test's files.
                subprocess.run(['docker', 'run', '--rm', '-v', str(base) + ':/test',
                                '--entrypoint', 'sh', 'nginx:1.28.0-alpine', '-c',
                                'rm -rf /test/matiane'], capture_output=True)


if __name__ == '__main__':
    unittest.main()
