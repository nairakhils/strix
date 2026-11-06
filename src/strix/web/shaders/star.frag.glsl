uniform vec3 colour;
uniform float radiance;
uniform float teff;
uniform float compression;
uniform vec2 limb;
uniform float cells;
uniform float amplitude;
uniform float time;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vSurface;
varying float vDarkening;

const float granuleMean = 0.40;
const float granuleSpread = 0.19;
const float churn = 0.5;
const vec3 bandTemperature = vec3(23586.5, 26159.6, 30941.4);
const vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);
const float coolestRatio = 0.05;

vec3 hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float nearest(vec3 p, float phase) {
  vec3 cell = floor(p);
  vec3 offset = fract(p);
  float closest = 8.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 neighbour = vec3(float(i), float(j), float(k));
        vec3 seed = hash3(cell + neighbour);
        vec3 centre = neighbour + 0.5 + 0.4 * sin(phase + 6.2831853 * seed) - offset;
        closest = min(closest, dot(centre, centre));
      }
    }
  }
  return sqrt(closest);
}

float granules(vec3 p) {
  float large = 1.0 - smoothstep(0.0, 0.9, nearest(p, time * churn));
  float small = 1.0 - smoothstep(0.0, 0.9, nearest(2.13 * p + vec3(17.1, 3.7, 9.2), time * churn * 1.7));
  return (0.7 * large + 0.3 * small - granuleMean) / granuleSpread;
}

vec3 bandFactor(float ratio) {
  vec3 x = bandTemperature / teff;
  vec3 band = (exp(x) - 1.0) / (exp(min(x / max(ratio, coolestRatio), 80.0)) - 1.0);
  return band * pow(max(dot(band, lumaWeights), 1e-30), compression - 1.0);
}

void main() {
  float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
  float edge = 1.0 - mu;
  float intensity = 1.0 - limb.x * edge - limb.y * edge * edge;
  vec3 p = vSurface * cells * 0.5;
  float cellPixels = 1.0 / max(length(fwidth(p)), 1e-6);
  float contrast = 0.5 * amplitude * smoothstep(3.0, 8.0, cellPixels);
  float grain = contrast > 0.0 ? granules(p) : 0.0;
  vec3 local = bandFactor(vDarkening);
  gl_FragColor = vec4(colour * radiance * intensity * local * (1.0 + contrast * grain), 1.0);
}
