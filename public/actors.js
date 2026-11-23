import * as T from './vendor/three.module.js';
import { box, cylinder, mesh, orb, rod, stone } from './scenery.js';
import { standingHeight, KINDS } from './world.js';

const TWO_PI = Math.PI * 2;
const iron = '#828f89', ironDark = '#586361', gold = '#c4a46b', leather = '#584734', boot = '#343a37';
const modelBody = (group, x, y, z) => {
  const part = new T.Group();
  part.position.set(x, y, z);
  group.add(part);
  return part;
};
const effectMaterial = (hex, opacity = .9) => new T.MeshBasicMaterial({ color: hex, transparent: true, opacity, side: T.DoubleSide, depthWrite: false });
const standRing = new T.RingGeometry(.89, 1, 56);
standRing.rotateX(-Math.PI / 2);
const disk = new T.CircleGeometry(1, 56);
disk.rotateX(-Math.PI / 2);

export function human(guard = false, other = false) {
  const root = new T.Group(), body = modelBody(root, 0, 0, 0);
  const armor = guard ? '#807964' : '#7b918d', textile = guard ? '#a4523e' : other ? '#825773' : '#346c6b';
  const hips = modelBody(body, 0, .85, 0);
  cylinder(hips, '#514939', 0, .02, 0, .28, .24, .17, 7);
  box(hips, '#d0aa68', 0, .06, .246, .19, .11, .09);
  cylinder(body, armor, 0, 1.18, 0, .37, .24, .57, 7).scale.z = .71;
  box(body, iron, 0, 1.24, .205, .39, .24, .13);
  const breast = orb(body, guard ? '#c19861' : '#b4bfaa', 0, 1.41, .19, .29, .19, .12);
  breast.rotation.z = .13;
  box(body, textile, 0, .80, .206, .22, .43, .075);
  box(body, gold, 0, .68, .253, .14, .033, .019);
  const head = orb(body, '#c79470', 0, 1.65, .024, .223, .263, .20);
  const hair = orb(body, guard ? '#583d33' : '#313932', 0, 1.78, 0, .230, .171, .216);
  hair.rotation.x = -.08;
  if (guard) {
    const helmet = orb(body, '#aea37f', 0, 1.79, 0, .238, .18, .225);
    helmet.rotation.x = -.11;
    box(body, gold, 0, 1.73, .21, .30, .047, .03);
    const plume = orb(body, '#b45b3d', 0, 1.98, -.075, .082, .145, .21);
    plume.rotation.x = -.28;
  } else {
    box(body, '#36413a', 0, 1.68, .198, .304, .057, .046);
    box(body, '#a9a485', 0, 1.704, .231, .261, .032, .023);
  }
  for (const x of [-.092, .092]) box(body, '#2c342e', x, 1.642, .198, .035, .026, .030, false);
  const cape = modelBody(body, 0, 1.43, -.28);
  const cloth = new T.BufferGeometry();
  cloth.setAttribute('position', new T.Float32BufferAttribute([-.31, 0, 0, .31, 0, 0, -.39, -.94, -.17, .38, -.89, -.18, -.39, -.94, -.17, .31, 0, 0], 3));
  cloth.computeVertexNormals();
  mesh(cape, cloth, new T.MeshStandardMaterial({ color: textile, side: T.DoubleSide, roughness: .88 }), 0, 0, 0);
  rod(cape, gold, [-.29, -.06, -.006], [-.36, -.86, -.159], .019, .014, 4);
  rod(cape, gold, [.29, -.06, -.006], [.35, -.82, -.163], .019, .014, 4);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = modelBody(body, side * .157, .84, 0), arm = modelBody(body, side * .405, 1.38, 0);
    legs.push(leg);
    arms.push(arm);
    rod(leg, ironDark, [0, 0, 0], [0, -.39, .018], .119, .092);
    rod(leg, leather, [0, -.31, .02], [0, -.68, .005], .101, .087);
    box(leg, boot, 0, -.731, .057, .194, .184, .31);
    box(leg, iron, 0, -.35, .085, .158, .16, .072);
    orb(arm, armor, 0, .012, 0, .196, .179, .172);
    rod(arm, textile, [0, -.09, 0], [side * .035, -.37, .061], .101, .081);
    rod(arm, ironDark, [side * .03, -.26, .03], [side * .045, -.49, .096], .100, .075);
    orb(arm, leather, side * .05, -.52, .10, .083, .087, .069);
  }
  const sword = modelBody(arms[1], .049, -.52, .12);
  sword.rotation.x = -1.71;
  sword.rotation.z = -.34;
  cylinder(sword, leather, 0, -.002, 0, .052, .053, .31);
  box(sword, gold, 0, .138, 0, .336, .069, .085);
  orb(sword, gold, 0, -.164, 0, .064, .064, .048);
  const blade = new T.Shape();
  blade.moveTo(-.078, .178); blade.lineTo(.078, .178); blade.lineTo(.061, .714); blade.lineTo(0, .910); blade.lineTo(-.061, .714); blade.closePath();
  mesh(sword, new T.ExtrudeGeometry(blade, { bevelEnabled: true, bevelSize: .018, bevelThickness: .017, bevelSegments: 1, steps: 1, depth: .027 }), '#c5d0c3', 0, 0, -.014);
  box(sword, '#e4e3bd', 0, .436, .023, .029, .48, .015, false);
  return {
    root, height: 2.19,
    pose(t, moving, casting, down) {
      const pace = moving ? Math.sin(t * 12) : 0;
      body.position.y = moving ? Math.abs(pace) * .062 : Math.sin(t * 2.7) * .026;
      legs[0].rotation.x = pace * .59;
      legs[1].rotation.x = -pace * .59;
      arms[0].rotation.x = -pace * .37;
      arms[1].rotation.x = pace * .36 - .11;
      arms[1].rotation.z = .08;
      arms[0].rotation.z = -.08;
      cape.rotation.x = .13 + Math.sin(t * 4.8) * .13 + (moving ? .47 : 0);
      body.rotation.z = 0;
      body.rotation.x = moving ? .05 : 0;
      if (casting > 0) {
        const swing = Math.sin(casting * Math.PI);
        arms[1].rotation.x = -1.53 * swing;
        arms[1].rotation.z = 1.2 * swing;
        body.rotation.z = .12 * swing;
      }
      if (down) {
        body.rotation.z = -1.34;
        body.position.y = .57;
      }
      head.rotation.y = guard ? Math.sin(t * .6) * .10 : 0;
    },
  };
}

function eyes(parent, x, y, z, tone, scale = 1) {
  for (const side of [-1, 1]) {
    orb(parent, '#302f27', x + side * scale * .19, y, z, .081 * scale, .076 * scale, .045 * scale);
    orb(parent, tone, x + side * scale * .19, y + .01 * scale, z + .037 * scale, .036 * scale, .047 * scale, .017 * scale, false);
  }
}
function moss() {
  const root = new T.Group(), core = modelBody(root, 0, 0, 0);
  orb(core, '#677c36', 0, .45, 0, .68, .54, .56);
  orb(core, '#839343', 0, .56, -.17, .62, .46, .50);
  orb(core, '#9fae56', -.24, .61, .24, .31, .31, .27);
  orb(core, '#899a46', .32, .48, .24, .26, .24, .26);
  for (const side of [-1, 1]) {
    const ear = orb(core, '#adba60', side * .29, .86, -.01, .15, .26, .15);
    ear.rotation.z = -side * .53;
    orb(core, '#4d6335', side * .33, .13, .20, .21, .17, .22);
  }
  cylinder(core, '#547333', .10, 1.03, -.15, .028, .045, .29, 5);
  const leaf = orb(core, '#c2bb56', .23, 1.12, -.15, .25, .062, .135);
  leaf.rotation.z = .28;
  eyes(core, 0, .47, .49, '#f7df75');
  return {
    root, height: 1.31,
    pose(t, moving, wind) {
      const pulse = Math.sin(t * (moving ? 10 : 4));
      core.scale.set(1 + pulse * .06, 1 - pulse * .11, 1 + pulse * .047);
      core.position.y = moving ? Math.max(0, pulse) * .13 : 0;
      core.rotation.x = wind ? .17 : 0;
    },
  };
}
function fox() {
  const root = new T.Group(), torso = modelBody(root, 0, 0, 0);
  const sienna = '#a65d3c', orange = '#c47d4a', beige = '#e4b47a';
  orb(torso, orange, 0, .66, -.13, .34, .37, .69);
  orb(torso, beige, 0, .55, .25, .29, .31, .28);
  const neck = modelBody(torso, 0, .82, .44);
  orb(neck, sienna, 0, .18, 0, .28, .28, .30);
  orb(neck, beige, 0, .066, .20, .242, .153, .28);
  orb(neck, '#44372c', 0, .104, .442, .100, .076, .083);
  for (const side of [-1, 1]) {
    const ear = cylinder(neck, sienna, side * .19, .419, -.067, .008, .145, .36, 3);
    ear.rotation.z = -side * .25;
    const marking = orb(neck, '#e6a572', side * .19, .390, .012, .071, .125, .026);
    marking.rotation.z = -side * .25;
    orb(neck, '#49372c', side * .179, .214, .224, .056, .055, .044);
  }
  const tail = modelBody(torso, 0, .65, -.65);
  const curve = orb(tail, sienna, 0, .15, -.39, .245, .205, .55);
  curve.rotation.x = .31;
  const tip = orb(tail, beige, 0, .25, -.71, .156, .151, .31);
  tip.rotation.x = .39;
  const legs = [];
  for (const x of [-.204, .204]) for (const z of [-.48, .25]) {
    const joint = modelBody(torso, x, .63, z);
    legs.push(joint);
    rod(joint, sienna, [0, 0, 0], [0, -.36, -.058], .117, .076);
    rod(joint, '#5b4535', [0, -.30, -.054], [0, -.575, .031], .077, .047);
    orb(joint, '#4c3c31', 0, -.57, .068, .054, .05, .098);
  }
  return {
    root, height: 1.60,
    pose(t, moving, wind) {
      legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(t * 13 + (i === 0 || i === 3 ? 0 : Math.PI)) * .52 : 0; });
      torso.position.y = moving ? Math.abs(Math.sin(t * 13)) * .09 : .011 * Math.sin(t * 3);
      tail.rotation.y = Math.sin(t * 4) * .28;
      neck.rotation.x = wind ? .27 : .06 * Math.sin(t * 2);
    },
  };
}
function golem() {
  const root = new T.Group(), body = modelBody(root, 0, 0, 0);
  const rust = '#a67954', clay = '#805e48', basalt = '#6d6a5d', ember = '#e6ac63';
  stone(body, clay, 0, .81, 0, .47, .36, .40);
  stone(body, basalt, 0, 1.29, 0, .67, .62, .45).rotation.set(.13, .06, -.08);
  stone(body, rust, 0, 1.26, .365, .41, .39, .16);
  const heart = mesh(body, new T.OctahedronGeometry(.25), new T.MeshStandardMaterial({ color: '#ffc277', emissive: '#d68642', emissiveIntensity: .68 }), 0, 1.25, .495, .75, 1.03, .57);
  const head = stone(body, clay, 0, 1.93, .08, .39, .30, .35);
  head.rotation.y = .19;
  box(body, '#4f4c42', 0, 1.91, .380, .52, .13, .067);
  eyes(body, 0, 1.91, .418, ember, .99);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = modelBody(body, side * .66, 1.51, 0), foot = modelBody(body, side * .30, .73, .035);
    arms.push(arm); legs.push(foot);
    const shoulder = stone(arm, rust, side * .105, -.07, -.03, .38, .37, .40);
    shoulder.rotation.z = side * .20;
    stone(arm, basalt, side * .22, -.40, .075, .25, .33, .25);
    const fist = stone(arm, clay, side * .20, -.72, .15, .29, .26, .29);
    fist.rotation.x = .24;
    stone(arm, rust, side * .22, -.77, .24, .22, .18, .18);
    stone(foot, basalt, 0, -.28, 0, .23, .36, .24);
    stone(foot, '#56584d', 0, -.57, .12, .275, .16, .34);
  }
  return {
    root, height: 2.45,
    pose(t, moving, wind) {
      body.position.y = moving ? Math.abs(Math.sin(t * 7)) * .10 : Math.sin(t * 2.5) * .037;
      heart.rotation.z = Math.sin(t * 3) * .24;
      for (let i = 0; i < 2; i++) {
        const step = moving ? Math.sin(t * 7 + i * Math.PI) * .28 : 0;
        legs[i].rotation.x = step;
        arms[i].rotation.x = wind ? -1.85 : -step * .80;
      }
    },
  };
}

export function addActor(scene, type) {
  const model = type === 'moss' ? moss() : type === 'fox' ? fox() : type === 'golem' ? golem() : human(type === 'guard', type === 'other');
  model.root.traverse(item => { item.userData.entity = true; });
  const ring = mesh(scene, standRing, effectMaterial(type === 'self' ? '#a4e0c5' : '#eabf77', .78), 0, 0, 0, .72, 1, .72, false);
  ring.visible = false;
  const glow = mesh(scene, disk, effectMaterial('#e56543', .15), 0, 0, 0, 1, 1, 1, false);
  const rim = mesh(scene, standRing, effectMaterial('#ffab70', .73), 0, 0, 0, 1, 1, 1, false);
  glow.visible = rim.visible = false;
  scene.add(model.root);
  return { ...model, ring, glow, rim, initialized: false, castUntil: 0 };
}

export function poseActor(actor, data, t, dt, selected = false) {
  const visible = data.hp > 0 || !!data.down;
  actor.root.visible = visible;
  actor.ring.visible = visible && selected && !data.down;
  actor.glow.visible = actor.rim.visible = visible && data.wind > t && data.kind === 'golem';
  if (!visible) {
    actor.initialized = false;
    return;
  }
  const pos = actor.root.position;
  const alpha = !actor.initialized || Math.hypot(data.x - pos.x, data.z - pos.z) > 5 ? 1 : 1 - Math.exp(-22 * dt);
  const y = standingHeight(data.x, data.z);
  pos.x += (data.x - pos.x) * alpha;
  pos.y += (y - pos.y) * alpha;
  pos.z += (data.z - pos.z) * alpha;
  const angle = ((data.face - actor.root.rotation.y + Math.PI + TWO_PI) % TWO_PI) - Math.PI;
  actor.root.rotation.y += alpha * angle;
  actor.initialized = true;
  actor.ring.position.set(pos.x, pos.y + .045, pos.z);
  if (actor.glow.visible) {
    const r = KINDS[data.kind].reach;
    const charge = 1 - Math.min(1, (data.wind - t) / KINDS[data.kind].windup);
    actor.rim.position.set(pos.x, pos.y + .073, pos.z);
    actor.rim.scale.set(r, 1, r);
    actor.glow.position.set(pos.x, pos.y + .066, pos.z);
    actor.glow.scale.set(r * (.4 + charge * .6), 1, r * (.4 + charge * .6));
  }
  actor.pose(t + (data.phase || 0), data.moving, data.wind > t || (actor.castUntil > t ? (actor.castUntil - t) / .36 : 0), data.down);
}
