import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

export const BLOOM_STRENGTH = 0.45;
export const BLOOM_RADIUS = 0;
export const BLOOM_THRESHOLD = 1.5;
export const BLOOM_KNEE = 1.5;
export const BLOOM_KERNEL_SIGMAS = 3;
export const BLOOM_WHITEN = 0.55;
export const MAX_PIXEL_RATIO = 2;
export const GAS_PIXELS = 1920 * 1080;

const punchyLook = `color = agxDefaultContrastApprox( color );
	float lookLuma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = pow( max( color, 0.0 ), vec3( 1.35 ) );
	color = lookLuma + 1.4 * ( color - lookLuma );`;

THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'color = agxDefaultContrastApprox( color );',
  punchyLook,
);

function gaussianKernel(radius) {
  const sigma = radius / BLOOM_KERNEL_SIGMAS;
  return Array.from({ length: radius }, (_, i) => Math.exp((-0.5 * i * i) / (sigma * sigma)));
}

function makeBloom(width, height) {
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  bloom.highPassUniforms.smoothWidth.value = BLOOM_KNEE;
  const filter = bloom.materialHighPassFilter;
  filter.fragmentShader = filter.fragmentShader.replace(
    'gl_FragColor = mix( outputColor, texel, alpha );',
    `gl_FragColor = mix( outputColor, vec4( mix( texel.rgb, vec3( v ), ${BLOOM_WHITEN.toFixed(2)} ), texel.a ), alpha );`,
  );
  filter.needsUpdate = true;
  for (const material of bloom.separableBlurMaterials) {
    material.uniforms.gaussianCoefficients.value = gaussianKernel(material.defines.KERNEL_RADIUS);
  }
  return bloom;
}

const blendVertex = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const blendFragment = `uniform sampler2D gas;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec2 d = 0.5 * texel;
  gl_FragColor = 0.25 * (texture2D(gas, vUv + vec2(-d.x, -d.y)) + texture2D(gas, vUv + vec2(d.x, -d.y))
    + texture2D(gas, vUv + vec2(-d.x, d.y)) + texture2D(gas, vUv + vec2(d.x, d.y)));
}`;

function gasPass(camera) {
  const scene = new THREE.Scene();
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { gas: { value: target.texture }, texel: { value: new THREE.Vector2(1, 1) } },
    vertexShader: blendVertex,
    fragmentShader: blendFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const pass = new Pass();
  const clear = new THREE.Color();
  pass.needsSwap = false;
  pass.render = (renderer, writeBuffer, readBuffer) => {
    if (!scene.children.some((child) => child.visible)) return;
    const shrink = Math.min(1, Math.sqrt(GAS_PIXELS / (readBuffer.width * readBuffer.height)));
    const gasWidth = Math.max(1, Math.round(readBuffer.width * shrink));
    const gasHeight = Math.max(1, Math.round(readBuffer.height * shrink));
    if (target.width !== gasWidth || target.height !== gasHeight) {
      target.setSize(gasWidth, gasHeight);
      quad.material.uniforms.texel.value.set(1 / gasWidth, 1 / gasHeight);
    }
    renderer.getClearColor(clear);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setClearColor(clear, alpha);
    renderer.setRenderTarget(readBuffer);
    const { autoClear } = renderer;
    renderer.autoClear = false;
    quad.render(renderer);
    renderer.autoClear = autoClear;
  };
  return { scene, pass };
}

export function makeStage(container, { render, width, height }) {
  let canvasWidth = width;
  let canvasHeight = height;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(render ? 1 : Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1;
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(18, width / height, 0.01, 100);
  camera.up.set(0, 1, 0);
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(width, height),
  });
  const composer = new EffectComposer(renderer, target);
  Object.assign(composer.renderTarget2, { samples: 0, depthBuffer: false, depthTexture: null });
  composer.addPass(new RenderPass(scene, camera));
  const gas = gasPass(camera);
  composer.addPass(gas.pass);
  composer.addPass(makeBloom(width, height));
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);

  const controls = render ? null : new OrbitControls(camera, renderer.domElement);
  if (controls) controls.enableDamping = false;
  let following = true;
  let framing = null;
  controls?.addEventListener('start', () => {
    following = false;
  });

  const point = new THREE.Vector3();
  const aim = new THREE.Vector3();

  function frame(view) {
    framing = view;
    camera.fov = THREE.MathUtils.radToDeg(view.fov);
    aim.fromArray(view.target);
    let stretch = 1;
    if (following) {
      camera.position.fromArray(view.position);
      camera.lookAt(aim);
      controls?.target.copy(aim);
    } else {
      stretch = camera.position.distanceTo(controls.target) / point.fromArray(view.position).distanceTo(aim);
    }
    camera.near = view.near * stretch;
    camera.far = view.far * stretch;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function follow() {
    following = true;
    if (framing) frame(framing);
  }

  function onMove(callback) {
    controls?.addEventListener('change', callback);
  }

  function resize(nextWidth, nextHeight) {
    if (render) return;
    canvasWidth = nextWidth;
    canvasHeight = nextHeight;
    renderer.setSize(nextWidth, nextHeight);
    composer.setSize(nextWidth, nextHeight);
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
  }

  function size() {
    return { width: canvasWidth, height: canvasHeight };
  }

  function project([x, y, z]) {
    point.set(x, y, z).project(camera);
    return { x: ((point.x + 1) / 2) * canvasWidth, y: ((1 - point.y) / 2) * canvasHeight };
  }

  function pixelsPerUnitAt([x, y, z]) {
    const distance = point.set(x, y, z).distanceTo(camera.position);
    return canvasHeight / 2 / (distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }

  function pixelsPerUnitAtDepth([x, y, z]) {
    const depth = -point.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z;
    return canvasHeight / 2 / (depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }

  function draw() {
    composer.readBuffer = composer.renderTarget1;
    composer.writeBuffer = composer.renderTarget2;
    composer.render();
  }

  function warm() {
    const hidden = [];
    [scene, gas.scene].forEach((root) => root.traverse((object) => {
      if (object.visible) return;
      hidden.push(object);
      object.visible = true;
    }));
    const idle = composer.passes.filter((pass) => !pass.enabled);
    idle.forEach((pass) => {
      pass.enabled = true;
    });
    draw();
    hidden.forEach((object) => {
      object.visible = false;
    });
    idle.forEach((pass) => {
      pass.enabled = false;
    });
  }

  return {
    scene,
    camera,
    renderer,
    size,
    frame,
    render: draw,
    warm,
    project,
    pixelsPerUnitAt,
    pixelsPerUnitAtDepth,
    follow,
    onMove,
    resize,
    gas: gas.scene,
  };
}
