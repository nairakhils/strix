uniform vec3 light;
uniform float depth;
uniform float reach;
uniform float profile[48];
uniform float flow;
uniform float blur;
uniform float outward;
uniform float share;

varying vec2 vOffset;

const float PERIOD = 16.0;
const float AROUND = 28.0;
const float CONTRAST = 0.6;
const float CLUMPS_FROM = 1.05;
const float CLUMPS_TO = 1.6;
const float SMEAR = 1.5;

float scattered(float p) {
  float x = clamp(log(p) / log(reach), 0.0, 1.0) * 47.0;
  int i = int(min(floor(x), 46.0));
  return mix(profile[i], profile[i + 1], x - float(i));
}

float hash(vec3 cell, float period) {
  cell.z = mod(cell.z, period);
  vec3 p = fract(cell * 0.3183099 + 0.1) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x, float period) {
  vec3 i = floor(x);
  vec3 f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash(i, period), hash(i + vec3(1.0, 0.0, 0.0), period), f.x);
  float b = mix(hash(i + vec3(0.0, 1.0, 0.0), period), hash(i + vec3(1.0, 1.0, 0.0), period), f.x);
  float c = mix(hash(i + vec3(0.0, 0.0, 1.0), period), hash(i + vec3(1.0, 0.0, 1.0), period), f.x);
  float d = mix(hash(i + vec3(0.0, 1.0, 1.0), period), hash(i + vec3(1.0, 1.0, 1.0), period), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float clumps(vec2 around, float z) {
  return 0.65 * noise(vec3(around, z), PERIOD) + 0.35 * noise(vec3(2.0 * around + 5.0, 2.0 * z), 2.0 * PERIOD);
}

void main() {
  float edge = length(vOffset);
  float p = max(edge * reach, 1.0);
  float fade = 1.0 - smoothstep(0.7, 1.0, edge);
  float s = scattered(p);
  float haze = min(1.0 - exp(-depth * s), (1.0 - exp(-depth * share)) * s / share);
  vec2 around = vOffset / max(edge, 1e-6) * AROUND;
  float z = (p + log(max(p - 1.0, 0.05))) * outward - flow;
  float spacing = min(blur, 3.0) / 3.0;
  float n = (clumps(around, z) + clumps(around, z + spacing) + clumps(around, z + 2.0 * spacing)) / 3.0;
  float contrast = CONTRAST * smoothstep(CLUMPS_FROM, CLUMPS_TO, p) / (1.0 + SMEAR * blur);
  float grain = max(1.0 + contrast * (2.0 * n - 1.0), 0.0);
  gl_FragColor = vec4(light * haze * grain * fade, 1.0);
}
