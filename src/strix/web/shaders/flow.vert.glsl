uniform sampler2D bundleA;
uniform sampler2D bundleB;
uniform float lengthsA[32];
uniform float lengthsB[32];
uniform float mixB;
uniform float clock;
uniform float since;
uniform float after;
uniform float period;
uniform float spacing;
uniform float stop;
uniform float width;
uniform float size;
uniform float shutter;
uniform float temperature;
uniform float scale;

const float TYPICAL_SPEED = 0.4;
const float MIN_WEIGHT = 0.15;
const float MAX_WEIGHT = 3.0;

attribute float track;
attribute float offset;
attribute vec2 jitter;
attribute float shine;


vec4 sampleTrack(sampler2D bundle, int k, float n, float length) {
  int last = int(length) - 1;
  int i = min(int(n), last);
  vec4 a = texelFetch(bundle, ivec2(i, k), 0);
  vec4 b = texelFetch(bundle, ivec2(min(i + 1, last), k), 0);
  return mix(a, b, fract(n));
}

void main() {
  int k = int(track);
  float lengthA = lengthsA[k];
  float lengthB = lengthsB[k];
  float age = mod(clock + offset * period, period);
  float n = age / spacing;
  if (age > since || age < after || n >= mix(lengthA, lengthB, mixB) - 1.0) {
    hide();
    return;
  }
  vec4 state = mix(sampleTrack(bundleA, k, n, lengthA), sampleTrack(bundleB, k, n, lengthB), mixB);
  vec2 heading = state.zw / max(length(state.zw), 1e-6);
  vec2 side = vec2(-heading.y, heading.x);
  vec3 centre = vec3(state.xy + side * jitter.x * width, jitter.y * width * 0.6);
  float reach = length(centre.xy - vec2(1.0, 0.0));
  if (reach < stop) {
    hide();
    return;
  }
  float start = smoothstep(0.0, 6.0, n);
  float thick = clamp(length(state.zw) / TYPICAL_SPEED, MIN_WEIGHT, MAX_WEIGHT);
  vColour = shine * start * thick * scale * glow(temperature);
  streak(centre, vec3(state.zw * shutter, 0.0), size);
}
