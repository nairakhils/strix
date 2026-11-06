import * as THREE from 'three';

const imageRepeats = 16;
const referenceHeight = 1080;

async function loadBackground(renderer, image) {
  const url = URL.createObjectURL(image);
  const texture = await new THREE.TextureLoader().loadAsync(url);
  URL.revokeObjectURL(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function pixelAngleFor(camera, heightPx) {
  return (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / heightPx;
}

function makeUniforms() {
  return {
    inverseProjection: { value: new THREE.Matrix4() },
    cameraWorld: { value: new THREE.Matrix4() },
    viewport: { value: new THREE.Vector2(1, 1) },
  };
}

export async function makeSky(stage, { skyVertex: vertexShader, skyFragment: fragmentShader }, background) {
  const uniforms = makeUniforms();
  const defines = {};

  if (background) {
    const texture = await loadBackground(stage.renderer, background);
    uniforms.image = { value: texture };
    uniforms.imageScale = { value: new THREE.Vector2(imageRepeats / (2 * Math.PI), 1) };
    uniforms.imageHeight = { value: texture.image.height };
    defines.SKY_IMAGE = '';
  }

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  stage.scene.add(mesh);

  function update() {
    const { width, height } = stage.size();
    const ratio = stage.renderer.getPixelRatio();
    const camera = stage.camera;
    uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.cameraWorld.value.copy(camera.matrixWorld);
    uniforms.viewport.value.set(width * ratio, height * ratio);
    if (uniforms.imageScale) {
      uniforms.imageScale.value.y = 1 / (uniforms.imageHeight.value * pixelAngleFor(camera, referenceHeight));
    }
  }

  return { update };
}
