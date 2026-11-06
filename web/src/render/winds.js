import * as THREE from 'three';
import { PROFILE_SAMPLES, WIND_REACH, profileTable } from '../physics/wind.js';
import { WIND_CLUMPS } from '../director/director.js';

export const FAINTEST_WIND = 1e-3;
export const WIND_COMPRESSION = 1;

function makeHaze(stage, shaders, plane, profile) {
  const material = new THREE.ShaderMaterial({
    vertexShader: shaders.billboardVertex,
    fragmentShader: shaders.windFragment,
    uniforms: {
      extent: { value: 1 },
      reach: { value: WIND_REACH },
      light: { value: new THREE.Vector3() },
      depth: { value: 0 },
      profile: { value: profile },
      flow: { value: 0 },
      blur: { value: 0 },
      compression: { value: WIND_COMPRESSION },
      outward: { value: WIND_CLUMPS },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(plane, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  stage.scene.add(mesh);
  return mesh;
}

export function makeWinds(stage, shaders) {
  const plane = new THREE.PlaneGeometry(2, 2);
  const profile = Array.from(profileTable(PROFILE_SAMPLES, WIND_REACH));
  const hazes = [makeHaze(stage, shaders, plane, profile), makeHaze(stage, shaders, plane, profile)];

  function show(haze, star) {
    haze.visible = star.visible && star.kind === 'star' && star.wind > FAINTEST_WIND;
    if (!haze.visible) return;
    const { uniforms } = haze.material;
    haze.position.fromArray(star.position);
    uniforms.extent.value = WIND_REACH * star.radius;
    uniforms.light.value.fromArray(star.colour).multiplyScalar(star.radiance);
    uniforms.depth.value = star.wind;
    uniforms.flow.value = star.windClock.flow;
    uniforms.blur.value = star.windClock.blur;
  }

  function update(state) {
    state.stars.forEach((star, k) => show(hazes[k], star));
  }

  return { update };
}
