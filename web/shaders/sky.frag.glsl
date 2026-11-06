uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform vec2 viewport;
uniform float pixelAngle;
uniform vec2 lensCenter[2];
uniform float lensEinstein[2];
uniform float lensActive[2];

#ifdef SKY_IMAGE
uniform sampler2D image;
uniform vec2 imageScale;
#endif

const float pi = 3.141592653589793;
const float starSigma = 0.65;
const float starPeak = 0.8;
const float layerCells[3] = float[3](48.0, 96.0, 192.0);
const float layerPresence[3] = float[3](0.8, 0.45, 0.22);

uvec3 pcg(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}

vec3 unit(uvec3 v) {
  return vec3(v) * (1.0 / 4294967296.0);
}

vec3 viewRay(vec2 pixel) {
  vec2 ndc = pixel / viewport * 2.0 - 1.0;
  vec4 view = inverseProjection * vec4(ndc, -1.0, 1.0);
  return normalize(mat3(cameraWorld) * (view.xyz / view.w));
}

vec3 unfold(int axis, float side, vec2 plane) {
  if (axis == 0) return vec3(side, plane);
  if (axis == 1) return vec3(plane.x, side, plane.y);
  return vec3(plane, side);
}

vec3 tint(float t) {
  if (t < 0.62) return vec3(1.0, 0.96, 0.92);
  if (t < 0.8) return vec3(1.0, 0.85, 0.66);
  if (t < 0.9) return vec3(1.0, 0.71, 0.46);
  return vec3(0.68, 0.8, 1.0);
}

vec3 starfield(vec3 ray, vec3 dx, vec3 dy, float magnification) {
  vec3 size = abs(ray);
  int axis = size.x >= size.y && size.x >= size.z ? 0 : (size.y >= size.z ? 1 : 2);
  float major = ray[axis];
  float side = sign(major);
  vec2 plane = axis == 0 ? ray.yz : (axis == 1 ? ray.xz : ray.xy);
  vec2 s = atan(plane / abs(major)) / (0.25 * pi);
  uint face = uint(axis * 2) + (side > 0.0 ? 1u : 0u);

  float gxx = dot(dx, dx);
  float gxy = dot(dx, dy);
  float gyy = dot(dy, dy);
  float det = max(gxx * gyy - gxy * gxy, 1e-6 * gxx * gyy);
  mat2 toScreen = mat2(gyy, -gxy, -gxy, gxx) / det;

  vec3 light = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float cells = layerCells[layer];
    vec2 home = floor((s * 0.5 + 0.5) * cells - 0.5);
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        vec2 cell = home + vec2(i, j);
        if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, vec2(cells)))) continue;
        uvec3 seed = pcg(uvec3(uvec2(cell), face * 3u + uint(layer)));
        vec3 h = unit(seed);
        if (h.x > layerPresence[layer]) continue;
        vec2 spot = (cell + 0.15 + 0.7 * h.yz) / cells * 2.0 - 1.0;
        vec3 star = normalize(unfold(axis, side, tan(spot * 0.25 * pi)));
        vec3 offset = star - ray;
        vec2 screen = toScreen * vec2(dot(offset, dx), dot(offset, dy));
        float r2 = dot(screen, screen);
        if (r2 > 9.0) continue;
        vec3 g = unit(pcg(seed));
        float brightness = min(starPeak, 0.035 * pow(max(g.x, 1e-4), -2.0 / 3.0));
        light += tint(g.y) * brightness * magnification * exp(-0.5 * r2 / (starSigma * starSigma));
      }
    }
  }
  return min(light, vec3(starPeak));
}

#ifdef SKY_IMAGE
vec3 backdrop(vec3 ray) {
  vec2 uv = vec2(atan(ray.z, ray.x), asin(clamp(ray.y, -1.0, 1.0))) * imageScale + vec2(0.0, 0.5);
  float period = 2.0 * pi * imageScale.x;
  vec2 du = dFdx(uv);
  vec2 dv = dFdy(uv);
  du.x -= period * round(du.x / period);
  dv.x -= period * round(dv.x / period);
  return textureGrad(image, uv, du, dv).rgb;
}
#endif

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 source = pixel;
  for (int i = 0; i < 2; i++) {
    vec2 offset = pixel - lensCenter[i];
    float theta = max(length(offset), 0.5);
    float einstein = lensEinstein[i];
    float reach = 1.0 - smoothstep(6.0 * einstein, 9.0 * einstein, theta);
    source -= lensActive[i] * reach * einstein * einstein / (theta * theta) * offset;
  }

  vec3 ray = viewRay(source);
#ifdef SKY_IMAGE
  vec3 color = backdrop(ray);
#else
  vec3 plain = viewRay(pixel);
  vec3 dx = dFdx(ray);
  vec3 dy = dFdy(ray);
  float plainArea = length(cross(dFdx(plain), dFdy(plain)));
  float lensedArea = max(length(cross(dx, dy)), 1e-4 * pixelAngle * pixelAngle);
  vec3 color = starfield(ray, dx, dy, min(plainArea / lensedArea, 64.0));
#endif
  gl_FragColor = vec4(color, 1.0);
}
