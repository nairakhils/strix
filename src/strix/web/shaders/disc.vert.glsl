uniform float inner;
uniform float outer;
uniform float sphere;
uniform float core;
uniform float accretor;
uniform float aspect;
uniform float size;
uniform float shutter;
uniform float arms;
uniform float scale;

attribute float radius;
attribute float angle;
attribute float height;
attribute float shine;


float diskTemperature(float r) {
  if (r <= inner) return 0.0;
  float ratio = inner / r;
  float feed = r < sphere ? r / sphere : 1.0;
  return core * pow(max(feed * (1.0 - sqrt(ratio)) * ratio * ratio * ratio, 0.0), 0.25);
}

void main() {
  if (radius <= 0.0) {
    hide();
    return;
  }
  float r = radius;
  float thin = aspect * pow(r / outer, 0.125);
  float rim = r / outer;
  float z = height * r * thin * sqrt(max(1.0 - rim * rim * rim * rim, 0.0));
  vec2 radial = vec2(cos(angle), sin(angle));
  vec3 centre = vec3(1.0 + r * radial.x, r * radial.y, z);
  float spin = sqrt(accretor / (r * r * r)) - 1.0;
  vec3 motion = vec3(-radial.y, radial.x, 0.0) * spin * shutter * r;
  float edge = 1.0 - smoothstep(0.82, 1.0, r / outer);
  float spiral = 1.0 + arms * smoothstep(0.45, 0.95, r / outer) * cos(2.0 * angle + 4.0 * log(r / outer));
  vColour = glow(diskTemperature(r)) * scale * shine * edge * spiral;
  streak(centre, motion, size);
}
