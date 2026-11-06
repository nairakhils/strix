import * as THREE from 'three';

export const MIN_COMPACT_PIXELS = 4;
export const MIN_HOLE_PIXELS = 10;
export const SHADOW_RATIO = Math.sqrt(27) / 2;
export const GLOW_REACH = 5;
export const LENS_REACH = 9;

const luminousKinds = new Set(['star', 'NS', 'WD']);
const point = new THREE.Vector3();

function billboard(plane, vertexShader, fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(plane, material);
  mesh.frustumCulled = false;
  return mesh;
}

function makeBody(stage, shaders, sphere, plane) {
  const core = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial());
  const glow = billboard(plane, shaders.billboardVertex, shaders.glowFragment, {
    extent: { value: 1 },
    reach: { value: GLOW_REACH },
    light: { value: new THREE.Vector3() },
  });
  core.visible = glow.visible = false;
  stage.scene.add(core, glow);
  return { core, glow };
}

function makeLensMaterial(shaders) {
  return new THREE.ShaderMaterial({
    vertexShader: shaders.lensVertex,
    fragmentShader: shaders.lensFragment,
    uniforms: {
      frame: { value: null },
      frameDepth: { value: null },
      viewport: { value: new THREE.Vector2(1, 1) },
      lensCenter: { value: [new THREE.Vector2(), new THREE.Vector2()] },
      lensShadow: { value: [0, 0] },
      lensEinstein: { value: [0, 0] },
      lensDepth: { value: [1, 1] },
      lensReach: { value: [-1, -1] },
    },
    depthTest: false,
    depthWrite: false,
  });
}

export function makeCompact(stage, shaders) {
  const sphere = new THREE.SphereGeometry(1, 48, 24);
  const plane = new THREE.PlaneGeometry(2, 2);
  const bodies = [makeBody(stage, shaders, sphere, plane), makeBody(stage, shaders, sphere, plane)];
  const material = makeLensMaterial(shaders);
  const pass = stage.addLens(material);

  const distanceTo = (position) => point.fromArray(position).distanceTo(stage.camera.position);

  function showEmitter({ core, glow }, star) {
    const perUnit = stage.pixelsPerUnitAt(star.position);
    const truePixels = star.radius * perUnit;
    const pixels = Math.max(truePixels, MIN_COMPACT_PIXELS);
    const size = pixels / perUnit;
    core.position.fromArray(star.position);
    core.scale.setScalar(size);
    core.material.color.fromArray(star.colour).multiplyScalar(star.radiance);
    glow.position.copy(core.position);
    glow.material.uniforms.extent.value = GLOW_REACH * size;
    glow.material.uniforms.light.value.fromArray(star.colour).multiplyScalar(star.radiance);
    const { x, y } = stage.project(star.position);
    return { visible: true, x, y, pixels, notToScale: truePixels < MIN_COMPACT_PIXELS };
  }

  function showHole(star, other, lenses) {
    const perUnit = stage.pixelsPerUnitAt(star.position);
    const shadow = SHADOW_RATIO * star.radius * perUnit;
    const near = distanceTo(star.position);
    const far = other.visible && luminousKinds.has(other.kind) ? distanceTo(other.position) : 0;
    const { x, y } = stage.project(star.position);
    lenses.push({
      x,
      y,
      shadow,
      einstein: perUnit * Math.sqrt(2 * star.radius * near),
      companion: far > near ? perUnit * Math.sqrt((2 * star.radius * near * (far - near)) / far) : 0,
      depth: point.fromArray(star.position).project(stage.camera).z * 0.5 + 0.5,
    });
    const marked = shadow < MIN_HOLE_PIXELS;
    return { visible: true, x, y, pixels: Math.max(shadow, MIN_HOLE_PIXELS), marked, notToScale: false };
  }

  function show(body, star, other, lenses) {
    const kind = star.visible ? star.kind : null;
    const emitter = kind === 'NS' || kind === 'WD' || kind === 'point';
    body.core.visible = body.glow.visible = emitter;
    if (emitter) return showEmitter(body, star);
    if (kind === 'BH') return showHole(star, other, lenses);
    return null;
  }

  function place(lenses) {
    const { height } = stage.size();
    const ratio = stage.renderer.getPixelRatio();
    const { uniforms } = material;
    for (let i = 0; i < 2; i++) {
      const lens = lenses[i];
      uniforms.lensReach.value[i] = lens ? ratio * Math.max(LENS_REACH * lens.companion, lens.shadow + 2) : -1;
      if (!lens) continue;
      uniforms.lensCenter.value[i].set(lens.x * ratio, (height - lens.y) * ratio);
      uniforms.lensShadow.value[i] = lens.shadow * ratio;
      uniforms.lensEinstein.value[i] = lens.companion * ratio;
      uniforms.lensDepth.value[i] = lens.depth;
    }
    pass.enabled = lenses.length > 0;
  }

  function update(state) {
    const lenses = [];
    const marks = state.stars.map((star, k) => show(bodies[k], star, state.stars[1 - k], lenses));
    place(lenses);
    return { marks, lenses };
  }

  return { update };
}
