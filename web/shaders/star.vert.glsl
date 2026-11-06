attribute vec3 surface;
attribute float darkening;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vSurface;
varying float vDarkening;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalMatrix * normal;
  vView = -viewPosition.xyz;
  vSurface = surface;
  vDarkening = darkening;
  gl_Position = projectionMatrix * viewPosition;
}
