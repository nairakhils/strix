varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalMatrix * normal;
  vView = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}
