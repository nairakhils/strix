precision highp sampler2DArray;

uniform sampler2DArray before;
uniform sampler2DArray after;
uniform float weight;
uniform float extents[LEVELS];
uniform float pixels;
uniform vec2 range;
uniform float softening;
uniform vec3 centre;
uniform vec2 axis;
uniform float perWorld;
uniform vec4 bodies;
uniform float temperature;
uniform float gamma;
uniform float gain;

varying vec3 vRay;

const float OVERLAP = 0.1;
const float EDGE = 0.8;
const float LN10 = 2.302585093;
const float SATURATION = 0.6;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec2 onMap(vec3 p) {
  vec2 plane = vec2(p.x, -p.z);
  return vec2(dot(plane, axis), dot(plane, vec2(-axis.y, axis.x)));
}

float stored(vec2 xy, int k) {
  vec2 uv = ((xy / extents[k] + 1.0) * 0.5 * (pixels - 1.0) + 0.5) / pixels;
  vec3 at = vec3(uv, float(k));
  return mix(texture(before, at).r, texture(after, at).r, weight);
}

float logDensity(vec2 xy) {
  float reach = max(abs(xy.x), abs(xy.y));
  for (int k = 0; k < LEVELS; k += 1) {
    float edge = extents[k];
    if (reach >= edge) continue;
    float value = stored(xy, k);
    float handover = smoothstep((1.0 - OVERLAP) * edge, edge, reach);
    if (k + 1 < LEVELS) return handover > 0.0 ? mix(value, stored(xy, k + 1), handover) : value;
    return value + log(max(1.0 - smoothstep(EDGE * edge, edge, length(xy)), 1e-13)) / LN10;
  }
  return range.x;
}

float depth(vec2 xy) {
  vec2 one = xy - vec2(bodies.x, 0.0);
  vec2 two = xy - vec2(bodies.z, 0.0);
  float soft = softening * softening;
  return bodies.y * inversesqrt(max(dot(one, one) + soft, 1e-12)) + bodies.w * inversesqrt(max(dot(two, two) + soft, 1e-12));
}

void main() {
  vec3 ray = normalize(vRay);
  vec3 origin = (cameraPosition - centre) * perWorld;
  if (origin.y * ray.y >= 0.0) discard;
  vec2 xy = onMap(origin - ray * origin.y / ray.y);
  float column = logDensity(xy) - log(abs(ray.y)) / LN10;
  float x = clamp((column - range.x) / (range.y - range.x), 0.0, 1.0);
  if (x <= 0.0) discard;
  vec3 hot = glow(temperature * depth(xy));
  hot /= max(max(hot.r, max(hot.g, hot.b)), 1e-9);
  gl_FragColor = vec4(mix(vec3(dot(hot, LUMA)), hot, SATURATION) * pow(x, gamma) * gain, 1.0);
}
