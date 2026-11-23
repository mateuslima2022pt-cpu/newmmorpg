import * as T from './vendor/three.module.js';
import { buildScenery, mesh } from './scenery.js';
import { addActor, poseActor } from './actors.js';
import { SoftwareRenderer } from './software.js';
import { FIELD, BRIDGE, GUARD, KINDS, PATHS, SHRINE, SKILLS, SPAWN, TOWN_GATE, clamp, distance, height, riverX, standingHeight } from './world.js';
import { action, createWorld, join, QUEST, snapshot, tick } from './game.js';

const $ = id => document.getElementById(id);
const canvas = $('world'), worldUI = $('world-ui');
const dialog = $('dialog'), body = $('dialog-body'), dialogActions = $('dialog-actions');
const scene = new T.Scene(), camera = new T.OrthographicCamera(-16, 16, 14, -14, .1, 180);
const ray = new T.Raycaster(), pointer = new T.Vector2(), projected = new T.Vector3();
const focus = new T.Vector3(-.8, .7, -2.4);
const keyboard = new Set(), models = new Map(), feedback = [];
const track = { width: 0, height: 0, angle: .50, tilt: .63, zoom: 1, drag: null };
const mapCache = new Map();
const saveKey = 'perfect-25d-player-v1';
const motionKey = new Map([
  ['KeyW', [0, -1]], ['ArrowUp', [0, -1]], ['KeyS', [0, 1]], ['ArrowDown', [0, 1]],
  ['KeyA', [-1, 0]], ['ArrowLeft', [-1, 0]], ['KeyD', [1, 0]], ['ArrowRight', [1, 0]],
]);
let frame, world, player, seen = 0, renderer, scenery, lastFrame = 0, lastHUD = -1, lastSave = -1;
let session, eventSource, commandQueue = Promise.resolve(), connected = false, dialogType = '', previewMap;
let currentVector = { x: 0, z: 0 }, questKey = '', toastTimer, targetCharacter;

function readSave() {
  try { return JSON.parse(localStorage.getItem(saveKey)); } catch { return null; }
}
function writeSave(data) {
  try { localStorage.setItem(saveKey, JSON.stringify(data)); } catch { /* The browser may block local storage. */ }
}
function startSolo() {
  world = createWorld();
  player = join(world, 'local', readSave());
  frame = snapshot(world, player.id);
}
async function connect() {
  if (location.protocol === 'file:' || new URLSearchParams(location.search).has('solo')) return;
  try {
    const response = await fetch('./api/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: readSave()?.name }), signal: AbortSignal.timeout(2300),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
    session = await response.json();
    eventSource = new EventSource('./api/events?token=' + encodeURIComponent(session.token));
    eventSource.onmessage = event => {
      const next = JSON.parse(event.data);
      if (!connected && !next.self) return;
      if (!connected) {
        connected = true;
        seen = next.sequence;
        questKey = '';
        $('chat-button').hidden = false;
      }
      frame = next;
    };
    eventSource.onerror = () => {
      if (connected) $('mode').textContent = 'RECONECTANDO';
    };
    window.addEventListener('pagehide', event => {
      if (!event.persisted) navigator.sendBeacon('./api/leave', session.token);
    });
  } catch { /* Opening the bundled game uses the solo simulation. */ }
}
function send(command) {
  if (!connected) {
    action(world, player, command);
    return;
  }
  commandQueue = commandQueue.then(async () => {
    const response = await fetch('./api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session': session.token },
      body: JSON.stringify(command), signal: AbortSignal.timeout(2200),
    });
    if (!response.ok && response.status === 401) {
      eventSource.close();
      connected = false;
      session = null;
      seen = 0;
      questKey = '';
      $('chat-button').hidden = $('chat-box').hidden = true;
      startSolo();
      toast('Sessão encerrada. Modo solo ativado.');
    }
  }).catch(() => toast('Conexão instável. Tente novamente.'));
}

function uiButton(name, handler, secondary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = name;
  if (secondary) button.className = 'secondary';
  button.addEventListener('click', handler);
  dialogActions.append(button);
}
function openPanel(key, kicker, title) {
  clearMotion();
  dialogType = key;
  $('dialog-kicker').textContent = kicker;
  $('dialog-title').textContent = title;
  body.replaceChildren();
  dialogActions.replaceChildren();
  if (!dialog.open) dialog.showModal();
}
function p(text, className = '') {
  const line = document.createElement('p');
  line.textContent = text;
  if (className) line.className = className;
  body.append(line);
}
function mission(stage) {
  openPanel('quest', GUARD.name, QUEST.title);
  if (stage === 'start') {
    p(QUEST.intro);
    p(QUEST.reward, 'reward');
    uiButton('Aceitar patrulha', () => { send({ type: 'quest' }); dialog.close(); });
    uiButton('Depois', () => dialog.close(), true);
  } else if (stage === 'return') {
    p(QUEST.complete);
    p(QUEST.reward, 'reward');
    uiButton('Concluir patrulha', () => { send({ type: 'quest' }); dialog.close(); });
  } else {
    p(stage === 'done' ? 'Bom trabalho na estrada, patrulheiro.' : QUEST.progress);
    uiButton('Voltar ao campo', () => dialog.close());
  }
}
function help() {
  openPanel('help', 'Teclado e mouse', 'Controles');
  p('Mova-se com WASD, as setas ou clicando no terreno. Em telas sensíveis ao toque, toque no destino.');
  p('Clique numa criatura para se aproximar e atacar. Use 1 a 4 para as habilidades, Tab para selecionar um alvo e E para conversar.');
  p('Arraste com o botão direito para girar a câmera. Use a roda do mouse para ajustar o zoom e R para redefinir a vista.');
  if (location.protocol !== 'file:' && !new URLSearchParams(location.search).has('desktop')) {
    const downloads = document.createElement('div');
    body.append(downloads);
    fetch('./api/downloads', { signal: AbortSignal.timeout(1800) }).then(async response => {
      if (!response.ok) return;
      const files = await response.json();
      for (const [enabled, href, name] of [
        [files.offline, './download/Perfect-2.5D.html', 'Baixar jogo de navegador offline ↓'],
        [files.zip, './download/perfect-2.5d.zip', 'Baixar projeto para navegador e desktop ↓'],
      ]) {
        if (!enabled) continue;
        const link = document.createElement('a');
        link.href = href;
        link.textContent = name;
        link.className = 'download';
        downloads.append(link);
      }
    }).catch(() => { /* Downloads are optional when playing from a local server. */ });
  }
  uiButton('Voltar ao campo', () => dialog.close());
}
function addEntry(title, tag, description, ink) {
  const entry = document.createElement('div');
  entry.className = 'entry';
  const heading = document.createElement('strong'), label = document.createElement('span'), details = document.createElement('small');
  heading.textContent = title;
  if (ink) heading.style.color = ink;
  label.textContent = tag;
  details.textContent = description;
  entry.append(heading, label, details);
  body.append(entry);
}
function bestiary() {
  openPanel('bestiary', FIELD.name, 'Bestiário');
  for (const kind of Object.values(KINDS)) addEntry(kind.name, 'Nível ' + kind.level, kind.habitat + ' · ' + kind.note, kind.color);
  uiButton('Fechar', () => dialog.close());
}
function inventory() {
  openPanel('inventory', frame.self.name, 'Inventário');
  addEntry('Poção de vida', '× ' + frame.self.potions, 'Recupera 50 pontos de vida. Atalho 3.');
  addEntry('Moedas de cobre', '× ' + frame.self.coins, 'Recompensas da patrulha e do combate.');
  uiButton('Fechar', () => dialog.close());
}
function profile() {
  openPanel('profile', 'Sentinela · Humano', frame.self.name);
  p('Nível ' + frame.self.level + ' · ' + frame.self.xp + ' XP · ' + frame.self.coins + ' moedas');
  const form = document.createElement('form'), label = document.createElement('label'), input = document.createElement('input');
  label.textContent = 'Nome do personagem';
  label.htmlFor = 'new-name';
  input.id = 'new-name';
  input.maxLength = 20;
  input.value = frame.self.name;
  form.append(label, input);
  body.append(form);
  const commit = event => {
    event?.preventDefault();
    const name = input.value.trim();
    send({ type: 'rename', name });
    writeSave({ ...readSave(), name });
    dialog.close();
  };
  form.addEventListener('submit', commit);
  uiButton('Salvar nome', commit);
}
function largeMap() {
  openPanel('map', 'Terras humanas', FIELD.name);
  previewMap = document.createElement('canvas');
  previewMap.className = 'full-map';
  previewMap.width = 440;
  previewMap.height = 285;
  previewMap.setAttribute('aria-label', 'Mapa da região. Clique para caminhar até um local.');
  body.append(previewMap);
  p('◆ Capitã Bruna   •  Você   ·  Criaturas');
  previewMap.addEventListener('click', event => {
    const rect = previewMap.getBoundingClientRect();
    const x = FIELD.minX + (event.clientX - rect.left) / rect.width * (FIELD.maxX - FIELD.minX);
    const z = FIELD.minZ + (event.clientY - rect.top) / rect.height * (FIELD.maxZ - FIELD.minZ);
    dialog.close();
    send({ type: 'point', x, z });
    groundPulse(x, z);
  });
  drawMap(previewMap);
  uiButton('Fechar', () => dialog.close());
}
function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2300);
}
function chatToggle() {
  if (!connected) return;
  $('chat-box').hidden = !$('chat-box').hidden;
  if (!$('chat-box').hidden) {
    clearMotion();
    $('chat-input').focus();
  } else $('chat-button').focus();
}

const hotbar = SKILLS.map(skill => {
  const button = document.createElement('button');
  button.className = 'skill';
  button.type = 'button';
  button.title = skill.name + ' · ' + skill.detail;
  button.setAttribute('aria-label', skill.name + ', tecla ' + skill.key);
  const key = document.createElement('kbd'), glyph = document.createElement('span'), name = document.createElement('span');
  key.textContent = skill.key;
  glyph.className = 'skill-icon';
  glyph.textContent = skill.icon;
  name.className = 'skill-name';
  name.textContent = skill.name;
  const charges = document.createElement('span'), shade = document.createElement('span'), count = document.createElement('span');
  charges.className = 'charges';
  shade.className = 'cooldown';
  count.className = 'cooldown-number';
  button.append(key, glyph, name, charges, shade, count);
  $('skills').append(button);
  button.addEventListener('click', () => send({ type: 'skill', id: skill.id }));
  return { skill, charges, shade, count };
});

function markMap(ctx, x, z, r, tone, shape = 'dot') {
  const px = (x - FIELD.minX) / (FIELD.maxX - FIELD.minX) * ctx.canvas.width;
  const py = (z - FIELD.minZ) / (FIELD.maxZ - FIELD.minZ) * ctx.canvas.height;
  ctx.fillStyle = tone;
  ctx.strokeStyle = '#272e22';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (shape === 'diamond') {
    ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py); ctx.closePath();
  } else ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}
function mapBackground(canvas) {
  const { width, height: h } = canvas, cacheKey = width + '/' + h;
  if (mapCache.has(cacheKey)) return mapCache.get(cacheKey);
  const source = document.createElement('canvas');
  source.width = width;
  source.height = h;
  const ctx = source.getContext('2d'), data = ctx.createImageData(width, h);
  const sx = width / (FIELD.maxX - FIELD.minX), sz = h / (FIELD.maxZ - FIELD.minZ);
  for (let py = 0; py < h; py++) for (let px = 0; px < width; px++) {
    const x = px / sx + FIELD.minX, z = py / sz + FIELD.minZ;
    const y = height(x, z), stream = y < -.72, factor = Math.round((Math.sin(z * .63 + x * .46) + Math.cos(x * .67 - z * .8)) * 3 - y * 4.4);
    const [r, g, b] = stream ? [62, 128, 125] : [105 + factor, 122 + factor, 71 + factor * .54];
    const i = (py * width + px) * 4;
    data.data.set([r, g, b, 255], i);
  }
  ctx.putImageData(data, 0, 0);
  const project = ([x, z]) => [(x - FIELD.minX) * sx, (z - FIELD.minZ) * sz];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  PATHS.forEach((path, i) => {
    ctx.beginPath();
    path.forEach((point, index) => index ? ctx.lineTo(...project(point)) : ctx.moveTo(...project(point)));
    ctx.strokeStyle = '#ad9563';
    ctx.lineWidth = sx * (i ? 1.15 : 1.65);
    ctx.stroke();
  });
  ctx.fillStyle = '#927157';
  ctx.fillRect(...project([riverX(BRIDGE.z) - 3.7, BRIDGE.z - 1.2]), 7.4 * sx, 2.4 * sz);
  ctx.fillStyle = '#42473b';
  ctx.fillRect(...project([-4, -22]), 21 * sx, 8.7 * sz);
  ctx.strokeStyle = '#c0ae83';
  ctx.lineWidth = sx * .66;
  ctx.strokeRect(...project([-4, -22]), 21 * sx, 8.7 * sz);
  markMap(ctx, SHRINE.x, SHRINE.z, sx * .68, '#e0be85', 'diamond');
  markMap(ctx, TOWN_GATE.x, TOWN_GATE.z, sx * .67, '#e3c78b', 'diamond');
  if (width > 300) {
    ctx.font = '600 11px system-ui';
    ctx.fillStyle = '#ede2c1';
    ctx.textAlign = 'center';
    ctx.fillText(FIELD.town, ...project([6.5, -17.2]));
    ctx.fillText('Círculo de pedras', ...project([-7, -11]));
    ctx.fillText('Prado aberto', ...project([2.4, 15.9]));
  }
  ctx.fillStyle = '#e4d6ae';
  ctx.font = '700 10px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('N ↑', 7, 13);
  mapCache.set(cacheKey, source);
  return source;
}
function drawMap(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.drawImage(mapBackground(canvas), 0, 0);
  for (const mob of frame.mobs) if (mob.hp > 0) markMap(ctx, mob.x, mob.z, 2.35, '#e3a078');
  for (const other of frame.others) markMap(ctx, other.x, other.z, 3, '#dfb1d6');
  markMap(ctx, GUARD.x, GUARD.z, 4, '#f5d183', 'diamond');
  markMap(ctx, frame.self.x, frame.self.z, 4.2, '#dcf5da');
}

function labelsFor(type) {
  const label = document.createElement('div'), text = document.createElement('span');
  label.className = 'world-label ' + (type === 'self' ? 'mine' : KINDS[type] ? 'mob' : type);
  let marker, fill;
  if (type === 'guard') {
    marker = document.createElement('span');
    marker.className = 'marker';
    label.append(marker);
  }
  label.append(text);
  if (KINDS[type]) {
    const bar = document.createElement('span');
    bar.className = 'small-meter';
    fill = document.createElement('i');
    bar.append(fill);
    label.append(bar);
  }
  worldUI.append(label);
  return { label, text, marker, fill };
}
function findActor(id, kind) {
  if (!models.has(id)) models.set(id, { ...addActor(scene, kind), ...labelsFor(kind), kind, id });
  return models.get(id);
}
function screenPosition(node, x, y, z, padding = 0) {
  projected.set(x, y, z).project(camera);
  const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.12;
  node.hidden = !visible;
  if (visible) {
    node.style.left = ((projected.x + 1) * track.width / 2) + 'px';
    node.style.top = ((1 - projected.y) * track.height / 2 - padding) + 'px';
  }
}
function drawActor(id, type, data, dt, selected) {
  const actor = findActor(id, type);
  poseActor(actor, data, frame.time, dt, selected);
  if (!actor.root.visible) {
    actor.label.hidden = true;
    return;
  }
  const pos = actor.root.position;
  const kind = KINDS[type];
  if (kind) {
    const near = distance(data, frame.self) < 12.8;
    if (!near && !selected) {
      actor.label.hidden = true;
      return;
    }
    actor.text.textContent = kind.name;
    actor.text.style.color = kind.color;
    actor.fill.style.width = (data.hp / kind.hp * 100) + '%';
    actor.fill.parentElement.hidden = data.hp >= kind.hp && !selected;
  } else actor.text.textContent = data.name;
  if (actor.marker) {
    actor.marker.textContent = frame.self.stage === 'start' ? '!' : frame.self.stage === 'return' ? '?' : '';
    actor.marker.hidden = !actor.marker.textContent;
  }
  screenPosition(actor.label, pos.x, pos.y + actor.height + .10, pos.z, 3);
}

const circle = new T.RingGeometry(.91, 1, 50);
circle.rotateX(-Math.PI / 2);
const castColors = { strike: '#ffe0a1', sweep: '#ffcf7b', potion: '#a6e5a2', dash: '#a4decd', enemyAttack: '#e07a48', fall: '#ffe1a2', level: '#ffeb92', walk: '#f9d994' };
function pulse(x, z, kind, radius, time = .5) {
  const mat = new T.MeshBasicMaterial({ color: castColors[kind], transparent: true, opacity: .82, side: T.DoubleSide, depthWrite: false });
  const item = mesh(scene, circle, mat, x, standingHeight(x, z) + .12, z, .1, 1, .1, false);
  if (kind === 'strike') item.scale.y = .15;
  feedback.push({ item, mat, end: performance.now() / 1000 + time, duration: time, radius, kind });
}
const groundPulse = (x, z) => pulse(x, z, 'walk', .62, .46);
function floatNumber(event) {
  const tag = document.createElement('span');
  tag.className = 'float ' + (event.type === 'hurt' ? 'hurt' : '');
  tag.textContent = '−' + event.amount;
  worldUI.append(tag);
  feedback.push({ tag, x: event.x, z: event.z, end: performance.now() / 1000 + .72, duration: .72 });
}
function handle(event) {
  if (event.type === 'notice') return toast(event.message);
  if (event.type === 'dialogue') return mission(event.stage);
  if (event.type === 'chat') {
    const line = document.createElement('div');
    line.textContent = event.name + ' · ' + event.message;
    const log = $('chat-log');
    log.append(line);
    if (log.childElementCount > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    return;
  }
  if (event.type === 'hit' || event.type === 'hurt') return floatNumber(event);
  const actor = models.get(event.entity === frame.self.id ? 'self' : event.entity);
  if (actor && (event.type === 'strike' || event.type === 'sweep')) actor.castUntil = frame.time + .34;
  if (event.type === 'strike') {
    pulse(event.x + Math.sin(event.face) * 1.1, event.z + Math.cos(event.face) * 1.1, 'strike', .83, .25);
  } else if (event.type in castColors) {
    pulse(event.x, event.z, event.type, event.radius || ({ sweep: 3.25, potion: 1.3, dash: 1.14, fall: .83, level: 2.4 })[event.type], event.type === 'level' ? 1.1 : .5);
  }
}
function effects(now) {
  for (let i = feedback.length - 1; i >= 0; i--) {
    const effect = feedback[i], remaining = (effect.end - now) / effect.duration;
    if (remaining <= 0) {
      if (effect.tag) effect.tag.remove();
      else { scene.remove(effect.item); effect.mat.dispose(); }
      feedback.splice(i, 1);
      continue;
    }
    const progress = 1 - remaining;
    if (effect.tag) {
      effect.tag.style.opacity = String(Math.min(1, remaining * 2.3));
      screenPosition(effect.tag, effect.x, standingHeight(effect.x, effect.z) + 1.22 + progress * .73, effect.z);
    } else {
      const size = effect.radius * (.28 + .72 * Math.sqrt(progress));
      effect.item.scale.set(size, 1, size);
      effect.mat.opacity = remaining * .84;
    }
  }
}
function setBar(fill, text, value, max) {
  $(fill).style.width = clamp(value / max * 100, 0, 100) + '%';
  $(text).textContent = max === 100 && fill === 'energy-fill' ? Math.ceil(value) : Math.ceil(value) + ' / ' + max;
}
function updateHUD() {
  const self = frame.self;
  $('player-name').textContent = self.name;
  $('player-level').textContent = self.level;
  setBar('hp-fill', 'hp-text', self.hp, self.maxHp);
  setBar('energy-fill', 'energy-text', self.energy, 100);
  $('xp-fill').style.width = (self.level > 1 ? 100 : Math.min(100, self.xp / 189 * 100)) + '%';
  $('mode').textContent = connected ? (eventSource?.readyState === EventSource.OPEN ? (frame.others.length ? (frame.others.length + 1) + ' NO CAMPO' : 'LOCAL · 1') : 'RECONECTANDO') : 'SOLO';
  $('interact').hidden = distance(self, GUARD) > 2.75 || !!self.down;
  const target = frame.mobs.find(mob => mob.id === self.target && mob.hp > 0);
  $('target-panel').hidden = !target;
  if (target) {
    const kind = KINDS[target.kind];
    $('target-title').textContent = kind.name + ' · Nv. ' + kind.level;
    setBar('target-fill', 'target-hp', target.hp, kind.hp);
  }
  const nextKey = JSON.stringify([self.stage, self.kills]);
  if (nextKey !== questKey) {
    questKey = nextKey;
    const list = $('quest-steps');
    list.replaceChildren();
    if (self.stage === 'hunt') {
      for (const [key, kind] of Object.entries(KINDS)) {
        const row = document.createElement('li');
        row.textContent = (self.kills[key] ? '✓' : '○') + ' ' + kind.name + ' · ' + (self.kills[key] || 0) + '/1';
        row.classList.toggle('done', !!self.kills[key]);
        list.append(row);
      }
    } else {
      const row = document.createElement('li');
      row.textContent = { start: 'Fale com a Capitã Bruna.', return: 'Volte à Capitã Bruna.', done: '✓ Patrulha concluída' }[self.stage];
      row.classList.toggle('done', self.stage === 'done');
      list.append(row);
    }
    $('guide').hidden = !['start', 'return'].includes(self.stage);
  }
  for (const { skill, shade, count, charges } of hotbar) {
    const left = Math.max(0, (self.cooldowns[skill.id] || 0) - frame.time);
    shade.style.height = left / skill.cooldown * 100 + '%';
    count.textContent = left > 0 ? (left < 1 ? left.toFixed(1) : Math.ceil(left)) : '';
    if (skill.id === 'potion') charges.textContent = self.potions;
  }
  $('location-name').textContent = self.z < -9 && self.x > -2 ? 'Portão da Cidadela' : distance(self, SHRINE) < 6.0 ? 'Círculo de pedras' : self.x < -9.5 ? 'Margem do riacho' : distance(self, GUARD) < 6.5 ? 'Estrada da Cidadela' : 'Prado aberto';
  drawMap($('minimap'));
  if (dialogType === 'map' && dialog.open && previewMap) drawMap(previewMap);
}

function resize() {
  track.width = canvas.clientWidth;
  track.height = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(track.width, track.height, false);
}
function pointCamera(dt) {
  const ratio = track.width / Math.max(1, track.height);
  const vertical = (ratio < 1 ? 16.5 : 15.5) / track.zoom;
  camera.left = -vertical * ratio;
  camera.right = vertical * ratio;
  camera.top = vertical;
  camera.bottom = -vertical;
  const person = frame.self;
  const follow = ratio < .96 ? .9 : .43;
  const x = -1.5 + (person.x - SPAWN.x) * follow + (track.zoom - 1) * (person.x + 1.5) * .52 + (ratio < .96 ? 5 : 0);
  const z = -2.25 + (person.z - SPAWN.z) * follow + (track.zoom - 1) * (person.z + 2.25) * .52;
  focus.lerp(new T.Vector3(x, .5, z), 1 - Math.exp(-4.1 * dt));
  const reach = Math.cos(track.tilt) * 52;
  camera.position.set(focus.x + Math.sin(track.angle) * reach, focus.y + Math.sin(track.tilt) * 52, focus.z + Math.cos(track.angle) * reach);
  camera.lookAt(focus);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
function direction() {
  let x = 0, z = 0;
  for (const code of keyboard) {
    const [horizontal, vertical] = motionKey.get(code);
    x += horizontal;
    z += vertical;
  }
  const c = Math.cos(track.angle), s = Math.sin(track.angle);
  return { x: x * c + z * s, z: z * c - x * s };
}
function applyMotion() {
  const next = direction();
  if (Math.abs(next.x - currentVector.x) < .001 && Math.abs(next.z - currentVector.z) < .001) return;
  currentVector = next;
  send({ type: 'move', ...next });
}
function clearMotion() {
  keyboard.clear();
  applyMotion();
}

function registerInputs() {
  window.addEventListener('resize', resize);
  window.addEventListener('blur', clearMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearMotion(); });
  window.addEventListener('keydown', event => {
    if (dialog.open || event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
    if (motionKey.has(event.code)) {
      event.preventDefault();
      keyboard.add(event.code);
      applyMotion();
      return;
    }
    const key = event.key.toLowerCase();
    const skill = SKILLS.find(skill => skill.key === key);
    if (skill) {
      event.preventDefault();
      send({ type: 'skill', id: skill.id });
      return;
    }
    if (event.repeat) return;
    if (key === 'e') send({ type: 'interact' });
    else if (key === 'tab' && (event.target === document.body || event.target === canvas)) {
      event.preventDefault();
      send({ type: 'cycle' });
    } else if (key === 'b') bestiary();
    else if (key === 'i') inventory();
    else if (key === 'm') largeMap();
    else if (key === '?' || key === 'h') help();
    else if (key === 'enter' && event.target === document.body) chatToggle();
    else if (key === 'r') Object.assign(track, { angle: .5, tilt: .63, zoom: 1 });
  });
  window.addEventListener('keyup', event => {
    if (keyboard.delete(event.code)) {
      event.preventDefault();
      applyMotion();
    }
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    track.zoom = clamp(track.zoom * Math.exp(-event.deltaY * .0011), .78, 1.85);
  }, { passive: false });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 2) return;
    track.drag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!track.drag) return;
    track.angle -= (event.clientX - track.drag.x) * .006;
    track.tilt = clamp(track.tilt + (event.clientY - track.drag.y) * .005, .38, 1.13);
    track.drag = { x: event.clientX, y: event.clientY };
    applyMotion();
  });
  canvas.addEventListener('pointercancel', () => { track.drag = null; });
  canvas.addEventListener('pointerup', event => {
    if (track.drag) { track.drag = null; return; }
    if (event.button !== 0 || dialog.open) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    ray.setFromCamera(pointer, camera);
    let hit, best = 37;
    for (const actor of models.values()) {
      if (!actor.root.visible || (actor.kind !== 'guard' && !KINDS[actor.kind])) continue;
      const pos = actor.root.position;
      projected.set(pos.x, pos.y + actor.height * .46, pos.z).project(camera);
      const dx = (projected.x - pointer.x) * track.width * .5, dy = (projected.y - pointer.y) * track.height * .5;
      const d = Math.hypot(dx, dy * .65);
      const label = actor.label.getBoundingClientRect();
      const labelHit = !actor.label.hidden && event.clientX >= label.left && event.clientX <= label.right && event.clientY >= label.top && event.clientY <= label.bottom;
      if ((d < best && d < 23) || labelHit) { hit = actor; best = labelHit ? 0 : d; }
    }
    if (hit?.kind === 'guard') return send({ type: 'interact', approach: true });
    if (hit) return send({ type: 'target', id: hit.id, approach: true });
    const ground = ray.intersectObject(scenery.surface)[0]?.point;
    if (ground) {
      send({ type: 'point', x: ground.x, z: ground.z });
      groundPulse(ground.x, ground.z);
    }
  });
  $('close-dialog').addEventListener('click', () => dialog.close());
  $('profile').addEventListener('click', profile);
  $('help-button').addEventListener('click', help);
  $('map-button').addEventListener('click', largeMap);
  $('bestiary-button').addEventListener('click', bestiary);
  $('bag-button').addEventListener('click', inventory);
  $('interact').addEventListener('click', () => send({ type: 'interact' }));
  $('guide').addEventListener('click', () => send({ type: 'interact', approach: true }));
  $('chat-button').addEventListener('click', chatToggle);
  $('chat-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('chat-input');
    if (input.value.trim()) send({ type: 'chat', message: input.value });
    input.value = '';
    input.focus();
  });
  $('chat-input').addEventListener('keydown', event => { if (event.key === 'Escape') chatToggle(); });
}
function step(stamp) {
  const seconds = stamp / 1000;
  const dt = lastFrame ? Math.min(.06, seconds - lastFrame) : .015;
  lastFrame = seconds;
  if (!connected) {
    tick(world, dt);
    frame = snapshot(world, player.id, seen);
  }
  if (frame) {
    pointCamera(dt);
    scenery.update(seconds);
    for (const event of frame.events) if (event.id > seen) handle(event);
    seen = Math.max(seen, frame.sequence);
    drawActor('self', 'self', frame.self, dt, true);
    drawActor('guard', 'guard', { ...GUARD, face: .12, hp: 1 }, dt, false);
    for (const mob of frame.mobs) drawActor(mob.id, mob.kind, mob, dt, frame.self.target === mob.id);
    for (const other of frame.others) drawActor(other.id, 'other', other, dt, false);
    for (const actor of models.values()) {
      if (actor.kind === 'other' && !frame.others.some(other => other.id === actor.id)) {
        actor.root.visible = actor.ring.visible = false;
        actor.label.hidden = true;
      }
    }
    if (seconds - lastHUD > .095) {
      updateHUD();
      lastHUD = seconds;
    }
    if (!connected && seconds - lastSave > 1.1) {
      writeSave(frame.self);
      lastSave = seconds;
    }
    effects(seconds);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(step);
}

try {
  startSolo();
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (context) {
    renderer = new T.WebGLRenderer({ canvas, context });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = T.SRGBColorSpace;
  } else {
    renderer = new SoftwareRenderer(canvas);
  }
  scenery = buildScenery(scene, !context);
  resize();
  registerInputs();
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    $('failure-detail').textContent = 'A sessão gráfica foi interrompida. Recarregue para voltar ao campo.';
    $('failure').hidden = false;
  });
  requestAnimationFrame(step);
  connect();
} catch (error) {
  console.error(error);
  $('failure').hidden = false;
}
$('retry').addEventListener('click', () => location.reload());
