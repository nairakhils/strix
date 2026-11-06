uniform vec2 viewport;
uniform float minRadius;
uniform float maxRadius;

attribute vec2 corner;

varying vec2 vCoord;
varying float vSpan;
varying float vRadius;
varying float vDim;

const float MAX_GAIN = 4.0;
const float LONGEST = 1.0;

void hide() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vDim = 0.0;
}

void streak(vec3 centre, vec3 motion, float radius) {
  vec4 head = projectionMatrix * modelViewMatrix * vec4(centre + 0.5 * motion, 1.0);
  vec4 tail = projectionMatrix * modelViewMatrix * vec4(centre - 0.5 * motion, 1.0);
  if (head.w <= 0.0 || tail.w <= 0.0) {
    hide();
    return;
  }
  vec2 halfView = 0.5 * viewport;
  vec2 from = tail.xy / tail.w * halfView;
  vec2 to = head.xy / head.w * halfView;
  float pixels = radius * projectionMatrix[1][1] * halfView.y / (0.5 * (head.w + tail.w));
  float drawn = clamp(pixels, minRadius, maxRadius);
  vec2 middle = 0.5 * (from + to);
  vec2 axis = to - from;
  float span = min(length(axis), LONGEST * drawn);
  vec2 along = length(axis) > 1e-4 ? normalize(axis) : vec2(1.0, 0.0);
  from = middle - 0.5 * span * along;
  to = middle + 0.5 * span * along;
  vec2 across = vec2(-along.y, along.x);
  float t = 0.5 + 0.5 * corner.x;
  vec2 point = mix(from, to, t) + (along * corner.x + across * corner.y) * 2.0 * drawn;
  vec4 clip = mix(tail, head, t);
  gl_Position = vec4(point / halfView * clip.w, clip.z, clip.w);
  vCoord = vec2(corner.x * (0.5 * span + 2.0 * drawn), corner.y * 2.0 * drawn);
  vSpan = 0.5 * span;
  vRadius = drawn;
  vDim = min((pixels * pixels) / (drawn * drawn), MAX_GAIN) / (1.0 + 1.95 * vSpan / drawn);
}
