import { clamp, distance, findRoute, GUARD, KINDS, MOB_POINTS, SKILLS, SPAWN, TOWN_GATE, walkable } from './world.js';

export const QUEST = {
  title: 'Patrulha do portão',
  intro: 'As criaturas do prado andam rondando a estrada. Faça uma ronda pelas margens do riacho, pelo campo aberto e pelo círculo de pedras. Volte para me contar o que encontrou.',
  progress: 'O musgo se junta perto da água, as raposas ficam no prado e as sentinelas guardam as pedras antigas.',
  complete: 'A estrada está livre. Com a sua ajuda, o pessoal da Cidadela pode voltar a usar o caminho do riacho.',
  reward: '110 XP · 35 moedas · 1 poção',
};
const freshKills = () => ({ moss: 0, fox: 0, golem: 0 });
const finished = player => Object.values(player.kills).every(Boolean);
const toward = (a, b) => {
  const length = distance(a, b) || 1;
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};

export function createWorld() {
  return {
    time: 0, sequence: 0, players: new Map(), events: [],
    mobs: MOB_POINTS.map(([kind, x, z], index) => ({
      id: 'mob-' + index, kind, x, z, home: { x, z }, hp: KINDS[kind].hp,
      phase: index * 1.66, face: index * .9, move: false, wind: 0, attackAt: 0,
      respawn: 0, aggro: null, contributors: new Set(),
    })),
  };
}

export function join(world, id, save = null) {
  const level = save?.level === 2 ? 2 : 1;
  const player = {
    id, name: cleanName(save?.name), ...SPAWN, face: -2.8, moving: false,
    level, hp: level === 2 ? 122 : 100, maxHp: level === 2 ? 122 : 100, energy: 100,
    xp: Math.max(0, Number(save?.xp) || 0), coins: Math.max(0, Number(save?.coins) || 0),
    potions: clamp(Number(save?.potions ?? 3) || 0, 0, 99),
    stage: ['start', 'hunt', 'return', 'done'].includes(save?.stage) ? save.stage : 'start',
    kills: Object.fromEntries(Object.keys(KINDS).map(kind => [kind, Number(Boolean(save?.kills?.[kind]))])),
    input: { x: 0, z: 0 }, dest: [], target: null, auto: null,
    cooldowns: {}, hurt: -8, invuln: 0, dash: null, down: 0,
  };
  world.players.set(id, player);
  return player;
}
function cleanName(value) {
  return (typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '') : '').slice(0, 20) || 'Andarilho';
}
function emit(world, type, data, to = null) {
  world.events.push({ id: ++world.sequence, at: world.time, type, to, ...data });
}
function notice(world, player, message) {
  emit(world, 'notice', { message }, player.id);
}

function move(entity, vector, amount, radius) {
  if (vector.x === 0 && vector.z === 0) return false;
  const x = entity.x + vector.x * amount, z = entity.z + vector.z * amount;
  const before = { x: entity.x, z: entity.z };
  if (walkable(x, z, radius)) {
    entity.x = x;
    entity.z = z;
  } else {
    if (walkable(x, entity.z, radius)) entity.x = x;
    if (walkable(entity.x, z, radius)) entity.z = z;
  }
  if (distance(before, entity) < .001) return false;
  entity.face = Math.atan2(vector.x, vector.z);
  return true;
}

function hitMob(world, player, mob, amount) {
  mob.hp = Math.max(0, mob.hp - amount);
  mob.aggro = player.id;
  mob.contributors.add(player.id);
  emit(world, 'hit', { entity: mob.id, x: mob.x, z: mob.z, amount });
  if (mob.hp > 0) return;
  mob.respawn = world.time + 15;
  mob.wind = 0;
  mob.move = false;
  for (const id of mob.contributors) {
    const participant = world.players.get(id);
    if (!participant) continue;
    participant.xp += KINDS[mob.kind].xp;
    participant.coins += 4;
    if (participant.stage === 'hunt' && !participant.kills[mob.kind]) {
      participant.kills[mob.kind] = 1;
      if (finished(participant)) {
        participant.stage = 'return';
        notice(world, participant, 'Ronda concluída. Volte à Capitã Bruna.');
      } else {
        notice(world, participant, 'Patrulha atualizada · ' + KINDS[mob.kind].name);
      }
    }
  }
  mob.contributors.clear();
  emit(world, 'fall', { entity: mob.id, x: mob.x, z: mob.z, kind: mob.kind });
}

function nearestMob(world, player, range) {
  return world.mobs.filter(mob => mob.hp > 0 && distance(mob, player) <= range)
    .sort((a, b) => distance(a, player) - distance(b, player))[0];
}
function perform(world, player, id, specific) {
  const skill = SKILLS.find(entry => entry.id === id);
  if (!skill || player.cooldowns[id] > world.time || player.down) return false;
  if (player.energy < skill.energy) {
    notice(world, player, 'Vigor insuficiente.');
    return false;
  }
  if (id === 'strike') {
    const target = specific || world.mobs.find(mob => mob.id === player.target && mob.hp > 0);
    const mob = target && distance(player, target) < 2.38 ? target : nearestMob(world, player, 2.38);
    if (!mob) {
      notice(world, player, 'Aproxime-se de uma criatura para atacar.');
      return false;
    }
    player.target = mob.id;
    player.face = Math.atan2(mob.x - player.x, mob.z - player.z);
    emit(world, id, { entity: player.id, x: player.x, z: player.z, face: player.face });
    hitMob(world, player, mob, player.level === 2 ? 23 : 19);
  }
  if (id === 'sweep') {
    emit(world, id, { entity: player.id, x: player.x, z: player.z });
    for (const mob of world.mobs) if (mob.hp > 0 && distance(player, mob) <= 3.45) hitMob(world, player, mob, 29);
  }
  if (id === 'potion') {
    if (!player.potions || player.hp === player.maxHp) {
      notice(world, player, player.potions ? 'Sua vida já está cheia.' : 'Você ficou sem poções.');
      return false;
    }
    player.potions--;
    player.hp = Math.min(player.maxHp, player.hp + 50);
    emit(world, id, { entity: player.id, x: player.x, z: player.z });
  }
  if (id === 'dash') {
    const vector = player.input.x || player.input.z ? player.input : { x: Math.sin(player.face), z: Math.cos(player.face) };
    player.dest = [];
    player.auto = null;
    player.dash = { ...vector, until: world.time + .25 };
    player.invuln = world.time + .31;
    emit(world, id, { entity: player.id, x: player.x, z: player.z });
  }
  player.energy -= skill.energy;
  player.cooldowns[id] = world.time + skill.cooldown;
  return true;
}
function talk(world, player) {
  if (distance(player, GUARD) > 2.75) return false;
  player.dest = [];
  player.auto = null;
  emit(world, 'dialogue', { stage: player.stage }, player.id);
  return true;
}

export function action(world, player, command) {
  if (!command || !player) return;
  if (command.type === 'rename') {
    player.name = cleanName(command.name);
    return;
  }
  if (command.type === 'chat' && typeof command.message === 'string') {
    const message = command.message.trim().slice(0, 140);
    if (message) emit(world, 'chat', { name: player.name, message });
    return;
  }
  if (player.down) return;
  switch (command.type) {
    case 'move': {
      if (!Number.isFinite(command.x) || !Number.isFinite(command.z)) return;
      const x = clamp(command.x, -1, 1), z = clamp(command.z, -1, 1), scale = Math.max(1, Math.hypot(x, z));
      player.input = { x: x / scale, z: z / scale };
      if (x || z) { player.dest = []; player.auto = null; }
      break;
    }
    case 'point':
      if (Number.isFinite(command.x) && Number.isFinite(command.z) && walkable(command.x, command.z)) {
        player.dest = findRoute(player, { x: command.x, z: command.z });
        player.auto = null;
      }
      break;
    case 'target': {
      const mob = world.mobs.find(entry => entry.id === command.id && entry.hp > 0);
      if (mob) {
        player.target = mob.id;
        player.auto = command.approach ? mob.id : null;
        player.dest = [];
      }
      break;
    }
    case 'cycle': {
      const options = world.mobs.filter(mob => mob.hp > 0 && distance(player, mob) < 15)
        .sort((a, b) => distance(a, player) - distance(b, player));
      if (options.length) player.target = options[(options.findIndex(mob => mob.id === player.target) + 1) % options.length].id;
      break;
    }
    case 'skill':
      perform(world, player, command.id);
      break;
    case 'interact':
      if (!talk(world, player)) {
        if (distance(player, TOWN_GATE) < 2.3) notice(world, player, 'A patrulha de hoje acontece fora das muralhas.');
        else if (command.approach) {
          player.dest = findRoute(player, { x: GUARD.x + .4, z: GUARD.z + 1.35 });
          player.auto = 'guard';
        } else notice(world, player, 'Aproxime-se da Capitã Bruna para conversar.');
      }
      break;
    case 'quest':
      if (distance(player, GUARD) > 2.75) return;
      if (player.stage === 'start') {
        player.stage = 'hunt';
        notice(world, player, 'Missão aceita · ' + QUEST.title);
      } else if (player.stage === 'return' && finished(player)) {
        player.stage = 'done';
        player.level = 2;
        player.maxHp = player.hp = 122;
        player.energy = 100;
        player.xp += 110;
        player.coins += 35;
        player.potions++;
        emit(world, 'level', { entity: player.id, x: player.x, z: player.z });
        notice(world, player, 'Missão concluída · Nível 2 alcançado');
      }
      break;
  }
}

function updatePlayer(world, player, dt) {
  const now = world.time;
  player.moving = false;
  if (player.down) {
    if (player.down > now) return;
    Object.assign(player, SPAWN, { hp: player.maxHp, energy: 100, down: 0, invuln: now + 1.7, face: -2.8 });
    notice(world, player, 'Você retornou ao portão.');
    return;
  }
  player.energy = Math.min(100, player.energy + dt * 11);
  if (now - player.hurt > 6) player.hp = Math.min(player.maxHp, player.hp + dt * 3.2);
  if (player.dash?.until > now) {
    player.moving = move(player, player.dash, dt * 17.5);
    return;
  }
  if (player.input.x || player.input.z) {
    player.moving = move(player, player.input, dt * 6.35);
    return;
  }
  const mob = world.mobs.find(entry => entry.id === player.auto && entry.hp > 0);
  if (mob && distance(player, mob) < 2.22) {
    if (perform(world, player, 'strike', mob)) player.auto = null;
    return;
  }
  if (player.auto === 'guard' && talk(world, player)) return;
  const dest = mob || player.dest[0];
  if (!dest) {
    player.auto = null;
    return;
  }
  if (distance(player, dest) < .14) {
    player.dest.shift();
    if (!player.dest.length) player.auto = null;
    return;
  }
  player.moving = move(player, toward(player, dest), Math.min(distance(player, dest), dt * 6.35));
  if (!player.moving) { player.dest = []; player.auto = null; }
}

function updateMob(world, mob, dt) {
  const now = world.time, kind = KINDS[mob.kind];
  mob.move = false;
  if (mob.hp <= 0) {
    if (mob.respawn <= now) Object.assign(mob, mob.home, { hp: kind.hp, aggro: null, wind: 0, attackAt: now + .8 });
    return;
  }
  let target = world.players.get(mob.aggro);
  if (target?.down || !target || distance(mob, target) > 11 || distance(mob, mob.home) > 7.2) {
    mob.aggro = null;
    mob.wind = 0;
    target = null;
  }
  if (!target && distance(mob, mob.home) < 2.7 && kind.sight > 0) {
    target = [...world.players.values()].find(player => !player.down && now >= player.invuln && distance(player, mob) < kind.sight);
    if (target) mob.aggro = target.id;
  }
  if (!target) {
    const idle = { x: mob.home.x + Math.sin(now * .6 + mob.phase) * .9, z: mob.home.z + Math.cos(now * .47 + mob.phase) * .68 };
    if (distance(mob, idle) > .22) mob.move = move(mob, toward(mob, idle), dt * kind.speed * .43, .2);
    return;
  }
  const range = distance(mob, target);
  mob.face = Math.atan2(target.x - mob.x, target.z - mob.z);
  if (mob.wind) {
    if (now < mob.wind) return;
    mob.wind = 0;
    mob.attackAt = now + 1.1;
    emit(world, 'enemyAttack', { x: mob.x, z: mob.z, entity: mob.id, radius: kind.reach });
    const players = mob.kind === 'golem' ? world.players.values() : [target];
    for (const player of players) {
      if (player.down || player.invuln > now || distance(player, mob) > kind.reach) continue;
      player.hurt = now;
      player.hp = Math.max(0, player.hp - kind.damage);
      emit(world, 'hurt', { entity: player.id, x: player.x, z: player.z, amount: kind.damage });
      if (!player.hp) {
        player.down = now + 2;
        player.input = { x: 0, z: 0 };
        player.auto = player.dash = null;
        player.dest = [];
        notice(world, player, 'Você caiu. Retorno ao portão em instantes.');
      }
    }
    return;
  }
  if (range < kind.reach * .89) {
    if (now >= mob.attackAt) mob.wind = now + kind.windup;
    return;
  }
  mob.move = move(mob, toward(mob, target), dt * kind.speed, .2);
}

export function tick(world, dt) {
  world.time += dt;
  for (const player of world.players.values()) updatePlayer(world, player, dt);
  for (const mob of world.mobs) updateMob(world, mob, dt);
  while (world.events[0]?.at < world.time - 5) world.events.shift();
}

export function snapshot(world, id, after = 0) {
  const player = world.players.get(id);
  const visible = ({ id, name, x, z, hp, maxHp, face, level, moving, down }) => ({ id, name, x, z, hp, maxHp, face, level, moving, down });
  return {
    time: world.time, sequence: world.sequence,
    self: { ...visible(player), stage: player.stage, kills: player.kills, target: player.target, energy: player.energy,
      xp: player.xp, coins: player.coins, potions: player.potions, cooldowns: player.cooldowns },
    others: [...world.players.values()].filter(other => other.id !== id).map(visible),
    mobs: world.mobs.map(({ id, kind, x, z, hp, face, move, wind, phase }) => ({ id, kind, x, z, hp, face, moving: move, wind, phase })),
    events: world.events.filter(event => event.id > after && (!event.to || event.to === id)),
  };
}
