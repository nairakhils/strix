import * as THREE from 'three';

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
  };
}

export function hidden(mesh) {
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}
