uniform float extent;

varying vec2 vOffset;

void main() {
  vOffset = position.xy;
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  gl_Position = projectionMatrix * (centre + vec4(position.xy * extent, 0.0, 0.0));
}
