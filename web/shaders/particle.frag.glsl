varying vec2 vCoord;
varying float vSpan;
varying float vRadius;
varying float vDim;
varying vec3 vColour;

void main() {
  float x = max(abs(vCoord.x) - vSpan, 0.0);
  float d2 = (x * x + vCoord.y * vCoord.y) / (vRadius * vRadius);
  float glow = exp(-3.0 * d2) * vDim;
  if (glow < 1e-4) discard;
  gl_FragColor = vec4(vColour * glow, 1.0);
}
