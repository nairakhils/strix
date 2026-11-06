uniform float lobeOpacity;

varying vec3 vNormal;
varying vec3 vView;

const vec3 rim = vec3(0.16, 0.2, 0.28);

void main() {
  float facing = min(abs(dot(normalize(vNormal), normalize(vView))), 1.0);
  gl_FragColor = vec4(rim, lobeOpacity * 0.6 * pow(1.0 - facing, 6.0));
}
