import net from 'node:net';
import { spawn } from 'node:child_process';

const ports = [3001, 3002];
const states = await Promise.all(ports.map(isListening));

if (states.every(Boolean)) {
  console.log('Nexo já está em execução: API http://localhost:3001 e web http://localhost:3002.');
  process.exit(0);
}

if (states.some(Boolean)) {
  const occupied = ports.filter((_, index) => states[index]).join(', ');
  console.error(`Inicialização cancelada: a(s) porta(s) ${occupied} já está(ão) ocupada(s). Pare a instância anterior ou libere ambas as portas antes de iniciar.`);
  process.exit(1);
}

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(command, ['--parallel', '--filter', '@nexo/api', '--filter', '@nexo/web', 'dev:fixed-port'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
child.on('exit', (code) => process.exit(code ?? 1));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}
