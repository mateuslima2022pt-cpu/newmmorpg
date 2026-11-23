import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { action, createWorld, join, snapshot, tick } from './public/game.js';

const project = fileURLToPath(new URL('.', import.meta.url));
const publicFiles = resolve(project, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip' };

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function textBody(request, limit = 1800) {
  const parts = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('Body too large');
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
}
async function available(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}
async function file(response, path, download = false) {
  const info = await stat(path);
  if (!info.isFile()) return json(response, 404, { error: 'Arquivo indisponível.' });
  response.writeHead(200, {
    'Content-Type': types[extname(path)] || 'application/octet-stream',
    'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': download ? 'no-store' : 'no-cache',
    ...(download ? { 'Content-Disposition': 'attachment; filename="' + basename(path) + '"' } : {}),
  });
  const stream = createReadStream(path);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

export function createGameServer({ downloadDir = resolve(project, 'downloads') } = {}) {
  const world = createWorld(), sessions = new Map();
  const zipPath = resolve(downloadDir, 'perfect-2.5d.zip');
  const hostedOfflinePath = resolve(downloadDir, 'Perfect-2.5D.html');
  const localOfflinePath = resolve(project, 'Perfect-2.5D.html');
  function remove(token) {
    const session = sessions.get(token);
    if (!session) return;
    session.stream?.end();
    world.players.delete(session.id);
    sessions.delete(token);
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (request.method === 'POST' && path === '/api/join') {
        if (sessions.size >= 24) return json(response, 503, { error: 'O campo está cheio.' });
        const input = JSON.parse(await textBody(request) || '{}');
        if (sessions.size >= 24) return json(response, 503, { error: 'O campo está cheio.' });
        const id = randomUUID(), token = randomUUID();
        join(world, id, { name: input.name });
        sessions.set(token, { id, stream: null, after: world.sequence, last: world.time, window: world.time, count: 0 });
        return json(response, 201, { token });
      }
      if (request.method === 'GET' && path === '/api/events') {
        const token = url.searchParams.get('token'), session = sessions.get(token);
        if (!session) return json(response, 401, { error: 'Sessão desconhecida.' });
        session.stream?.end();
        session.stream = response;
        session.last = world.time;
        const since = Number(request.headers['last-event-id']);
        if (Number.isSafeInteger(since) && since >= 0 && since <= world.sequence) session.after = since;
        response.writeHead(200, {
          'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
        });
        response.write('retry: 1100\n\n');
        response.on('close', () => {
          if (session.stream !== response) return;
          session.stream = null;
          session.last = world.time;
          action(world, world.players.get(session.id), { type: 'move', x: 0, z: 0 });
        });
        return;
      }
      if (request.method === 'POST' && path === '/api/action') {
        const session = sessions.get(request.headers['x-session']);
        if (!session) return json(response, 401, { error: 'Sessão desconhecida.' });
        if (world.time - session.window >= 1) { session.window = world.time; session.count = 0; }
        if (++session.count > 34) return json(response, 429, { error: 'Aguarde um instante.' });
        const command = JSON.parse(await textBody(request));
        if (!command || typeof command !== 'object') return json(response, 400, { error: 'Comando inválido.' });
        action(world, world.players.get(session.id), command);
        session.last = world.time;
        response.writeHead(204);
        return response.end();
      }
      if (request.method === 'POST' && path === '/api/leave') {
        remove(await textBody(request, 128));
        response.writeHead(204);
        return response.end();
      }
      if (request.method !== 'GET') return json(response, 405, { error: 'Método indisponível.' });
      if (path === '/api/downloads') {
        const [zip, hosted, local] = await Promise.all([available(zipPath), available(hostedOfflinePath), available(localOfflinePath)]);
        return json(response, 200, { zip, offline: hosted || local });
      }
      if (path === '/download/perfect-2.5d.zip') return await file(response, zipPath, true);
      if (path === '/download/Perfect-2.5D.html') {
        return await file(response, await available(hostedOfflinePath) ? hostedOfflinePath : localOfflinePath, true);
      }
      if (path.startsWith('/api/')) return json(response, 404, { error: 'Rota desconhecida.' });
      const asset = resolve(publicFiles, '.' + (path === '/' ? '/index.html' : path));
      if (!asset.startsWith(publicFiles + sep)) return json(response, 404, { error: 'Arquivo indisponível.' });
      return await file(response, asset);
    } catch (error) {
      if (!response.headersSent && !response.destroyed) {
        const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
        json(response, missing ? 404 : 400, { error: missing ? 'Arquivo indisponível.' : 'Pedido inválido.' });
      } else if (!response.writableEnded) response.destroy();
    }
  });
  let previous = performance.now(), lastPush = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    tick(world, Math.min(.1, (now - previous) / 1000));
    previous = now;
    if (world.time - lastPush < .058) return;
    lastPush = world.time;
    for (const [token, session] of sessions) {
      if (!session.stream) {
        if (world.time - session.last > 22) remove(token);
        continue;
      }
      if (session.stream.writableLength > 75_000) { session.stream.destroy(); continue; }
      const frame = snapshot(world, session.id, session.after);
      session.stream.write('id: ' + frame.sequence + '\ndata: ' + JSON.stringify(frame) + '\n\n');
      session.after = frame.sequence;
    }
  }, 24);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createGameServer({ downloadDir: process.env.PERFECT_DOWNLOADS });
  const port = Number(process.env.PERFECT_PORT || 4173), host = process.env.PERFECT_HOST || '127.0.0.1';
  server.listen(port, host, () => console.log('Perfect 2.5D · http://' + host + ':' + server.address().port));
}
