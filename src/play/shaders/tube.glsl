// Best precision the device has: the line and stripe counts grow large down a
// tall screen, and a middling float starts rounding them into steps that beat
// against the pixel grid as moire.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D picture;
/** Every colour the PPU can emit, emphasis folded in: 512 across, one down. */
uniform sampler2D palette;
/**
 * What the picture holds: 0 for colour already expanded, 1 for the PPU's own
 * identities. A front end that sets neither of these gets the picture put up
 * exactly as it hands it over, which is what the older path did.
 */
uniform float identities;
/** 0 looks the colour up; 1 builds the signal a television saw and decodes it. */
uniform float composite;
/** Which frame, for the phase that walks on between them. */
uniform float field;
/** How many real pixels one console pixel became. */
uniform vec2 grain;
uniform float scanline;
uniform float mask;
varying vec2 spot;

/** What the console draws, in its own pixels. */
const vec2 RES = vec2(256.0, 240.0);

/** How soft the sides of one console pixel are, along its line. */
const float HARD_PIX = -3.0;
/**
 * And how soft they are once the signal has been decoded.
 *
 * A television blurred a picture twice over: the signal smeared the colour
 * along the line, and the beam laid it down as a spot with soft sides. The
 * two do stack, so there is a case for drawing the spot tighter here. Tried
 * at a ninth of this width and the picture went hard: the softness was what
 * the decode was wanted for. Left where the ordinary spot is, and the two are
 * allowed to overlap.
 */
const float HARD_PIX_DECODED = -3.0;

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

// ---- What the PPU actually emits -------------------------------------
//
// Not a colour: a square wave whose level is the brightness and whose phase
// against the colour burst is the hue. Looking the entry up in a table is the
// short answer; building the wave and demodulating it is what a television
// did, and it is where dithering turns into a solid colour and where the
// fringes along an edge come from.

/** Voltage levels, relative to sync, by brightness. */
const vec4 LOW = vec4(0.350, 0.518, 0.962, 1.550);
const vec4 HIGH = vec4(1.094, 1.506, 1.962, 1.962);
/** What a de-emphasis bit does to the third of the period it covers. */
const float ATTENUATION = 0.746;
const float BLACK = 0.518;
const float WHITE = 1.962;
/** Where the burst sits: found by decoding all sixty-four colours and fitting
    them to the palette the core hands over. */
const float ROTATION = 2.0943951;

float pick(vec4 v, float i) {
    return i < 0.5 ? v.x : (i < 1.5 ? v.y : (i < 2.5 ? v.z : v.w));
}

/** Six of the twelve steps are high for any one hue. */
bool inPhase(float hue, float phase) {
    return mod(hue + phase, 12.0) < 6.0;
}

/** The identity of one console pixel: palette entry, then emphasis. */
vec2 identity(vec2 at) {
    vec4 raw = texture2D(picture, at);
    return vec2(floor(raw.r * 255.0 + 0.5), floor(raw.g * 255.0 + 0.5));
}

vec3 lookup(vec2 id) {
    return texture2D(palette, vec2((id.x + id.y * 64.0 + 0.5) / 512.0, 0.5)).rgb;
}

/** The signal one identity puts out at one step of the burst. */
float wave(vec2 id, float phase) {
    float hue = mod(id.x, 16.0);
    float level = floor(id.x / 16.0);
    // The last two hues have no colour and sit at one level whatever is asked.
    if (hue > 13.0) { level = 1.0; }
    float low = pick(LOW, level);
    float high = pick(HIGH, level);
    if (hue < 0.5) { low = high; }
    if (hue > 12.5) { high = low; }
    float signal = inPhase(hue, phase) ? high : low;
    float e = id.y;
    bool dim = (mod(e, 2.0) >= 1.0 && inPhase(0.0, phase))
            || (mod(floor(e * 0.5), 2.0) >= 1.0 && inPhase(4.0, phase))
            || (mod(floor(e * 0.25), 2.0) >= 1.0 && inPhase(8.0, phase));
    return dim ? signal * ATTENUATION : signal;
}

/**
 * One console pixel as a television would have shown it.
 *
 * Eight samples make a pixel and twelve make a turn of the burst, so a whole
 * scanline does not divide evenly and each line starts a third of a turn on
 * from the last. That is where the crawl up the picture comes from, and it
 * falls out of the arithmetic rather than being put in.
 */
vec3 decode(vec2 pos) {
    vec2 cell = floor(pos * RES);
    vec2 left = identity((cell + vec2(-1.0, 0.5)) / RES);
    vec2 here = identity((cell + 0.5) / RES);
    vec2 right = identity((cell + vec2(1.0, 0.5)) / RES);
    float base = cell.x * 8.0 + cell.y * 4.0 + field * 4.0;
    float y = 0.0;
    float i = 0.0;
    float q = 0.0;
    for (int t = 0; t < 12; t++) {
        float s = float(t) - 2.0;
        vec2 id = s < 0.0 ? left : (s > 7.0 ? right : here);
        float phase = mod(base + s, 12.0);
        float v = wave(id, phase);
        float a = 6.2831853 * phase / 12.0 + ROTATION;
        y += v;
        i += v * cos(a);
        q += v * sin(a);
    }
    float span = WHITE - BLACK;
    y = (y / 12.0 - BLACK) / span;
    i = (i / 12.0) / span * 2.0;
    q = (q / 12.0) / span * 2.0;
    return clamp(
        vec3(y + 0.956 * i + 0.619 * q, y - 0.272 * i - 0.647 * q, y - 1.106 * i + 1.703 * q),
        0.0, 1.0);
}

/** The colour of one console pixel, however the front end asked for it. */
vec3 source(vec2 at) {
    if (identities < 0.5) {
        return texture2D(picture, at).rgb;
    }
    return composite > 0.5 ? decode(at) : lookup(identity(at));
}

/** One console pixel, in light, or nothing beyond the edge of the picture. */
vec3 grab(vec2 pos, float off) {
    vec2 at = (floor(pos * RES + vec2(off, 0.0)) + 0.5) / RES;
    if (abs(at.x - 0.5) > 0.5) {
        return vec3(0.0);
    }
    return toLight(source(at));
}

/** How far this fragment sits from the middle of its console pixel. */
float offset(vec2 pos) {
    float at = pos.x * RES.x;
    return -((at - floor(at)) - 0.5);
}

float bell(float pos) {
    float hard = composite > 0.5 ? HARD_PIX_DECODED : HARD_PIX;
    return exp2(hard * pos * pos);
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
        here = toLight(source(spot));
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
