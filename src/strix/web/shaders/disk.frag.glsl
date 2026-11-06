uniform float scale;
uniform float presence;
uniform float inner;
uniform float outer;
uniform float sphere;
uniform float core;
uniform float arms;
uniform float gain;

varying vec2 vPlane;

void main() {
  float r = length(vPlane) * outer;
  if (r <= inner || r >= outer) discard;
  float ratio = inner / r;
  float feed = r < sphere ? r / sphere : 1.0;
  float temperature = core * pow(feed * (1.0 - sqrt(ratio)) * ratio * ratio * ratio, 0.25);
  float x = r / outer;
  float edge = 1.0 - smoothstep(0.7, 1.0, x);
  float spiral = 1.0 + arms * smoothstep(0.45, 0.95, x) * cos(2.0 * atan(vPlane.y, vPlane.x) + 4.0 * log(x));
  gl_FragColor = vec4(glow(temperature) * scale * presence * gain * edge * spiral, 1.0);
}
