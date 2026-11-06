uniform sampler2D frame;
uniform sampler2D frameDepth;
uniform vec2 viewport;
uniform vec2 lensCenter[2];
uniform float lensShadow[2];
uniform float lensEinstein[2];
uniform float lensDepth[2];
uniform float lensReach[2];

bool onScreen(vec2 uv) {
  return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
}

float depthAt(vec2 uv) {
  return textureLod(frameDepth, uv, 0.0).r;
}

bool sky(vec2 uv, float depth) {
  vec2 dx = vec2(1.0 / viewport.x, 0.0);
  vec2 dy = vec2(0.0, 1.0 / viewport.y);
  return depth >= 1.0
    && min(min(depthAt(uv + dx), depthAt(uv - dx)), min(depthAt(uv + dy), depthAt(uv - dy))) >= 1.0;
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 uv = pixel / viewport;
  vec3 colour = texture(frame, uv).rgb;
  int lens = -1;
  float theta = 0.0;
  for (int i = 0; i < 2; i++) {
    float d = length(pixel - lensCenter[i]);
    if (d <= lensReach[i] && (lens < 0 || d < theta)) {
      lens = i;
      theta = d;
    }
  }
  if (lens < 0) {
    gl_FragColor = vec4(colour, 1.0);
    return;
  }
  float hole = lensDepth[lens];
  float here = depthAt(uv);
  if (here < hole) {
    gl_FragColor = vec4(colour, 1.0);
    return;
  }
  bool clear = sky(uv, here);
  float shadow = lensShadow[lens];
  float einstein = lensEinstein[lens];
  vec2 offset = pixel - lensCenter[lens];
  float fade = 1.0 - smoothstep(6.0, 9.0, theta / max(einstein, 1e-3));
  vec2 at = (pixel - fade * einstein * einstein / max(theta * theta, 0.25) * offset) / viewport;
  float there = onScreen(at) ? depthAt(at) : 0.0;
  bool behind = there >= hole;
  bool body = behind && !sky(at, there);
  vec3 source = behind ? textureLod(frame, at, 0.0).rgb : vec3(0.0);
  vec3 seen = body || (behind && !clear) ? source : (clear ? colour : vec3(0.0));
  float covered = (1.0 - smoothstep(shadow - 0.5, shadow + 0.5, theta)) * min(1.0, 4.0 * shadow * shadow);
  gl_FragColor = vec4(seen * (1.0 - covered), 1.0);
}
