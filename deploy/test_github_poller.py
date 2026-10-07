"""Check registry validation, branch lookup and Docker queue transport."""
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('poller', Path(__file__).with_name('github-poller.py'))
poller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poller)
PROJECT = {'application_uuid': 'a' * 24, 'project_uuid': 'b' * 24,
           'repository': 'https://github.com/example/project.git', 'branch': 'main'}
COMMIT = 'c' * 40


class PollerTest(unittest.TestCase):
    def test_reject_untrusted_registry_and_invalid_refs(self):
        self.assertEqual(poller.validate_project(PROJECT), PROJECT)
        for repository in ('http://github.com/example/project', 'https://evil.test/example/project',
                           'https://github.com/example/project?token=x', '--upload-pack=bad'):
            with self.assertRaises(ValueError):
                poller.validate_project({**PROJECT, 'repository': repository})
        for branch in ('bad..branch', 'main; command', '', '../main'):
            with self.assertRaises(ValueError):
                poller.validate_project({**PROJECT, 'branch': branch})

    def test_latest_commit_failure_does_not_queue(self):
        with patch.object(poller.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, COMMIT + '\trefs/heads/main\n')):
            self.assertEqual(poller.latest_commit(PROJECT), COMMIT)
        with patch.object(poller.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '')):
            with self.assertRaises(RuntimeError):
                poller.latest_commit(PROJECT)

    def test_exec_frame_transport_and_fail_closed(self):
        report = {'application_uuid': PROJECT['application_uuid'], 'commit': COMMIT, 'status': 'queued'}
        body = json.dumps(report).encode()
        frame = struct.pack('>BBBBI', 1, 0, 0, 0, len(body)) + body
        responses = [b'{"Id":"test-exec"}', frame, b'{"Running":false,"ExitCode":0}']
        with patch.object(poller, 'docker_request', side_effect=responses) as request:
            self.assertEqual(poller.queue_deployment(PROJECT, COMMIT), report)
            creation = request.call_args_list[0]
            self.assertEqual(creation.args[1], '/containers/coolify/exec')
            self.assertEqual(creation.args[2]['User'], '9999')
        with patch.object(poller, 'docker_request', side_effect=[responses[0], frame, b'{"Running":false,"ExitCode":1}']):
            with self.assertRaises(RuntimeError):
                poller.queue_deployment(PROJECT, COMMIT)
        with self.assertRaises(ValueError):
            poller.deployment_code(PROJECT, 'HEAD; unexpected command')
        with self.assertRaises(RuntimeError):
            poller.decode_docker_stream(frame[:-1])


if __name__ == '__main__':
    unittest.main()
