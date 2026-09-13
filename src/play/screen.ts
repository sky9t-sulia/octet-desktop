import TUBE from "./shaders/tube.glsl?raw";
import VERTEX from "./shaders/vertex.glsl?raw";

/**
 * The screen: the shaders from octet-android, over the picture.
 *
 * [`shaders/`](./shaders) holds byte-for-byte copies of the Android app's
 * `vertex.glsl` and `tube.glsl` — `npm run check:shaders` proves it. They are
 * not ported and not adapted: a tube that processes light even slightly
 * differently from the phone's is a different picture, and nobody would notice
 * until the two were held up together.
 *
 * That decides the shape of everything here. The shader wants a plain RGBA
 * `picture`, so it gets one: the index plane the emulator sends is expanded
 * through the palette here, on the way to the texture. The small wire format
 * still pays for itself, because what it saves is the bridge crossing — 61,688
 * bytes a frame instead of 245,760 — and a lookup per pixel in a typed array
 * costs well under a millisecond.
 *
 * Geometry follows the Android renderer's `place()` exactly, which means the
 * console's own 256×240 proportions are kept in both scale modes. FILL allows
 * a fractional scale; PIXEL rounds down to a whole one. Neither stretches the
 * picture to the frame.
 */

/** Mirrors the wire format documented in `src-tauri/src/frame.rs`. */
const HEADER = 8;
const VERSION = 1;

/** What the console draws, as `tube.glsl`'s own `RES` constant has it. */
const WIDTH = 256;
const HEIGHT = 240;

/** How the picture sits in the frame. `PIXEL` and `FILL` as Android names them. */
export type Scale = "pixel" | "fill";

/**
 * How much tube to put over the picture.
 *
 * The two numbers are the Android app's, out of ten, from `Play.Knobs`:
 * `mask` is 3 for MEDIUM and 5 for CRT; `scanline` is 5 and 8, and zero
 * whenever the scanline setting is off *or* the filter is SHARP. The shader
 * divides both by ten, so that is done here too.
 */
export type Look = {
  scale: Scale;
  /** 0 to 0.8. */
  scanline: number;
  /** 0 to 0.5. */
  mask: number;
  /**
   * Decode the signal rather than look the colour up.
   *
   * The console emits a wave, not a colour: the same eight identities a
   * television blurs into one tint stay eight separate pixels if they are
   * only looked up. Costs a dozen taps a pixel on the GPU.
   */
  composite?: boolean;
};

/** The knob values for one filter and the scanline toggle, as Android sets them. */
export function knobs(filter: "sharp" | "smooth" | "crt", scanlines: boolean) {
  const mask = filter === "smooth" ? 3 : filter === "crt" ? 5 : 0;
  // SHARP takes no scanlines even with the setting on — the same rule
  // `Play.Knobs.scanline` applies.
  const scanline = !scanlines ? 0 : filter === "smooth" ? 5 : filter === "crt" ? 8 : 0;
  // The tube setting is the one that asks for a television, so it is the one
  // that decodes the signal rather than looking the colour up.
  return { scanline: scanline / 10, mask: mask / 10, composite: filter === "crt" };
}

function compile(gl: WebGLRenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("could not create a shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader would not compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export class Screen {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private picture: WebGLTexture;
  private quad: WebGLBuffer;
  private places = new Map<string, WebGLUniformLocation | null>();
  private corner: number;

  /** Whether the texture has been sized yet, so it is refilled not remade. */
  private sized = false;

  /**
   * The frame as the PPU's own identities, packed for the texture: the palette
   * entry in red, the emphasis in green. The shader turns them into light,
   * either through the palette or by decoding the signal.
   */
  private cells = new Uint8Array(WIDTH * HEIGHT * 4);
  /** Every colour, as a 512 by 1 texture the shader indexes. */
  private paletteBytes = new Uint8Array(512 * 4);
  private paletteTex: WebGLTexture | null = null;
  /** The emphasis of each scanline, from the frame's own header. */
  private emphasis = new Uint8Array(HEIGHT);

  private look: Look = { scale: "pixel", scanline: 0, mask: 0 };
  /** Which frame the burst is on, counted so the crawl walks as it did. */
  private field = 0;

  constructor(private canvas: HTMLCanvasElement) {
    // The shaders are GLSL ES 1.00, which a WebGL2 context still accepts —
    // so either will do, and nothing about them has to change for it.
    const gl = (canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
    }) ?? canvas.getContext("webgl", { alpha: false, antialias: false, depth: false })) as
      | WebGLRenderingContext
      | null;
    if (!gl) throw new Error("this webview has no WebGL");
    this.gl = gl;

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(this.program, compile(gl, gl.FRAGMENT_SHADER, TUBE));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`shaders would not link: ${gl.getProgramInfoLog(this.program)}`);
    }
    gl.useProgram(this.program);

    // The one square every layer is drawn as, in the order and winding
    // `Tube.stretch` uses: a triangle strip of four corners.
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.corner = gl.getAttribLocation(this.program, "corner");

    this.picture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.picture);
    // Nearest, as `Tube.texture` sets it: every softening the tube does, it
    // does itself.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  /** Where `name` lives, looked up once — asking by name goes through the driver. */
  private place(name: string) {
    let at = this.places.get(name);
    if (at === undefined) {
      at = this.gl.getUniformLocation(this.program, name);
      this.places.set(name, at);
    }
    return at;
  }

  /**
   * The palette the emulator built, packed for expansion.
   *
   * Taken from the core rather than restated here, so the picture cannot
   * disagree with the emulator about what a colour is.
   */
  setPalette(colours: number[]) {
    const bytes = this.paletteBytes;
    for (let i = 0; i < 512; i++) {
      const c = colours[i] ?? 0;
      bytes[i * 4] = (c >> 16) & 0xff;
      bytes[i * 4 + 1] = (c >> 8) & 0xff;
      bytes[i * 4 + 2] = c & 0xff;
      bytes[i * 4 + 3] = 0xff;
    }
    const gl = this.gl;
    if (!this.paletteTex) {
      this.paletteTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
      // One texel per colour, taken exactly: nothing here is to be blended.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  setLook(look: Look) {
    this.look = look;
  }

  /** Draws one encoded frame. False if it was not one we understand. */
  draw(bytes: Uint8Array): boolean {
    if (bytes.length < HEADER || bytes[0] !== VERSION) return false;
    const perScanline = bytes[1] === 1;

    if (perScanline) {
      this.emphasis.set(bytes.subarray(HEADER, HEADER + HEIGHT));
    } else {
      this.emphasis.fill(bytes[2]);
    }
    const from = HEADER + (perScanline ? HEIGHT : 0);
    const indices = bytes.subarray(from, from + WIDTH * HEIGHT);
    if (indices.length < WIDTH * HEIGHT) return false;

    this.pack(indices);
    this.paint();
    return true;
  }

  /**
   * Turns palette entries into pixels.
   *
   * One load and one store per pixel, both into typed arrays. The emphasis of
   * a line shifts the identity by 64, which is where the emulator put it.
   */
  private pack(indices: Uint8Array) {
    const { cells, emphasis } = this;
    let at = 0;
    for (let y = 0; y < HEIGHT; y++) {
      const emph = emphasis[y];
      for (let x = 0; x < WIDTH; x++, at++) {
        cells[at * 4] = indices[at];
        cells[at * 4 + 1] = emph;
        cells[at * 4 + 3] = 0xff;
      }
    }
  }

  /**
   * Puts the picture up, placed as `PlayView.place` places it.
   *
   * The whole canvas is cleared to black — the app's own ground colour, as
   * `PlayView.GROUND` has it — and the picture is drawn into a centred
   * rectangle inside it, keeping 256×240 proportions in both scale modes.
   */
  private paint() {
    const gl = this.gl;

    // Device pixels, so the tube's own grid lines up with the screen's.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const wide = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const high = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== wide || this.canvas.height !== high) {
      this.canvas.width = wide;
      this.canvas.height = high;
    }

    // `place()`, from PlayView.kt.
    const fits = Math.min(wide / WIDTH, high / HEIGHT);
    const scale = this.look.scale === "fill" ? fits : Math.max(1, Math.floor(fits));
    const across = WIDTH * scale;
    const down = HEIGHT * scale;
    const left = (wide - across) / 2;
    const top = (high - down) / 2;
    const right = (wide + across) / 2;
    const bottom = (high + down) / 2;

    gl.viewport(0, 0, wide, high);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.picture);
    if (this.sized) {
      // Refilled rather than remade; remaking waits on the last frame's read.
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, this.cells,
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, WIDTH, HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.cells,
      );
      this.sized = true;
    }

    gl.uniform1i(this.place("picture"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.uniform1i(this.place("palette"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(this.place("identities"), 1);
    gl.uniform1f(this.place("composite"), this.look.composite ? 1 : 0);
    // The burst walks on between frames, and the crawl walks with it.
    gl.uniform1f(this.place("field"), this.field);
    this.field = (this.field + 1) % 3;
    // How many real pixels one console pixel became — square, both ways.
    gl.uniform2f(this.place("grain"), across / WIDTH, down / HEIGHT);
    gl.uniform1f(this.place("scanline"), this.look.scanline);
    gl.uniform1f(this.place("mask"), this.look.mask);

    // `stretch()`, from Tube.kt: the square mapped into clip space.
    gl.uniform4f(
      this.place("into"),
      (left / wide) * 2 - 1,
      1 - (top / high) * 2,
      (right / wide) * 2 - 1,
      1 - (bottom / high) * 2,
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.corner);
    gl.vertexAttribPointer(this.corner, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(this.corner);
  }

  close() {
    const gl = this.gl;
    gl.deleteTexture(this.picture);
    gl.deleteBuffer(this.quad);
    gl.deleteProgram(this.program);
  }
}
