uniform float temperature;
uniform float scale;
uniform float presence;

varying vec2 vOffset;

void main() {
  float d = length(vOffset);
  gl_FragColor = vec4(glow(temperature) * scale * presence * exp(-6.0 * d * d), 1.0);
}
