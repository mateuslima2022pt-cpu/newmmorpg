export const FIELD = { name: 'Prado da Vigília', town: 'Cidadela da Bigorna', minX: -25, maxX: 26, minZ: -23, maxZ: 21 };
export const GUARD = { x: 5.3, z: -3.5, name: 'Capitã Bruna' };
export const SPAWN = { x: 4.9, z: 1.65 };
export const KINDS = {
  moss: { name: 'Brotinho de Musgo', level: 1, hp: 37, damage: 4, speed: 1.25, sight: 0, reach: 1.5, windup: 0.55, xp: 16, color: '#bfdf75', habitat: 'Margem do riacho', note: 'Passivo. Contra-ataca quando ferido.' },
  fox: { name: 'Raposa de Cinza', level: 2, hp: 61, damage: 8, speed: 3.45, sight: 4.5, reach: 1.65, windup: 0.43, xp: 25, color: '#f3ae78', habitat: 'Prado aberto', note: 'Veloz. Persegue quem entra no seu território.' },
  golem: { name: 'Sentinela de Ferro', level: 3, hp: 99, damage: 20, speed: 1.7, sight: 4.2, reach: 2.45, windup: 1.05, xp: 39, color: '#eec179', habitat: 'Círculo de pedras', note: 'Carrega um golpe pesado. Saia do círculo vermelho.' },
};
export const SKILLS = [
  { id: 'strike', name: 'Corte', key: '1', icon: '⚔', detail: 'Ataque de espada', cooldown: 0.62, energy: 0 },
  { id: 'sweep', name: 'Arco de aço', key: '2', icon: '✦', detail: 'Golpe circular · 24 de vigor', cooldown: 4.2, energy: 24 },
  { id: 'potion', name: 'Poção', key: '3', icon: '✚', detail: 'Recupera 50 de vida', cooldown: 4, energy: 0 },
  { id: 'dash', name: 'Esquiva', key: '4', icon: '➤', detail: 'Avanço rápido · 16 de vigor', cooldown: 2.6, energy: 16 },
];
export const MOB_POINTS = [
  ['moss', -11.7, 4.8], ['moss', -11.8, -4.8], ['moss', -8.6, 11.2],
  ['fox', 1.7, 9.4], ['fox', -5.9, 7.6], ['fox', 10.1, 8.4],
  ['golem', -5.0, -6.1], ['golem', -9.5, -10.4],
];
export const SHRINE = { x: -6.2, z: -7.9 };
export const BRIDGE = { z: 4.6, width: 2.9 };
export const TOWN_GATE = { x: 6.5, z: -13.1 };
export const PATHS = [
  [[-18.7, 4.6], [-12.5, 4.6], [-7.5, 4.5], [-2.5, 2.8], [1.0, 0.2], [4.2, -3.0], [6.5, -7.1], [6.5, -13.1]],
  [[-7.5, 4.5], [-6.0, 0.9], [-6.2, -3.8], [-6.2, -7.2]],
  [[-2.5, 2.8], [-0.6, 5.7], [1.0, 9.0], [3.5, 14.0], [7.8, 19.6]],
];
export const BLOCKERS = [
  [10.4, -3.5, 2.0], [10.65, -1.2, 0.58], [11.8, -1.45, 0.72],
  [-6.2, -7.9, 0.65], [-9.8, -9.7, 0.49], [-2.6, -8.5, 0.5],
  [15.7, -0.9, 1.7], [-12.6, -2.5, 0.85], [-11.2, 7.5, 0.65],
  [-20.8, 8.3, 0.85], [13, 13.8, 1.35], [-3.4, 15.1, 1.1],
];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const mix = (a, b, t) => a + (b - a) * t;
export const riverX = z => -15.0 + 1.45 * Math.sin(z * 0.17) + 0.55 * Math.sin(z * 0.41 + 1);
export const riverWidth = z => 2.6 + 0.45 * Math.cos(z * 0.25);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (lo, hi, v) => {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
export function height(x, z) {
  const river = Math.abs(x - riverX(z));
  const meadow = 0.08 + Math.sin(x * .24 + z * .19) * .22 + Math.sin(z * .46 - x * .18) * .13;
  const slopes = 5.8 * smooth(16, 35, Math.abs(x + 2)) + 5.6 * smooth(9, 30, -z) + 3.5 * smooth(17, 36, z);
  const ground = meadow + slopes * (0.76 + Math.sin(x * .31 - z * .140) * .24);
  const channel = mix(-1.38, ground, smooth(riverWidth(z) * .60, riverWidth(z) * .87 + 1.3, river));
  return mix(channel, .78, (1 - smooth(7, 12, Math.abs(x - 6.5))) * (1 - smooth(4, 13, Math.abs(z + 17))));
}
export function standingHeight(x, z) {
  const atBridge = Math.abs(z - BRIDGE.z) < BRIDGE.width / 2;
  const offset = Math.abs(x - riverX(BRIDGE.z));
  return atBridge && offset < 3.48 ? Math.max(height(x, z), 0.42 + 0.3 * Math.max(0, 1 - offset / 3.48)) : height(x, z);
}
export function walkable(x, z, radius = .28) {
  if (x < FIELD.minX + radius || x > FIELD.maxX - radius || z < FIELD.minZ + radius || z > FIELD.maxZ - radius) return false;
  if (Math.abs(x - riverX(z)) < riverWidth(z) + radius && Math.abs(z - BRIDGE.z) > BRIDGE.width / 2 - radius) return false;
  if (z < -12.5 && x > -4 && x < 17.6) return x > 4.96 + radius && x < 8.04 - radius && z > -13.65;
  return !BLOCKERS.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br + radius);
}

function clearLine(from, to, radius) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / .40));
  for (let i = 1; i <= steps; i++) {
    if (!walkable(mix(from.x, to.x, i / steps), mix(from.z, to.z, i / steps), radius)) return false;
  }
  return true;
}

const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const cellKey = (x, z) => (z - FIELD.minZ) * 64 + x - FIELD.minX;

export function findRoute(from, to) {
  const radius = .29;
  if (!walkable(to.x, to.z, radius)) return [];
  if (clearLine(from, to, radius)) return [to];
  const seed = [];
  for (let x = Math.floor(from.x) - 1; x <= Math.ceil(from.x) + 1; x++) {
    for (let z = Math.floor(from.z) - 1; z <= Math.ceil(from.z) + 1; z++) {
      if (walkable(x, z, radius) && clearLine(from, { x, z }, radius)) {
        const cost = distance(from, { x, z });
        seed.push({ x, z, cost, rank: cost + distance({ x, z }, to), link: null });
      }
    }
  }
  const costs = new Map(seed.map(node => [cellKey(node.x, node.z), node.cost]));
  while (seed.length) {
    let best = 0;
    for (let i = 1; i < seed.length; i++) if (seed[i].rank < seed[best].rank) best = i;
    const [node] = seed.splice(best, 1);
    if (node.cost > costs.get(cellKey(node.x, node.z))) continue;
    if (distance(node, to) < 2 && clearLine(node, to, radius)) {
      const raw = [to];
      for (let point = node; point; point = point.link) raw.push({ x: point.x, z: point.z });
      raw.reverse();
      const route = [];
      for (let i = 0, cursor = from; i < raw.length;) {
        let next = raw.length - 1;
        while (next > i && !clearLine(cursor, raw[next], radius)) next--;
        cursor = raw[next];
        route.push(cursor);
        i = next + 1;
      }
      return route;
    }
    for (const [dx, dz] of neighbors) {
      const x = node.x + dx, z = node.z + dz, key = cellKey(x, z);
      const cost = node.cost + Math.hypot(dx, dz);
      if (cost >= (costs.get(key) ?? Infinity) || !walkable(x, z, radius) || !clearLine(node, { x, z }, radius)) continue;
      costs.set(key, cost);
      seed.push({ x, z, cost, rank: cost + distance({ x, z }, to), link: node });
    }
  }
  return [];
}
