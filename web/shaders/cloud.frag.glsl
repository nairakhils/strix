uniform vec3 centre;
uniform float radius;
uniform float temperature;
uniform float scale;
uniform float core;
uniform float slope;
uniform vec3 shadowAxis;
uniform float shadowStart;
uniform float shadowCos;

varying vec3 vRay;

const int STEPS = 32;
const float CORE_WARMTH = 1.3;
const float EDGE_WARMTH = 0.85;
const float SATURATION = 0.4;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float density(vec3 p, float f) {
  float profile = f < core ? 1.0 : pow(f / core, -slope);
  float soft = 0.25 * (1.0 - shadowCos);
  float behind = smoothstep(shadowCos - soft, shadowCos + soft, dot(p, shadowAxis) / max(f, 1e-6));
  float passed = smoothstep(shadowStart, 1.15 * shadowStart, f);
  return profile * (1.0 - behind * passed);
}

void main() {
  vec3 ray = normalize(vRay);
  vec3 origin = (cameraPosition - centre) / radius;
  float b = dot(origin, ray);
  float h = b * b - dot(origin, origin) + 1.0;
  if (h <= 0.0) discard;
  h = sqrt(h);
  float near = max(-b - h, 0.0);
  float far = -b + h;
  if (far <= near) discard;
  float span = (far - near) / float(STEPS);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float total = 0.0;
  float warm = 0.0;
  for (int i = 0; i < STEPS; i += 1) {
    vec3 p = origin + ray * (near + (float(i) + jitter) * span);
    float f = length(p);
    float d = density(p, f);
    total += d;
    warm += d * mix(CORE_WARMTH, EDGE_WARMTH, f);
  }
  if (total <= 0.0) discard;
  vec3 light = glow(temperature * warm / total) * total * span * scale;
  gl_FragColor = vec4(mix(vec3(dot(light, LUMA)), light, SATURATION), 1.0);
}
