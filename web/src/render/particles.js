import * as THREE from 'three';

export const MIN_RADIUS = 0.6;
export const MAX_RADIUS = 1.6;
export const DESIGN_HEIGHT = 1080;

function emissionTexture({ size, data }) {
  const half = new Uint16Array(data.length);
  data.forEach((value, k) => {
    half[k] = THREE.DataUtils.toHalfFloat(value);
  });
  const texture = new THREE.DataTexture(half, size, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function sharedUniforms(emission) {
  return {
    emission: { value: emissionTexture(emission) },
    emissionRange: { value: new THREE.Vector2(emission.lo, emission.hi) },
    viewport: { value: new THREE.Vector2(1, 1) },
    minRadius: { value: MIN_RADIUS },
    maxRadius: { value: MAX_RADIUS },
  };
}

export function fitViewport(stage, shared, drawing) {
  stage.renderer.getDrawingBufferSize(drawing);
  shared.viewport.value.copy(drawing);
  shared.maxRadius.value = Math.max(MAX_RADIUS * (drawing.y / DESIGN_HEIGHT), MIN_RADIUS);
}

export function quads(count, attributes) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2));
  for (const [name, values, size, dynamic] of attributes) {
    const attribute = new THREE.InstancedBufferAttribute(values, size);
    if (dynamic) attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }
  geometry.instanceCount = count;
  return geometry;
}

export function particles(stage, shaders, vertex, geometry, uniforms) {
  const material = new THREE.ShaderMaterial({
    vertexShader: `${shaders.emissionChunk}\n${shaders.streakChunk}\nvarying vec3 vColour;\n${vertex}`,
    fragmentShader: shaders.particleFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  stage.scene.add(mesh);
  return mesh;
}

export function glowing(shaders, vertex, fragment, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: `${shaders.emissionChunk}\n${fragment}`,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function hidden(mesh) {
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}
