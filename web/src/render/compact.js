import * as THREE from 'three';

export const MIN_COMPACT_PIXELS = 4;
export const GLOW_REACH = 5;

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

export function makeCompact(stage, shaders) {
  const sphere = new THREE.SphereGeometry(1, 48, 24);
  const plane = new THREE.PlaneGeometry(2, 2);
  const bodies = [makeBody(stage, shaders, sphere, plane), makeBody(stage, shaders, sphere, plane)];

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

  function show(body, star) {
    const shown = star.visible && star.kind === 'point';
    body.core.visible = body.glow.visible = shown;
    return shown ? showEmitter(body, star) : null;
  }

  function update(state) {
    return { marks: state.stars.map((star, k) => show(bodies[k], star)) };
  }

  return { update };
}
