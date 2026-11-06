uniform vec3 centre;
uniform vec3 core;
uniform float scale;
uniform float reach;
uniform float inner;
uniform float front;
uniform float gasTemperature;
uniform sampler2D profile;
uniform vec3 wakeCentre;
uniform float wakeSize;
uniform float wakeDensity;
uniform float wakeTemperature;
uniform float gain;
uniform float stretch;
uniform float spread;
uniform float floorShare;
uniform float thickness;
uniform float knee;
uniform float toe;
uniform vec3 peaks;
uniform vec3 levels;
uniform float wakeLevel;

varying vec3 vRay;

const int STEPS = 32;
const float CENTRE_SHARE = 0.1;
const float LAYER_REACH = 4.0;
const float SATURATION = 0.4;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float through(float b, float radius) {
  return b < radius ? atan(sqrt(radius * radius - b * b) / b) : 0.0;
}

float boundColumn(vec3 origin, vec3 ray) {
  float along = -dot(origin, ray);
  if (along <= 0.0) return 0.0;
  float b = max(length(origin + ray * along), 1e-4);
  if (b >= front) return 0.0;
  float outer = 0.2 * (through(b, 0.4 * front) + through(b, 0.55 * front) + through(b, 0.7 * front) + through(b, 0.85 * front) + through(b, front));
  return 2.0 * (outer - through(b, inner)) / b;
}

float wakeColumn(vec3 origin, vec3 ray) {
  float along = max(-dot(origin, ray), 0.0);
  float d = length(origin + ray * along);
  return wakeDensity * wakeSize * 2.5066 * exp(-0.5 * d * d / (wakeSize * wakeSize));
}

float shown(float column, float peak) {
  if (peak <= 0.0 || column <= 0.0) return 0.0;
  float x = column / peak;
  float lift = pow(x / knee, toe);
  return asinh(x * lift / ((1.0 + lift) * stretch)) / asinh(1.0 / stretch);
}

void main() {
  vec3 ray = normalize(vRay);
  vec3 origin = (cameraPosition - centre) / scale;
  vec3 gas = glow(gasTemperature);
  vec3 light = vec3(0.0);
  if (levels.z > 0.0) light += gas * levels.z * shown(boundColumn((cameraPosition - core) / scale, ray), peaks.z);
  if (wakeDensity > 0.0) {
    vec3 hot = glow(wakeTemperature);
    hot *= dot(gas, LUMA) / max(dot(hot, LUMA), 1e-9);
    light += hot * wakeLevel * shown(wakeColumn((cameraPosition - wakeCentre) / scale, ray), peaks.z);
  }
  float b = dot(origin, ray);
  float h = b * b - dot(origin, origin) + reach * reach;
  if (h > 0.0 && levels.x + levels.y > 0.0) {
    h = sqrt(h);
    float near = max(-b - h, 0.0);
    float far = -b + h;
    float miss = sqrt(max(dot(origin, origin) - b * b, 0.0));
    float squeeze = max(miss, CENTRE_SHARE * reach);
    float first = asinh((near + b) / squeeze);
    float stride = (asinh((far + b) / squeeze) - first) / float(STEPS);
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float ejecta = 0.0;
    float outflow = 0.0;
    float warmth = 0.0;
    for (int i = 0; i < STEPS; i += 1) {
      float u = first + (float(i) + jitter) * stride;
      vec3 p = origin + ray * (squeeze * sinh(u) - b);
      float span = squeeze * cosh(u) * stride;
      float r = length(p);
      float x = r / reach;
      if (x >= 1.0) continue;
      float edge = 1.0 - smoothstep(0.75, 1.0, x);
      float mu = p.y / max(r, 1e-6);
      vec4 g = texture(profile, vec2(x, 0.5));
      ejecta += exp(g.r) * (floorShare + exp(-0.5 * mu * mu / (spread * spread))) * edge * span;
      if (abs(mu) < LAYER_REACH * thickness) {
        float dw = exp(g.g) * exp(-0.5 * mu * mu / (thickness * thickness)) * edge * span;
        outflow += dw;
        warmth += dw * g.b;
      }
    }
    light += gas * levels.x * shown(ejecta, peaks.x);
    if (outflow > 0.0) light += glow(exp(warmth / outflow)) * levels.y * shown(outflow, peaks.y);
  }
  float luma = dot(light, LUMA);
  if (luma <= 0.0) discard;
  gl_FragColor = vec4(mix(vec3(luma), light, SATURATION) * gain, 1.0);
}
