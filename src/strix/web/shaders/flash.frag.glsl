uniform float temperature;
uniform float scale;
uniform float presence;

varying vec2 vOffset;

const float FALLOFF = 6.0;

void main() {
  float d2 = dot(vOffset, vOffset);
  if (d2 >= 1.0) discard;
  float edge = exp(-FALLOFF);
  float shape = (exp(-FALLOFF * d2) - edge) / (1.0 - edge);
  gl_FragColor = vec4(glow(temperature) * scale * presence * shape, 1.0);
}
