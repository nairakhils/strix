varying vec3 vRay;

void main() {
  vec4 far = inverse(projectionMatrix * viewMatrix) * vec4(position.xy, 1.0, 1.0);
  vRay = far.xyz / far.w - cameraPosition;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
