"""One-time gateway installation using Coolify's existing managed SSH connection.

The Docker socket is reserved for this trusted infrastructure task. No SSH key
or API credential is read by this job. Only the fixed Matiane vhost is managed.
"""
import base64
import json
import time
from pathlib import Path
from github_poller import docker_request, decode_docker_stream

script=Path('/app/setup-matiane-gateway.sh').read_bytes()
encoded=base64.b64encode(script).decode()
code=r'''
require '/var/www/html/vendor/autoload.php';
$boot = require '/var/www/html/bootstrap/app.php';
$boot->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
try {
    $server = App\Models\Server::where('uuid','cwvw7grwld9eiyknc1ftyq24')->firstOrFail();
    if ($server->ip !== 'host.docker.internal' || $server->user !== 'root') throw new RuntimeException('Unexpected server');
    $command = 'printf %s ' . escapeshellarg('''+"'"+encoded+"'"+r''') . ' | base64 -d | bash -se';
    instant_remote_process([$command], $server, true, false, 180);
    echo json_encode(['status'=>'ready']);
} catch (Throwable $e) { fwrite(STDERR,"Gateway installation failed.\n"); exit(1); }
'''
created=json.loads(docker_request('POST','/containers/coolify/exec',{'AttachStdout':True,'AttachStderr':True,'Tty':False,'User':'9999','Cmd':['php','-r',code]}))
output=docker_request('POST','/exec/'+created['Id']+'/start',{'Detach':False,'Tty':False})
state=json.loads(docker_request('GET','/exec/'+created['Id']+'/json'))
if state.get('Running') or state.get('ExitCode')!=0:
    raise RuntimeError('Gateway installation failed')
if json.loads(decode_docker_stream(output))!={'status':'ready'}:
    raise RuntimeError('Invalid gateway result')
Path('/var/www/matiane/gateway-status.json').write_text(json.dumps({'status':'ready','hostname':'matiane.57.129.177.67.sslip.io','installedAt':time.time()}))
Path('/tmp/gateway-ready').touch()
print('Matiane secure gateway configured.',flush=True)
# This is a one-time job. Keep it alive for Coolify's deployment health check;
# the caller stops and removes the infrastructure app after HTTPS verification.
while True:
    time.sleep(30)
