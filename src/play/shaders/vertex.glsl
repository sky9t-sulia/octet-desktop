// One square, stretched to wherever the layer goes: the corner arrives as 0 or
// 1 on each side, which is both where it belongs on screen and in the picture.
attribute vec2 corner;
uniform vec4 into;
// Best precision available, for the reason tube.glsl asks for it.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#endif
varying vec2 spot;
void main() {
    spot = corner;
    gl_Position = vec4(
        mix(into.x, into.z, corner.x),
        mix(into.y, into.w, corner.y),
        0.0, 1.0);
}
