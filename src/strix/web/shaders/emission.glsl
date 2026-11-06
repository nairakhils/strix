uniform sampler2D emission;
uniform vec2 emissionRange;

vec3 glow(float temperature) {
  float x = (log(max(temperature, 1.0)) - emissionRange.x) / (emissionRange.y - emissionRange.x);
  return texture2D(emission, vec2(clamp(x, 0.0, 1.0), 0.5)).rgb;
}
