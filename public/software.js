import * as T from './vendor/three.module.js';

const geometryCache = new WeakMap();
const light = new T.Vector3(-.47, .79, -.39).normalize();
const viewProjection = new T.Matrix4();
const combined = new T.Matrix4();
const instance = new T.Matrix4();
const world = new T.Matrix4();
const inverse = new T.Matrix4();
const localLight = new T.Vector3();
const defaultPaint = new T.Color('#508c87');

function triangles(geometry) {
  if (geometryCache.has(geometry)) return geometryCache.get(geometry);
  const xyz = geometry.attributes.position.array, indices = geometry.index?.array;
  const faceCount = Math.floor((indices?.length ?? xyz.length / 3) / 3);
  const normals = new Float32Array(faceCount * 3);
  for (let i = 0; i < faceCount * 3; i += 3) {
    const a = (indices?.[i] ?? i) * 3, b = (indices?.[i + 1] ?? i + 1) * 3, c = (indices?.[i + 2] ?? i + 2) * 3;
    const ux = xyz[b] - xyz[a], uy = xyz[b + 1] - xyz[a + 1], uz = xyz[b + 2] - xyz[a + 2];
    const vx = xyz[c] - xyz[a], vy = xyz[c + 1] - xyz[a + 1], vz = xyz[c + 2] - xyz[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const magnitude = Math.hypot(nx, ny, nz) || 1;
    normals.set([nx / magnitude, ny / magnitude, nz / magnitude], i);
  }
  const value = { xyz, indices, normals, projected: new Float32Array(xyz.length), vertexColor: geometry.attributes.color?.array };
  geometryCache.set(geometry, value);
  return value;
}
function channel(value) {
  const converted = Math.pow(Math.min(1, Math.max(0, value)), .43);
  return Math.round(converted * 255);
}

export class SoftwareRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    if (!this.context) throw new Error('Canvas 2D unavailable.');
    this.width = 1;
    this.height = 1;
    this.lastDraw = -Infinity;
    this.faces = [];
    this.pool = [];
    this.instancePaint = new T.Color();
  }
  setPixelRatio() {}
  setSize(width, height) {
    const ratio = Math.min(1, 1180 / width, 780 / height);
    this.width = this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.height = this.canvas.height = Math.max(1, Math.round(height * ratio));
    this.lastDraw = -Infinity;
  }
  add(mesh, transform, tint) {
    const source = mesh.material;
    if (!source?.visible || !mesh.geometry.attributes.position || source.opacity <= .025) return;
    const { xyz, indices, normals, projected, vertexColor } = triangles(mesh.geometry);
    combined.multiplyMatrices(viewProjection, transform);
    inverse.copy(transform).invert();
    localLight.copy(light).transformDirection(inverse);
    const [lx, ly, lz] = [localLight.x, localLight.y, localLight.z];
    const m = combined.elements, width = this.width / 2, height = this.height / 2;
    for (let i = 0; i < xyz.length; i += 3) {
      const x = xyz[i], y = xyz[i + 1], z = xyz[i + 2];
      projected[i] = (m[0] * x + m[4] * y + m[8] * z + m[12] + 1) * width;
      projected[i + 1] = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13])) * height;
      projected[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    const paint = source.color || source.userData.flatColor || defaultPaint;
    const opacity = source.transparent ? source.opacity : 1;
    const depthBias = mesh.userData.softwareDepthBias ?? 0;
    const maxX = this.width + 2, maxY = this.height + 2;
    for (let i = 0; i < normals.length; i += 3) {
      const a = (indices?.[i] ?? i) * 3, b = (indices?.[i + 1] ?? i + 1) * 3, c = (indices?.[i + 2] ?? i + 2) * 3;
      const ax = projected[a], ay = projected[a + 1], bx = projected[b], by = projected[b + 1], cx = projected[c], cy = projected[c + 1];
      if (Math.min(ax, bx, cx) > maxX || Math.max(ax, bx, cx) < -2 || Math.min(ay, by, cy) > maxY || Math.max(ay, by, cy) < -2) continue;
      const signedArea = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(signedArea) < .09 || (signedArea > 0 && source.side === T.FrontSide)) continue;
      const depth = (projected[a + 2] + projected[b + 2] + projected[c + 2]) / 3;
      if (depth < -1 || depth > 1) continue;
      const lighting = normals[i] * lx + normals[i + 1] * ly + normals[i + 2] * lz;
      const strength = source.isMeshBasicMaterial ? 1 : .68 + Math.max(0, source.side === T.DoubleSide ? Math.abs(lighting) : lighting) * .41 + (source.emissiveIntensity || 0) * .09;
      const face = this.pool.pop() || [0, 0, 0, 0, 0, 0, 0, '', 1, false];
      face[0] = depth + depthBias;
      face[1] = ax; face[2] = ay; face[3] = bx; face[4] = by; face[5] = cx; face[6] = cy;
      const r = channel((vertexColor?.[a] ?? paint.r) * (tint?.r ?? 1) * strength);
      const g = channel((vertexColor?.[a + 1] ?? paint.g) * (tint?.g ?? 1) * strength * .97);
      const bShade = channel((vertexColor?.[a + 2] ?? paint.b) * (tint?.b ?? 1) * strength * .88);
      face[7] = 'rgb(' + r + ',' + g + ',' + bShade + ')';
      face[8] = opacity;
      face[9] = opacity === 1 && Math.abs(signedArea) > 7;
      this.faces.push(face);
    }
  }
  render(scene, camera) {
    const start = performance.now();
    if (start - this.lastDraw < 42) return;
    this.lastDraw = start;
    scene.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    scene.traverseVisible(object => {
      if (!object.isMesh) return;
      if (!object.isInstancedMesh) return this.add(object, object.matrixWorld);
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, instance);
        if (instance.elements[0] === 0 && instance.elements[5] === 0 && instance.elements[10] === 0) continue;
        world.multiplyMatrices(object.matrixWorld, instance);
        if (object.instanceColor) object.getColorAt(i, this.instancePaint);
        this.add(object, world, object.instanceColor ? this.instancePaint : null);
      }
    });
    const ctx = this.context;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#a9b9a9';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.lineJoin = 'round';
    ctx.lineWidth = .7;
    this.faces.sort((a, b) => b[0] - a[0]);
    for (const face of this.faces) {
      ctx.globalAlpha = face[8];
      ctx.fillStyle = face[7];
      ctx.beginPath();
      ctx.moveTo(face[1], face[2]);
      ctx.lineTo(face[3], face[4]);
      ctx.lineTo(face[5], face[6]);
      ctx.closePath();
      if (face[9]) {
        ctx.strokeStyle = face[7];
        ctx.stroke();
      }
      ctx.fill();
      this.pool.push(face);
    }
    this.faces.length = 0;
  }
}
