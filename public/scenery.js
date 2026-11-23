import * as T from './vendor/three.module.js';
import { BLOCKERS, BRIDGE, FIELD, height, mix, PATHS, riverWidth, riverX, SHRINE, TOWN_GATE } from './world.js';

const geometries = new Map(), materials = new Map();
const boxShape = new T.BoxGeometry(1, 1, 1);
const sphereShape = new T.IcosahedronGeometry(1, 1);
const roughShape = new T.DodecahedronGeometry(1, 0);
export const color = hex => new T.Color(hex);
export function material(hex) {
  if (!materials.has(hex)) materials.set(hex, new T.MeshStandardMaterial({ color: hex, roughness: .87, flatShading: true }));
  return materials.get(hex);
}
export function mesh(parent, geometry, hex, x, y, z, sx = 1, sy = 1, sz = 1, shadow = true) {
  const item = new T.Mesh(geometry, typeof hex === 'string' ? material(hex) : hex);
  item.position.set(x, y, z);
  item.scale.set(sx, sy, sz);
  item.castShadow = shadow;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}
export const box = (p, hex, x, y, z, sx, sy, sz, shadow) => mesh(p, boxShape, hex, x, y, z, sx, sy, sz, shadow);
export const orb = (p, hex, x, y, z, sx, sy, sz, shadow) => mesh(p, sphereShape, hex, x, y, z, sx, sy, sz, shadow);
export const stone = (p, hex, x, y, z, sx, sy, sz, shadow) => mesh(p, roughShape, hex, x, y, z, sx, sy, sz, shadow);
export function cylinder(p, hex, x, y, z, r1, r2, h, sides = 8, shadow = true) {
  const key = [r1, r2, h, sides].join(':');
  if (!geometries.has(key)) geometries.set(key, new T.CylinderGeometry(r1, r2, h, sides));
  return mesh(p, geometries.get(key), hex, x, y, z, 1, 1, 1, shadow);
}
export function rod(p, hex, from, to, radius, tip = radius, sides = 7, shadow = true) {
  const item = cylinder(p, hex, 0, 0, 0, tip, radius, 1, sides, shadow);
  const a = new T.Vector3(...from), b = new T.Vector3(...to), direction = b.clone().sub(a);
  item.position.copy(a.addScaledVector(direction, .5));
  item.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.clone().normalize());
  item.scale.y = direction.length();
  return item;
}
const lightMaterial = (hex, strength = .7) => new T.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: strength });
const grassPalette = ['#7b9148', '#849748', '#768c46', '#91a04e', '#6e873e', '#899844'].map(color);
const bankPalette = ['#887d5b', '#a09268', '#737b52', '#918765'].map(color);
const dirtPalette = ['#ac9060', '#b59b6c', '#b39c69', '#ab9261'].map(color);
const stonePalette = ['#858575', '#9b9680', '#797e70', '#a9a38c'];
const golden = '#d9aa52';

export function randomFrom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function terrain(scene, random, simplified) {
  const geom = new T.PlaneGeometry(100, 96, simplified ? 76 : 150, simplified ? 72 : 142);
  geom.rotateX(-Math.PI / 2);
  const positions = geom.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i) - 7;
    positions.setXYZ(i, x, height(x, z), z);
  }
  const surface = geom.toNonIndexed(), values = surface.attributes.position, colors = [];
  for (let i = 0; i < values.count; i += 3) {
    const x = (values.getX(i) + values.getX(i + 1) + values.getX(i + 2)) / 3;
    const z = (values.getZ(i) + values.getZ(i + 1) + values.getZ(i + 2)) / 3;
    const h = height(x, z);
    const creek = Math.abs(x - riverX(z)) - riverWidth(z) < .22;
    const palette = creek ? bankPalette : grassPalette;
    const paint = palette[0].clone().lerp(palette[Math.floor(random() * palette.length)], .54);
    paint.multiplyScalar(.88 + .125 * Math.sin(x * .27 - z * .15) + .055 * Math.sin(z * .7 + x * .4) - Math.min(.17, h * .019));
    for (let j = 0; j < 3; j++) colors.push(paint.r, paint.g, paint.b);
  }
  surface.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  surface.computeVertexNormals();
  geom.dispose();
  return mesh(scene, surface, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .98 }), 0, 0, 0, 1, 1, 1, false);
}

function pathStrip(scene, points, width, random) {
  const curve = new T.CatmullRomCurve3(points.map(([x, z]) => new T.Vector3(x, 0, z)));
  const positions = [], colors = [];
  let previous;
  const segments = Math.ceil(curve.getLength() * 3);
  for (let i = 0; i <= segments; i++) {
    const point = curve.getPoint(i / segments), tangent = curve.getTangent(i / segments);
    const cross = [-tangent.z, tangent.x];
    const line = [-1, -.68, 0, .68, 1].map((fraction, j) => {
      const wobble = j === 0 || j === 4 ? (random() - .5) * .33 : 0;
      const x = point.x + cross[0] * (width * fraction + wobble), z = point.z + cross[1] * (width * fraction + wobble);
      return [x, height(x, z) + .026, z];
    });
    if (previous) for (let j = 0; j < line.length - 1; j++) {
      positions.push(...previous[j], ...line[j], ...previous[j + 1], ...line[j], ...line[j + 1], ...previous[j + 1]);
      const edge = j === 0 || j === 3, paint = dirtPalette[Math.floor(random() * dirtPalette.length)].clone();
      if (edge) paint.lerp(grassPalette[0], .55);
      for (let k = 0; k < 6; k++) colors.push(paint.r, paint.g, paint.b);
    }
    previous = line;
  }
  const shape = new T.BufferGeometry();
  shape.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  shape.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  shape.computeVertexNormals();
  const strip = mesh(scene, shape, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 1 }), 0, 0, 0, 1, 1, 1, false);
  strip.userData.softwareDepthBias = -.009;
}

function river(scene, random) {
  const positions = [], uv = [], indices = [];
  for (let i = 0; i <= 135; i++) {
    const z = -46 + i * .64, x = riverX(z), radius = riverWidth(z) * .90;
    positions.push(x - radius, -.79, z, x + radius, -.79, z);
    uv.push(0, z, 1, z);
    if (i) {
      const left = i * 2;
      indices.push(left - 2, left, left - 1, left - 1, left, left + 1);
    }
  }
  const geom = new T.BufferGeometry();
  geom.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geom.setIndex(indices);
  const uniforms = { time: { value: 0 }, shallow: { value: color('#62b0a0') }, deep: { value: color('#257783') } };
  const water = new T.ShaderMaterial({
    uniforms, side: T.DoubleSide, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform vec3 deep;uniform vec3 shallow;uniform float time;void main(){float edge=abs(vUv.x-.5)*2.;float rip=sin(vUv.y*3.9+vUv.x*21.-time*3.2)*sin(vUv.y*2.7-vUv.x*19.+time*2.1);float crest=pow(max(0.,rip),12.)*.20;vec3 col=mix(deep,shallow,pow(edge,2.)*.7+.22+crest)+vec3(crest*.3);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  water.userData.flatColor = color('#539b94');
  mesh(scene, geom, water, 0, 0, 0, 1, 1, 1, false);
  const streaks = [], foam = new T.MeshBasicMaterial({ color: '#b7e3ce', transparent: true, opacity: .48, depthWrite: false });
  for (let i = 0; i < 43; i++) {
    const z = -24 + random() * 47, offset = (random() - .5) * 3.3;
    const item = box(scene, foam, riverX(z) + offset, -.762, z, .08 + random() * .21, .007, .18 + random() * .72, false);
    streaks.push({ item, z, offset });
  }
  return t => {
    uniforms.time.value = t;
    for (const streak of streaks) {
      const z = ((streak.z + 24 + t * .64) % 47) - 24;
      streak.item.position.set(riverX(z) + streak.offset, -.762 + .007 * Math.sin(t + streak.z), z);
    }
  };
}

function bridge(scene) {
  const z = BRIDGE.z, center = riverX(z);
  for (let i = -8; i <= 8; i++) {
    const x = center + i * .414, y = .42 + .3 * (1 - Math.abs(i / 8));
    const wood = i % 3 ? '#86613d' : '#9b7148';
    box(scene, wood, x, y - .1, z, .405, .21, 2.94);
    for (const edge of [-1, 1]) {
      box(scene, '#422e22', x, y - .19, z + edge * 1.31, .43, .22, .19);
      if (i % 4 === 0) {
        box(scene, '#674b32', x, y + .34, z + edge * 1.39, .14, .98, .14);
        box(scene, '#a68152', x, y + .85, z + edge * 1.39, .18, .10, .18);
        if (i < 8) rod(scene, '#ad8960', [x, y + .55, z + edge * 1.39], [x + 1.656, .97 + .3 * (1 - Math.abs((i + 4) / 8)), z + edge * 1.39], .042);
      }
    }
  }
}

function wall(scene, x, z, length, base) {
  box(scene, '#9f9a82', x, base + 1.55, z, length, 3.1, 1.0);
  box(scene, '#74756a', x, base + .18, z, length + .1, .36, 1.18);
  box(scene, '#b9af90', x, base + 2.92, z, length + .13, .23, 1.16);
  for (let i = -Math.floor(length / 1.08) / 2; i < length / 2.16 - .25; i++) box(scene, '#aaa287', x + i * 1.08, base + 3.27, z, .62, .52, 1.06);
  for (let row = 0; row < 5; row++) {
    const start = -length / 2 + .7 + row % 2 * .57;
    for (let v = start; v < length / 2 - .33; v += 1.13) {
      box(scene, stonePalette[Math.abs(Math.round(v * 6) + row) % 4], x + v, base + .51 + .48 * row, z + .501, Math.min(1.08, length / 2 - Math.abs(v) + .17), .43, .05, false);
    }
  }
}

const cloths = [];
function banner(parent, x, y, z, width = .86, drop = 1.48) {
  rod(parent, '#554635', [x - width * .64, y, z], [x + width * .64, y, z], .043);
  const geom = new T.PlaneGeometry(width, drop, 7, 9);
  geom.translate(0, -drop * .5, 0);
  const pos = geom.attributes.position;
  const base = Float32Array.from(pos.array);
  const item = mesh(parent, geom, new T.MeshStandardMaterial({ color: '#993f31', side: T.DoubleSide, roughness: 1 }), x, y - .08, z);
  cloths.push({ item, base, phase: z + x, drop });
  const symbol = new T.Shape();
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, r = width * (i % 2 ? .086 : .26);
    if (i) symbol.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else symbol.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  symbol.closePath();
  mesh(parent, new T.ShapeGeometry(symbol), new T.MeshStandardMaterial({ color: '#edbc64', side: T.DoubleSide }), x, y - drop * .51, z + .066, 1, 1, 1, false);
  for (const edge of [-1, 1]) box(parent, '#c18143', x + edge * width * .452, y - drop * .48, z + .027, .026, drop * .91, .015, false);
}

function tower(scene, x, z, base, scale = 1, flags = true) {
  const p = new T.Group();
  p.position.set(x, base, z);
  p.scale.setScalar(scale);
  scene.add(p);
  cylinder(p, '#98947d', 0, 1.95, 0, 1.13, 1.25, 3.9, 8);
  cylinder(p, '#7b7a6c', 0, .18, 0, 1.30, 1.33, .35, 8);
  cylinder(p, '#c4b594', 0, 3.53, 0, 1.27, 1.23, .23, 8);
  cylinder(p, '#b1a588', 0, 4.0, 0, 1.23, 1.21, .32, 8);
  cylinder(p, '#4a5550', 0, 4.25, 0, 1.52, 1.58, .16, 8);
  cylinder(p, '#305653', 0, 4.95, 0, .46, 1.55, 1.39, 8);
  cylinder(p, '#23413e', 0, 5.88, 0, .04, .50, .51, 8);
  cylinder(p, '#b68749', 0, 4.48, 0, 1.41, 1.47, .06, 8);
  orb(p, golden, 0, 6.19, 0, .13, .16, .13);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    rod(p, '#47625a', [Math.sin(a) * 1.51, 4.31, Math.cos(a) * 1.51], [Math.sin(a) * .43, 5.64, Math.cos(a) * .43], .033);
  }
  for (const side of [-1, 1]) {
    box(p, '#383b34', side * .46, 2.89, 1.002, .17, .43, .04);
    box(p, '#b6a687', side * .46, 2.64, 1.026, .25, .10, .11);
  }
  if (flags) banner(p, 0, 2.27, 1.07, .65, 1.25);
  return p;
}

function lantern(parent, x, y, z) {
  rod(parent, '#463b2c', [x, y + .32, z - .24], [x, y + .32, z], .038);
  rod(parent, '#634d34', [x, y + .36, z], [x, y + .17, z], .031);
  cylinder(parent, '#493d2d', x, y + .13, z, .112, .20, .13, 6);
  cylinder(parent, lightMaterial('#ffae4b', .85), x, y - .05, z, .136, .115, .26, 6, false);
  cylinder(parent, '#684a30', x, y - .21, z, .165, .11, .11, 6);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    rod(parent, '#694e36', [x + Math.cos(a) * .121, y - .18, z + Math.sin(a) * .121], [x + Math.cos(a) * .141, y + .075, z + Math.sin(a) * .141], .012);
  }
}

function house(scene, x, z, w, depth, h, tint, roofHex) {
  const p = new T.Group();
  p.position.set(x, .78, z);
  scene.add(p);
  box(p, tint, 0, h * .48, 0, w, h, depth);
  for (const side of [-1, 1]) {
    const roof = box(p, roofHex, side * w * .258, h + w * .2, 0, w * .67, .20, depth + .42);
    roof.rotation.z = -side * .64;
    box(p, '#4f4938', side * (w * .45), h * .5, depth * .508, .11, h, .07);
    box(p, '#685949', side * w * .22, h * .66, depth * .511, .53, .79, .10);
    box(p, '#ba925d', side * w * .22, h * .66, depth * .57, .36, .60, .05);
    box(p, '#665442', side * w * .22, h * .66, depth * .604, .39, .053, .044, false);
  }
  box(p, '#554936', 0, h + w * .39, 0, .14, .14, depth + .46);
  box(p, '#525449', w * .27, h + w * .3, -depth * .16, .43, h * .62, .43);
  box(p, '#88856f', w * .27, h * 1.30 + w * .3, -depth * .16, .54, .12, .54);
}

function town(scene) {
  const { x, z } = TOWN_GATE, y = .78;
  box(scene, '#b2a287', x, y + .04, z + 1.30, 4.9, .16, 3.6);
  const arch = new T.Shape();
  arch.moveTo(-2.05, 0); arch.lineTo(-2.05, 3.63); arch.lineTo(2.05, 3.63);
  arch.lineTo(2.05, 0); arch.lineTo(1.34, 0); arch.lineTo(1.34, 1.43);
  arch.absarc(0, 1.43, 1.34, 0, Math.PI, false);
  arch.lineTo(-1.34, 0); arch.lineTo(-2.05, 0);
  const archGeo = new T.ExtrudeGeometry(arch, { depth: 1.05, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 1, steps: 1, curveSegments: 14 });
  mesh(scene, archGeo, '#a49b80', x, y, z - .5);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * i / 10, r = 1.51;
    const detail = box(scene, i === 5 ? '#d9b475' : '#c3ac83', x + r * Math.cos(a), y + 1.43 + r * Math.sin(a), z + .616, .36, .34, .15);
    detail.rotation.z = a - Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) box(scene, i % 2 ? '#b4a588' : '#bdb291', x + side * 1.52, y + .19 + i * .36, z + .617, .34, .33, .14);
    tower(scene, x + side * 2.30, z, y, 1.04);
    wall(scene, x + side * 6.56, z - .21, 6.9, y);
    lantern(scene, x + side * 1.86, y + 1.8, z + .84);
    tower(scene, x + side * 10, z - .45, y, .81, false);
  }
  box(scene, '#c1ad89', x, y + 3.68, z + .02, 3.76, .21, 1.33);
  for (let i = -2; i <= 2; i++) box(scene, '#aaa084', x + i * .68, y + 3.95, z + .02, .45, .38, 1.12);
  const badge = stone(scene, '#c08b49', x, y + 3.29, z + .7, .32, .29, .12);
  badge.rotation.z = Math.PI / 4;
  for (const [dx, dz, w, h] of [[-7.7, -4.2, 2.7, 3.1], [-3.9, -5.1, 3.2, 3.4], [1.9, -5.8, 3.6, 4.4], [6.0, -5.6, 3.1, 3.2], [7.6, -9.1, 3.6, 4.6], [-5.4, -8.0, 3.4, 4.3]]) {
    house(scene, x + dx, z + dz, w, w * .91, h, '#bdb19a', dx > 0 ? '#355d58' : '#765a4c');
  }
  tower(scene, x + .5, z - 10.3, y, 1.4, false);
}

function shrine(scene) {
  const { x, z } = SHRINE, y = height(x, z);
  cylinder(scene, '#818371', x, y + .09, z, 2.27, 2.38, .19, 12);
  cylinder(scene, '#a2987d', x, y + .22, z, 2.03, 2.1, .12, 12);
  cylinder(scene, '#6f7562', x, y + .288, z, .64, .66, .05, 10);
  cylinder(scene, '#9b7450', x, y + .62, z, .24, .64, .66, 6);
  const crystal = mesh(scene, new T.OctahedronGeometry(.52), lightMaterial('#f6af57', .44), x, y + 1.42, z, .67, 1.18, .67);
  for (let i = 0; i < 8; i++) {
    if (i === 0 || i === 1) continue;
    const a = i * Math.PI / 4, dx = Math.sin(a) * 2.27, dz = Math.cos(a) * 2.27;
    const pillar = stone(scene, stonePalette[i % 4], x + dx, height(x + dx, z + dz) + .48, z + dz, .33, .75 + i % 3 * .14, .43);
    pillar.rotation.y = -a;
    pillar.rotation.z = (i % 3 - 1) * .13;
  }
  return t => { crystal.rotation.y = t * .65; crystal.position.y = y + 1.39 + Math.sin(t * 2.1) * .10; };
}

function camp(scene) {
  const x = 10.4, z = -3.5, y = height(x, z);
  const tent = new T.Shape();
  tent.moveTo(-1.6, 0); tent.lineTo(0, 2.03); tent.lineTo(1.6, 0); tent.closePath();
  mesh(scene, new T.ExtrudeGeometry(tent, { depth: 1.7, bevelEnabled: false }), '#9a6946', x, y, z - .88);
  for (const side of [-1, 1]) {
    const roof = box(scene, side < 0 ? '#aa774e' : '#b78b61', x + side * .79, y + 1.05, z, 2.65, .07, 2.04);
    roof.rotation.z = -side * .90;
    rod(scene, '#66543a', [x, y + 2.09, z + 1.01], [x + side * 1.92, y, z + 1.37], .024);
  }
  const opening = new T.Shape();
  opening.moveTo(-.70, 0); opening.lineTo(0, 1.45); opening.lineTo(.57, 0); opening.closePath();
  mesh(scene, new T.ShapeGeometry(opening), '#46382c', x, y + .034, z + .831, 1, 1, 1, false);
  for (const [bx, bz, s] of [[10.65, -1.2, .62], [11.82, -1.45, .82]]) {
    const by = height(bx, bz);
    box(scene, '#826140', bx, by + s / 2, bz, s, s, s);
    for (const side of [-1, 1]) box(scene, '#ad8855', bx + side * s * .33, by + s * .5, bz + s * .507, .072, s + .02, .06);
    box(scene, '#5f503d', bx, by + s * .68, bz + s * .55, .14, .1, .05);
  }
  rod(scene, '#57452f', [8.7, y, -4.6], [8.7, y + 3.12, -4.6], .073);
  banner(scene, 9.07, y + 2.95, -4.53, .63, 1.31);
  lantern(scene, 8.7, y + 1.64, -4.18);
}

function tree(scene, x, z, size, kind, random) {
  const y = height(x, z), p = new T.Group();
  p.position.set(x, y, z);
  p.scale.setScalar(size);
  p.rotation.y = random() * Math.PI * 2;
  scene.add(p);
  const timber = kind === 'pine' ? '#60513a' : '#69523c';
  cylinder(p, timber, 0, 1.03, 0, .095, .22, 2.18);
  if (kind === 'pine') {
    const colors = ['#2f5947', '#3c674c', '#477453', '#587d54'];
    const radius = .84 + random() * .23;
    for (let i = 0; i < 4; i++) {
      const tier = cylinder(p, colors[i], 0, 1.35 + i * .51, 0, .055, radius - i * .14, 1.39 - i * .11, 7);
      tier.rotation.y = i * 1.4;
    }
    return;
  }
  const palette = kind === 'bloom' ? ['#b45f48', '#d78160', '#e4946d', '#ad614c', '#e8a47c'] : ['#466743', '#53764a', '#64844e', '#779154', '#88a25c'];
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4, r = i === 0 ? .12 : .63 + random() * .27, dx = Math.cos(a) * r, dz = Math.sin(a) * r;
    const cy = 2.1 + (i === 0 ? .64 : random() * .67);
    rod(p, timber, [0, .81 + i * .135, 0], [dx, cy, dz], .12 - i * .012, .045);
    const crown = orb(p, palette[i], dx, cy + .22, dz, .92 + random() * .27, .56 + random() * .27, .91 + random() * .19);
    crown.rotation.set(random() * .36, a, random() * .32);
  }
}
function flora(scene, random, simplified) {
  for (const [x, z, r] of BLOCKERS.slice(6)) {
    const y = height(x, z);
    for (let i = 0; i < 3; i++) {
      const item = stone(scene, stonePalette[(i + 1) % 4], x + (random() - .5) * r, y + r * .20, z + (random() - .5) * r, r * (1 - i * .23), r * (.72 - i * .11), r * (.78 - i * .13));
      item.rotation.set(random() * .41, random() * 6, random() * .48);
    }
  }
  const landmarkTrees = [[-12.4, -12.3, 1.75, 'bloom'], [-21.3, -4.9, 1.9, 'bloom'], [-20.8, 11.7, 1.48, 'bloom'], [-9.2, -15.15, 1.63, 'oak'], [13.5, -6.2, 1.65, 'oak'], [-1.5, -12.9, 1.39, 'bloom'], [15.8, -1, 1.3, 'oak'], [17.2, 9.5, 1.62, 'bloom'], [-20.8, 1.35, 1.23, 'oak'], [-23.1, -1.5, 1.94, 'oak'], [12.7, 15.2, .98, 'oak']];
  landmarkTrees.forEach(data => tree(scene, ...data, random));
  for (let i = 0; i < 97; i++) {
    const x = -32 + random() * 65, z = -38 + random() * 63;
    const border = x < -19.5 || x > 17.3 || z < -13.5;
    const inTown = x > -3.9 && x < 17.4 && z > -26 && z < -11;
    if (!border || inTown || Math.abs(x - riverX(z)) < 4 || (z > 0 && x > 15 && x < 19.5)) continue;
    tree(scene, x, z, .68 + random() * 1.3, random() > .22 ? 'pine' : 'oak', random);
  }
  for (let i = 0; i < 57; i++) {
    const z = -22 + random() * 43, side = random() < .53 ? -1 : 1;
    if (Math.abs(z - BRIDGE.z) < 1.7) continue;
    const x = riverX(z) + side * (riverWidth(z) + random() * 1.1), s = .16 + random() * 1.03;
    const rock = stone(scene, stonePalette[i % 4], x, height(x, z) + .09 * s, z, s, s * .6, s * .81);
    rock.rotation.set(random() * .5, random() * 6.28, random() * .43);
  }
  const transform = new T.Object3D();
  const blades = new T.InstancedMesh(new T.ConeGeometry(1, 1, 3), material('#ffffff'), 2450);
  const flowers = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), material('#ffffff'), 415);
  const grass = ['#6d853f', '#5b7839', '#9da650', '#788e40', '#aaa35d'].map(color);
  const blooms = ['#f2c684', '#e5d8a4', '#c79cbe', '#d97559'].map(color);
  for (let i = 0; i < 2450; i++) {
    const x = -25 + random() * 49, z = -19 + random() * 39, y = height(x, z);
    if (y < -.47 || (x > -4 && x < 18 && z < -12.5)) { blades.setMatrixAt(i, new T.Matrix4().makeScale(0, 0, 0)); continue; }
    const size = .12 + random() * .32;
    transform.position.set(x, y + size * .33, z);
    transform.rotation.set((random() - .5) * .52, random() * 6, (random() - .5) * .48);
    transform.scale.set(size * .27, size, size * .17);
    transform.updateMatrix();
    blades.setMatrixAt(i, transform.matrix);
    blades.setColorAt(i, grass[i % 5]);
  }
  for (let i = 0; i < 415; i++) {
    const x = -22 + random() * 44, z = -18 + random() * 38, y = height(x, z);
    if (y < -.33 || (x > -4 && x < 18 && z < -12.5)) { flowers.setMatrixAt(i, new T.Matrix4().makeScale(0, 0, 0)); continue; }
    const s = .045 + random() * .062;
    transform.position.set(x, y + s * 1.4, z);
    transform.scale.set(s * 1.2, s * .58, s);
    transform.updateMatrix();
    flowers.setMatrixAt(i, transform.matrix);
    flowers.setColorAt(i, blooms[i % 4]);
  }
  if (simplified) { blades.count = 420; flowers.count = 96; }
  blades.receiveShadow = flowers.receiveShadow = true;
  scene.add(blades, flowers);
}

function peaks(scene, random) {
  for (let i = 0; i < 20; i++) {
    const x = -67 + i * 7.4, z = -48 - random() * 17, s = 6.5 + random() * 11;
    const peak = stone(scene, i % 2 ? '#476b69' : '#537971', x, 2.8 + random() * 2, z, s * 1.06, s, s * .83, false);
    peak.rotation.y = random() * 6;
  }
}

function motes(scene, random) {
  const positions = new Float32Array(75 * 3);
  const origins = [];
  for (let i = 0; i < 75; i++) origins.push([-19 + random() * 39, .65 + random() * 3.7, -16 + random() * 35, random() * 6]);
  const geom = new T.BufferGeometry();
  const attribute = new T.BufferAttribute(positions, 3);
  geom.setAttribute('position', attribute);
  const points = new T.Points(geom, new T.PointsMaterial({ color: '#fff1ac', size: .058, transparent: true, opacity: .69, depthWrite: false }));
  points.frustumCulled = false;
  scene.add(points);
  return t => {
    origins.forEach(([x, y, z, phase], i) => attribute.setXYZ(i, x + .8 * Math.sin(t * .38 + phase), y + .28 * Math.cos(t * .56 + phase), z + .67 * Math.cos(t * .34 + phase)));
    attribute.needsUpdate = true;
  };
}

export function buildScenery(scene, simplified = false) {
  const random = randomFrom(421927);
  scene.background = color('#a7bdb0');
  scene.fog = new T.FogExp2('#b5c5a9', .010);
  scene.add(new T.HemisphereLight('#edf4d8', '#55533d', 1.65));
  const sun = new T.DirectionalLight('#ffdfa5', 2.28);
  sun.position.set(-17, 27, -16);
  sun.target.position.set(1, 0, 0);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 27, bottom: -27, near: 1, far: 75 });
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.bias = -.00026;
  sun.shadow.normalBias = .052;
  scene.add(sun, sun.target);
  const surface = terrain(scene, random, simplified);
  PATHS.forEach((path, index) => pathStrip(scene, path, index ? .66 : 1.14, random));
  const updateRiver = river(scene, random), updateShrine = shrine(scene), updateMotes = motes(scene, random);
  bridge(scene);
  peaks(scene, random);
  town(scene);
  camp(scene);
  flora(scene, random, simplified);
  return {
    surface,
    update(t) {
      updateRiver(t); updateShrine(t); updateMotes(t);
      for (const { item, base, phase, drop } of cloths) {
        const pos = item.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = base[i * 3 + 1], x = base[i * 3];
          pos.setZ(i, .036 + Math.sin(t * 2.1 + x * 6 + phase + y * 2.2) * Math.min(.020, -y / drop * .021));
        }
        pos.needsUpdate = true;
      }
    },
  };
}
