uniform vec3 light;
uniform float reach;

varying vec2 vOffset;

void main() {
  float edge = length(vOffset);
  float rho = max(edge * reach, 1.0);
  float glow = 0.6 * exp(1.5 * (1.0 - rho * rho)) + 0.6 / (rho * rho);
  gl_FragColor = vec4(light * glow * (1.0 - smoothstep(0.6, 1.0, edge)), 1.0);
}
