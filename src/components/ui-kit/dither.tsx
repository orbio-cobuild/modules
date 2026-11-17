'use client'

// Animated dither background (D296), after Sharpe's hero: slow domain-warped noise waves, quantised to a
// few levels with an 8×8 Bayer dither, in the brand's primary colour over the page background. One
// plain WebGL pass (no three.js). About 30 fps, paused off-screen or in a hidden tab, a single still
// frame under prefers-reduced-motion, and nothing at all when WebGL is unavailable.
import { useEffect, useRef } from 'react'

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg;
uniform vec3 uWave;
uniform float uMax;
const float PIXEL = 3.0;
const float LEVELS = 6.0;
const float SPEED = 0.045;
const float SCALE = 2.2;
vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash(i + vec2(1.0)), f - vec2(1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 cell = floor(gl_FragCoord.xy / PIXEL);
  float t = uTime * SPEED;
  vec2 uv = cell * PIXEL / uRes.y * SCALE;
  vec2 q = vec2(fbm(uv + vec2(t, 0.0)), fbm(uv + vec2(5.2, 1.3) - t));
  float f = fbm(uv + 2.2 * q + vec2(0.7 * t, -0.4 * t));
  f = clamp(f * 1.8 + 0.45, 0.0, 1.0);
  float level = floor(f * (LEVELS - 1.0) + bayer8(cell)) / (LEVELS - 1.0);
  gl_FragColor = vec4(mix(uBg, uWave, clamp(level, 0.0, 1.0) * uMax), 1.0);
}`

function rgb(hex: string): [number, number, number] {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
}

/** `strength` caps how far the waves go toward `wave` (0–1), so a headline on top stays readable. */
export function DitherBackdrop({ bg, wave, strength = 0.42, className }: { bg: string; wave: string; strength?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas?.getContext('webgl', { antialias: false, depth: false, powerPreference: 'low-power' })
    if (!canvas || !gl) return
    const vs = shader(gl, gl.VERTEX_SHADER, VERT)
    const fs = shader(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    // One triangle that covers the canvas.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    gl.uniform3fv(gl.getUniformLocation(prog, 'uBg'), rgb(bg))
    gl.uniform3fv(gl.getUniformLocation(prog, 'uWave'), rgb(wave))
    gl.uniform1f(gl.getUniformLocation(prog, 'uMax'), Math.max(0, Math.min(1, strength)))
    const uRes = gl.getUniformLocation(prog, 'uRes')
    const uTime = gl.getUniformLocation(prog, 'uTime')

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    const draw = (now: number) => {
      gl.uniform1f(uTime, (now - start) / 1000 + 20)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth))
      const h = Math.max(1, Math.round(canvas.clientHeight))
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
      draw(performance.now())
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    let onScreen = true
    const io = new IntersectionObserver(([e]) => (onScreen = e?.isIntersecting ?? true))
    io.observe(canvas)
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (!onScreen || document.hidden || now - last < 33) return
      last = now
      draw(now)
    }
    if (!still) raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      gl.deleteProgram(prog)
    }
  }, [bg, wave, strength])

  return <canvas ref={ref} aria-hidden className={className} style={{ imageRendering: 'pixelated' }} />
}
