import * as THREE from 'three';
import { shapeLevel, sphereGrid, surfaceOnGrid } from '../physics/roche.js';
import { gravityDarkeningExponent, rotationalDarkening, tidalDarkening } from '../physics/darkening.js';
import { LUMINANCE_CONTRAST, SUN_TEFF } from '../physics/light.js';

export const MIN_STAR_PIXELS = 2.5;

const up = new THREE.Vector3(0, 1, 0);
const along = new THREE.Vector3();
const across = new THREE.Vector3();
const basis = new THREE.Matrix4();

export function orient(object, toward) {
  along.set(toward[0], 0, toward[2]).normalize();
  across.crossVectors(up, along);
  basis.makeBasis(along, across, up);
  object.quaternion.setFromRotationMatrix(basis);
}

export function gridGeometry(grid, index) {
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(index);
  const position = new THREE.BufferAttribute(new Float32Array(grid.directions), 3);
  const normal = new THREE.BufferAttribute(new Float32Array(grid.directions), 3);
  geometry.setAttribute('position', position.setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', normal.setUsage(THREE.DynamicDrawUsage));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  return geometry;
}

function makeBody(stage, shaders, grid, index, surface) {
  const geometry = gridGeometry(grid, index);
  geometry.setAttribute('surface', surface);
  const darkening = new THREE.BufferAttribute(new Float32Array(grid.count).fill(1), 1);
  geometry.setAttribute('darkening', darkening.setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    vertexShader: shaders.starVertex,
    fragmentShader: shaders.starFragment,
    uniforms: {
      colour: { value: new THREE.Vector3() },
      radiance: { value: 0 },
      teff: { value: SUN_TEFF },
      compression: { value: LUMINANCE_CONTRAST },
      limb: { value: new THREE.Vector2() },
      cells: { value: 2 },
      amplitude: { value: 0 },
      time: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  stage.scene.add(mesh);
  return { mesh, q: null, fill: null, spin: null, beta: null };
}

export function makeStars(stage, shaders) {
  const grid = sphereGrid(96, 128);
  const index = new THREE.BufferAttribute(grid.index, 1);
  const surface = new THREE.BufferAttribute(new Float32Array(grid.directions), 3);
  const sphere = new Float32Array(grid.directions);
  const areas = new Float64Array(grid.count);
  const bodies = [makeBody(stage, shaders, grid, index, surface), makeBody(stage, shaders, grid, index, surface)];

  function reshape(body, star) {
    const { shape } = star;
    const q = shape ? shape.q : null;
    const fill = shape ? shape.fill : null;
    const spin = shape ? 0 : star.spin;
    const beta = shape || spin > 0 ? gravityDarkeningExponent(star.teff) : null;
    const moved = q !== body.q || fill !== body.fill;
    if (!moved && spin === body.spin && beta === body.beta) return;
    const { position, normal, darkening } = body.mesh.geometry.attributes;
    if (moved) {
      if (shape) {
        const { level } = shapeLevel(q, fill);
        surfaceOnGrid(q, level, grid, position.array, normal.array);
      } else {
        position.array.set(sphere);
        normal.array.set(sphere);
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
    }
    if (shape) tidalDarkening(q, grid, position.array, beta, darkening.array, areas);
    else rotationalDarkening(spin, grid, position.array, beta, darkening.array, areas);
    darkening.needsUpdate = true;
    Object.assign(body, { q, fill, spin, beta });
  }

  function show(body, star, time) {
    const { mesh } = body;
    mesh.visible = star.kind === 'star' && star.visible;
    if (!mesh.visible) return null;
    reshape(body, star);
    const pixels = star.radius * stage.pixelsPerUnitAt(star.position);
    const boost = Math.max(MIN_STAR_PIXELS / pixels, 1);
    const base = star.shape ? star.shape.unit * star.shape.scale : star.radius;
    mesh.position.fromArray(star.position);
    orient(mesh, star.toward);
    mesh.scale.setScalar(base * boost);
    const { uniforms } = mesh.material;
    uniforms.colour.value.fromArray(star.colour);
    uniforms.radiance.value = star.radiance;
    uniforms.teff.value = star.teff;
    uniforms.limb.value.fromArray(star.limb);
    uniforms.cells.value = star.granulation.cells;
    uniforms.amplitude.value = star.granulation.amplitude;
    uniforms.time.value = time;
    const { x, y } = stage.project(star.position);
    return { visible: true, x, y, pixels: pixels * boost, notToScale: boost > 1 || star.label !== null };
  }

  function update(state) {
    const time = state.clock;
    return state.stars.map((star, k) => show(bodies[k], star, time));
  }

  return { update };
}
