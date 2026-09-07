// Best precision the device has: the line and stripe counts grow large down a
// tall screen, and a middling float starts rounding them into steps that beat
// against the pixel grid as moire.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D picture;
/** How many real pixels one console pixel became. */
uniform vec2 grain;
uniform float scanline;
uniform float mask;
varying vec2 spot;

/** What the console draws, in its own pixels. */
const vec2 RES = vec2(256.0, 240.0);

/** How soft the sides of one console pixel are, along its line. */
const float HARD_PIX = -3.0;

// Light adds up as light, not as the numbers a picture is stored in. Dimming
// a line to half its stored value takes far more than half the light out of
// it, which is what makes gaps cut in the stored numbers read as black bars
// rather than as the dark between lines.
float toLight1(float c) {
    return (c <= 0.04045) ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
vec3 toLight(vec3 c) {
    return vec3(toLight1(c.r), toLight1(c.g), toLight1(c.b));
}
float toStored1(float c) {
    return (c < 0.0031308) ? c * 12.92 : 1.055 * pow(c, 0.41666) - 0.055;
}
vec3 toStored(vec3 c) {
    return vec3(toStored1(c.r), toStored1(c.g), toStored1(c.b));
}

/** One console pixel, in light, or nothing beyond the edge of the picture. */
vec3 grab(vec2 pos, float off) {
    vec2 at = (floor(pos * RES + vec2(off, 0.0)) + 0.5) / RES;
    if (abs(at.x - 0.5) > 0.5) {
        return vec3(0.0);
    }
    return toLight(texture2D(picture, at).rgb);
}

/** How far this fragment sits from the middle of its console pixel. */
float offset(vec2 pos) {
    float at = pos.x * RES.x;
    return -((at - floor(at)) - 0.5);
}

float bell(float pos) {
    return exp2(HARD_PIX * pos * pos);
}

/**
 * A console pixel is not a square of one colour but a spot of light with soft
 * sides, so the five along the line are weighed by how near this fragment
 * falls to each. That is what lets a picture scaled by some fraction keep an
 * even weight across it rather than gathering into stairs.
 */
vec3 alongLine(vec2 pos) {
    vec3 far = grab(pos, -2.0);
    vec3 back = grab(pos, -1.0);
    vec3 here = grab(pos, 0.0);
    vec3 next = grab(pos, 1.0);
    vec3 away = grab(pos, 2.0);
    float from = offset(pos);
    float wf = bell(from - 2.0);
    float wb = bell(from - 1.0);
    float wh = bell(from);
    float wn = bell(from + 1.0);
    float wa = bell(from + 2.0);
    return (far * wf + back * wb + here * wh + next * wn + away * wa) /
           (wf + wb + wh + wn + wa);
}

void main() {
    vec3 here;
    if (scanline > 0.0 || mask > 0.0) {
        here = alongLine(spot);
    } else {
        here = toLight(texture2D(picture, spot).rgb);
    }

    // The dark gap the raster left between its lines.
    //
    // Not weighed off the console's own line spacing the way the reading
    // along a line is: spaced by the picture but rounded to whole screen
    // pixels and counted from the screen, so the gaps land on the grid
    // instead of drifting across it and gathering into moire — which is
    // exactly what FILL's fractional scale would otherwise do to them.
    if (scanline > 0.0 && grain.y >= 2.0) {
        // Squared: read straight off the setting, four out of ten already
        // took a fifth of the light.
        float deep = scanline * scanline * 0.5;
        float period = max(2.0, floor(grain.y + 0.5));
        float down = fract(gl_FragCoord.y / period);
        here *= 1.0 - deep * (1.0 - sin(down * 3.14159265));
        // Put back what the gaps took on average, or the picture merely goes
        // dim. The mean of a sine over its arch is two over pi.
        here /= 1.0 - deep * (1.0 - 0.63661977);
    }

    // Three phosphors to a triad, each let down where it is not the one lit,
    // and the other raised past one to put back what they took: a mask brings
    // its own light with it rather than laying a grey veil over everything.
    // Skewed down the screen, as the holes in a real mask are, which keeps the
    // stripes from standing in columns and beating against the pixel grid.
    if (mask > 0.0) {
        // At the full setting these are his: half the light let through where
        // the phosphor is not lit, half again where it is.
        float dark = 1.0 - mask;
        float lit = 1.0 + mask;
        vec2 at = gl_FragCoord.xy;
        at.x += at.y * 3.0;
        vec3 stripe = vec3(dark);
        float which = fract(at.x / 6.0);
        if (which < 0.333) { stripe.r = lit; }
        else if (which < 0.666) { stripe.g = lit; }
        else { stripe.b = lit; }
        here *= stripe;
    }

    here = toStored(clamp(here, 0.0, 1.0));

    // Shading to a fraction of a step shows as bands. A wobble of under one
    // step, in a pattern that does not repeat with the grid, spreads each
    // step over the pixels either side of it.
    if (scanline > 0.0 || mask > 0.0) {
        float grid = fract(dot(gl_FragCoord.xy, vec2(0.0625, 0.25)));
        here += (grid - 0.5) / 255.0;
    }
    gl_FragColor = vec4(here, 1.0);
}
