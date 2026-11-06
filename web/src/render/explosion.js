import * as THREE from 'three';
import { CORE_BREAK, OUTER_SLOPE } from '../physics/ejecta.js';
import { glowing, hidden, sharedUniforms } from './particles.js';

export const CLOUD_GAIN = 0.25;
export const FLASH_GAIN = 4;

function makeCloud(stage, shaders, shared) {
  const material = new THREE.ShaderMaterial({
    vertexShader: shaders.cloudVertex,
    fragmentShader: `${shaders.emissionChunk}\n${shaders.cloudFragment}`,
    uniforms: {
      emission: shared.emission,
      emissionRange: shared.emissionRange,
      centre: { value: new THREE.Vector3() },
      radius: { value: 1 },
      temperature: { value: 0 },
      scale: { value: 0 },
      core: { value: CORE_BREAK },
      slope: { value: OUTER_SLOPE },
      shadowAxis: { value: new THREE.Vector3(1, 0, 0) },
      shadowStart: { value: 1 },
      shadowCos: { value: 2 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cloud = hidden(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  cloud.renderOrder = 5;
  stage.scene.add(cloud);
  return cloud;
}

export function makeExplosion(stage, shaders, emission) {
  const shared = sharedUniforms(emission);
  const cloud = makeCloud(stage, shaders, shared);
  const flash = hidden(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glowing(shaders, shaders.billboardVertex, shaders.flashFragment, {
    ...shared,
    extent: { value: 1 },
    temperature: { value: 0 },
    presence: { value: 0 },
    scale: { value: 0 },
  })));
  flash.renderOrder = 6;
  stage.scene.add(flash);

  function showCloud(state, explosion) {
    const { uniforms } = cloud.material;
    uniforms.centre.value.fromArray(explosion.site);
    uniforms.radius.value = explosion.radius;
    uniforms.temperature.value = explosion.temperature;
    uniforms.scale.value = CLOUD_GAIN * state.emissionScale * explosion.power * explosion.fade;
    const { shadow } = explosion;
    if (shadow) uniforms.shadowAxis.value.fromArray(shadow.axis);
    uniforms.shadowStart.value = shadow ? shadow.start : 1;
    uniforms.shadowCos.value = shadow ? shadow.cos : 2;
  }

  function showFlash(state, explosion) {
    const { uniforms } = flash.material;
    flash.position.fromArray(explosion.site);
    uniforms.extent.value = explosion.flashSize;
    uniforms.temperature.value = explosion.flashTemperature;
    uniforms.presence.value = explosion.flash * explosion.power;
    uniforms.scale.value = FLASH_GAIN * state.emissionScale;
  }

  function update(state) {
    const { explosion } = state;
    cloud.visible = Boolean(explosion) && explosion.fade > 0;
    flash.visible = Boolean(explosion) && explosion.flash > 1e-3;
    if (cloud.visible) showCloud(state, explosion);
    if (flash.visible) showFlash(state, explosion);
  }

  return { update };
}
