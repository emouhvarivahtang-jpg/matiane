"""Queue Coolify deployments for explicitly registered public GitHub projects.

Runs on the VPS without a public listener or API token. The Docker socket grants
administrative access; install only as trusted infrastructure, never in an app.
"""
import base64
import http.client
import json
import os
import re
import socket
import struct
import subprocess
import sys
import time
from pathlib import Path


class UnixHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/var/run/docker.sock')


def docker_request(method, path, payload=None):
    connection = UnixHTTPConnection('localhost', timeout=60)
    body = json.dumps(payload).encode() if payload is not None else None
    try:
        connection.request(method, '/v1.47' + path, body, {'Content-Type': 'application/json'})
        response = connection.getresponse()
        data = response.read()
        if response.status >= 400:
            raise RuntimeError('Docker request failed: ' + str(response.status))
        return data
    finally:
        connection.close()


def decode_docker_stream(data):
    output = bytearray()
    offset = 0
    while offset < len(data):
        if len(data) - offset < 8:
            raise RuntimeError('Incomplete Docker output')
        stream, _, _, _, length = struct.unpack('>BBBBI', data[offset:offset + 8])
        offset += 8
        if stream not in (1, 2) or offset + length > len(data):
            raise RuntimeError('Invalid Docker output')
        output.extend(data[offset:offset + length])
        offset += length
    return output.decode()


def validate_project(project):
    for key in ('application_uuid', 'project_uuid'):
        if not re.fullmatch(r'[a-z0-9]{20,32}', project.get(key, '')):
            raise ValueError('Invalid project identity')
    if not re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?', project.get('repository', '')):
        raise ValueError('Only public GitHub HTTPS repositories are supported')
    branch = project.get('branch', '')
    if not branch or subprocess.run(['git', 'check-ref-format', 'refs/heads/' + branch], capture_output=True).returncode:
        raise ValueError('Invalid branch')
    return project


def latest_commit(project):
    result = subprocess.run(
        ['git', '-c', 'credential.helper=', '-c', 'http.followRedirects=false',
         'ls-remote', '--exit-code', project['repository'], 'refs/heads/' + project['branch']],
        capture_output=True, text=True, timeout=30,
        env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'},
    )
    revision = result.stdout.split()[0] if result.stdout.split() else ''
    if result.returncode or not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise RuntimeError('Could not verify the GitHub branch')
    return revision


def deployment_code(project, revision):
    if not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('Invalid Git commit')
    encoded = base64.b64encode(json.dumps({**project, 'commit': revision}).encode()).decode()
    return r'''
require '/var/www/html/vendor/autoload.php';
$boot = require '/var/www/html/bootstrap/app.php';
$boot->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
try {
    $p = json_decode(base64_decode(''' + "'" + encoded + "'" + r'''), true, 512, JSON_THROW_ON_ERROR);
    $a = App\Models\Application::where('uuid', $p['application_uuid'])->firstOrFail();
    $repository = fn($url) => preg_replace('/\\.git$/', '', preg_replace('#^https://github.com/#', '', $url));
    if ($a->environment->project->uuid !== $p['project_uuid'] ||
        $repository($a->git_repository) !== $repository($p['repository']) ||
        $a->git_branch !== $p['branch']) { throw new RuntimeException('Registration mismatch'); }
    $state = 'unchanged';
    if (!$a->settings->is_auto_deploy_enabled) { $state = 'disabled'; }
    else {
        $q = App\Models\ApplicationDeploymentQueue::where('application_id', $a->id)->where('pull_request_id', 0);
        $pending = (clone $q)->whereIn('status', ['queued', 'in_progress'])->exists();
        $finished = (clone $q)->where('status', 'finished')->latest('id')->first();
        $last = (clone $q)->latest('id')->first();
        if ($pending) { $state = 'busy'; }
        elseif (!$finished || $finished->commit !== $p['commit']) {
            if ($last && $last->status === 'failed' && $last->commit === $p['commit'] &&
                $last->updated_at->gt(now()->subMinutes(15))) { $state = 'retry-later'; }
            else {
                $queued = queue_application_deployment(application: $a, deployment_uuid: new_public_id(),
                    commit: $p['commit'], is_api: true);
                $state = $queued['status'];
            }
        }
    }
    echo json_encode(['application_uuid' => $a->uuid, 'commit' => $p['commit'], 'status' => $state]);
} catch (Throwable $error) { fwrite(STDERR, "Could not queue the registered application.\n"); exit(1); }
'''


def queue_deployment(project, revision):
    created = json.loads(docker_request('POST', '/containers/coolify/exec', {
        'AttachStdout': True, 'AttachStderr': True, 'Tty': False, 'User': '9999',
        'Cmd': ['php', '-r', deployment_code(project, revision)],
    }))
    identifier = created['Id']
    output = docker_request('POST', '/exec/' + identifier + '/start', {'Detach': False, 'Tty': False})
    execution = json.loads(docker_request('GET', '/exec/' + identifier + '/json'))
    if execution.get('Running') or execution.get('ExitCode') != 0:
        raise RuntimeError('Coolify deployment request failed')
    return json.loads(decode_docker_stream(output))


def main():
    projects = [validate_project(p) for p in json.loads(os.environ['GITHUB_DEPLOY_PROJECTS'])]
    if not projects:
        raise ValueError('Register at least one project')
    interval = max(30, int(os.environ.get('GITHUB_POLL_SECONDS', '60')))
    state_file = Path('/state/heartbeat.json')
    state_file.parent.mkdir(parents=True, exist_ok=True)
    while True:
        reports = []
        for project in projects:
            try:
                report = queue_deployment(project, latest_commit(project))
            except Exception as error:
                report = {'application_uuid': project['application_uuid'], 'status': 'error', 'reason': type(error).__name__}
            reports.append(report)
            print(json.dumps(report), flush=True)
        temporary = state_file.with_suffix('.tmp')
        temporary.write_text(json.dumps({'checked_at': time.time(), 'projects': reports}))
        temporary.replace(state_file)
        time.sleep(interval)


if __name__ == '__main__':
    if sys.argv[1:] == ['healthcheck']:
        checked = json.loads(Path('/state/heartbeat.json').read_text())['checked_at']
        sys.exit(0 if time.time() - checked < 180 else 1)
    else:
        main()
