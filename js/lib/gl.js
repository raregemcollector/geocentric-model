/* gl.js — a small purpose-built WebGL renderer (no dependencies).
 *
 * Replaces JsGraphX3D. Instead of redrawing every primitive through a 2D canvas, all
 * geometry goes into typed-array batches that are uploaded once per change and drawn
 * by the GPU with depth testing:
 *   LineBatch  — screen-space thick, anti-aliased lines (real pixel widths, unlike
 *                gl.lineWidth which is stuck at 1px on most platforms); optional
 *                "clip below ground" for the local celestial sphere.
 *   PointBatch — procedural markers (disc, sun glow, 4/5/6-point stars) in pixels.
 *   TriBatch   — flat-colored triangles (observer marker, dome shell).
 *   Disc       — the flat-earth map; the night shadow is computed per pixel from the
 *                real Sun direction, so there is no terminator polygon to build.
 * Static batches (grids) keep their data; dynamic ones are cleared and refilled. */
var FE = window.FE = window.FE || {};

(function () {
  var LINE_VS = [
    'attribute vec3 a_p0; attribute vec3 a_p1; attribute vec2 a_corner;',
    'attribute vec4 a_color; attribute float a_width;',
    'uniform mat4 u_vp; uniform mat4 u_model; uniform vec2 u_viewport; uniform float u_dpr;',
    'varying vec4 v_color; varying float v_side; varying float v_hw; varying vec3 v_world;',
    'void main(){',
    '  vec4 w0 = u_model*vec4(a_p0,1.0); vec4 w1 = u_model*vec4(a_p1,1.0);',
    '  vec4 c0 = u_vp*w0; vec4 c1 = u_vp*w1;',
    '  vec2 h = u_viewport*0.5;',
    '  vec2 s0 = c0.xy/c0.w*h; vec2 s1 = c1.xy/c1.w*h;',
    '  vec2 d = s1-s0; float L = length(d);',
    '  vec2 dir = L > 1e-5 ? d/L : vec2(1.0,0.0); vec2 n = vec2(-dir.y, dir.x);',
    '  float hw = a_width*u_dpr*0.5 + 0.75;',
    '  vec4 c = mix(c0, c1, a_corner.x);',
    '  vec2 off = n*a_corner.y*hw + dir*(a_corner.x*2.0-1.0)*min(hw*0.5, L*0.5);',
    '  c.xy += off/h*c.w;',
    '  gl_Position = c;',
    '  v_color = a_color; v_side = a_corner.y*hw; v_hw = hw; v_world = mix(w0.xyz, w1.xyz, a_corner.x);',
    '}'].join('\n');
  var LINE_FS = [
    'precision mediump float;',
    'uniform float u_clip; uniform vec4 u_plane;',
    'varying vec4 v_color; varying float v_side; varying float v_hw; varying vec3 v_world;',
    'void main(){',
    '  if (u_clip > 0.5 && dot(u_plane.xyz, v_world) + u_plane.w < -0.0005) discard;',
    '  float a = v_color.a*clamp(v_hw-abs(v_side), 0.0, 1.0);',
    '  if (a <= 0.003) discard;',
    '  gl_FragColor = vec4(v_color.rgb, a);',
    '}'].join('\n');

  var POINT_VS = [
    'attribute vec3 a_pos; attribute vec4 a_color; attribute float a_size; attribute float a_shape;',
    'uniform mat4 u_vp; uniform mat4 u_model; uniform float u_dpr;',
    'varying vec4 v_color; varying float v_shape;',
    'void main(){',
    '  gl_Position = u_vp*u_model*vec4(a_pos,1.0);',
    '  gl_PointSize = a_size*u_dpr;',
    '  v_color = a_color; v_shape = a_shape;',
    '}'].join('\n');
  var POINT_FS = [
    'precision mediump float;',
    'varying vec4 v_color; varying float v_shape;',
    'void main(){',
    '  vec2 c = gl_PointCoord*2.0-1.0; c.y = -c.y; float r = length(c);',
    '  vec4 col = v_color;',
    '  if (v_shape < 0.5) {',                       // 0: disc with dark rim
    '    if (r > 1.0) discard;',
    '    float rim = smoothstep(0.62, 0.78, r);',
    '    col.rgb = mix(col.rgb, vec3(0.1,0.1,0.14), rim*0.85);',
    '    col.a *= 1.0 - smoothstep(0.86, 1.0, r);',
    '  } else if (v_shape < 1.5) {',                // 1: sun with soft glow
    '    if (r > 1.0) discard;',
    '    float core = 1.0 - smoothstep(0.30, 0.36, r);',
    '    float glow = pow(1.0 - r, 2.2)*0.75;',
    '    col = vec4(mix(vec3(1.0,0.97,0.88), v_color.rgb, core), max(core, glow)*v_color.a);',
    '  } else if (v_shape > 4.5) {',                // 5: soft round star
    '    if (r > 1.0) discard;',
    '    col.a *= (1.0 - smoothstep(0.35, 1.0, r));',
    '  } else {',                                   // 2,3,4: 4/5/6-point stars
    '    float n = v_shape + 2.0;',
    '    float ang = atan(c.x, c.y);',
    '    float k = pow(abs(cos(ang*n*0.5)), 3.0);',
    '    float edge = mix(0.38, 1.0, k);',
    '    if (r > edge) discard;',
    '    float rim = smoothstep(edge-0.22, edge-0.08, r);',
    '    col.rgb = mix(col.rgb, vec3(0.08,0.08,0.1), rim*0.8);',
    '  }',
    '  gl_FragColor = col;',
    '}'].join('\n');

  var TRI_VS = [
    'attribute vec3 a_pos; attribute vec4 a_color;',
    'uniform mat4 u_vp; uniform mat4 u_model; varying vec4 v_color;',
    'void main(){ gl_Position = u_vp*u_model*vec4(a_pos,1.0); v_color = a_color; }'].join('\n');
  var TRI_FS = [
    'precision mediump float; varying vec4 v_color;',
    'void main(){ gl_FragColor = v_color; }'].join('\n');

  var DISC_VS = [
    'attribute vec3 a_pos; attribute float a_shade; uniform mat4 u_vp; varying vec2 v_xy; varying float v_shade;',
    'void main(){ v_xy = a_pos.xy; v_shade = a_shade; gl_Position = u_vp*vec4(a_pos, 1.0); }'].join('\n');
  var DISC_FS = [
    'precision highp float;',
    'uniform sampler2D u_tex; uniform float u_R; uniform vec3 u_sun; uniform float u_shadow;',
    'varying vec2 v_xy; varying float v_shade;',
    'void main(){',
    '  float r = length(v_xy)/u_R;',
    '  if (r > 1.0) discard;',
    '  vec4 base = texture2D(u_tex, v_xy/u_R*0.5+0.5);',
    '  vec3 col = base.rgb*v_shade;',
    '  if (u_shadow > 0.5) {',
    // inverse azimuthal-equidistant projection: disc point -> point on the real globe
    '    float lat = radians(90.0 - 180.0*r);',
    '    float lon = atan(v_xy.y, v_xy.x);',
    '    vec3 n = vec3(cos(lat)*cos(lon), cos(lat)*sin(lon), sin(lat));',
    '    float s = dot(n, u_sun);',                   // sine of the Sun's elevation there
    '    float night = 1.0 - smoothstep(-0.105, 0.0, s);', // civil twilight band (6 deg)
    '    col = mix(col, col*0.42 + vec3(0.02,0.03,0.09), night);',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'].join('\n');

  /* The globe: a unit sphere scaled by u_R, textured with an equirectangular map,
     lit by the real Sun with a soft twilight band. Earth-fixed frame, z = north. */
  var GLOBE_VS = [
    'attribute vec3 a_pos; attribute vec2 a_uv; uniform mat4 u_vp; uniform float u_R; varying vec3 v_n; varying vec2 v_uv;',
    'void main(){ v_n = a_pos; v_uv = a_uv; gl_Position = u_vp*vec4(a_pos*u_R, 1.0); }'].join('\n');
  var GLOBE_FS = [
    'precision highp float;',
    'uniform sampler2D u_tex; uniform vec3 u_sun; uniform vec3 u_eye; uniform float u_shadow; varying vec3 v_n; varying vec2 v_uv;',
    'void main(){',
    '  vec3 n = normalize(v_n);',
    // texture coordinates come from the mesh: computing them here with atan() jumps
    // from 1 to 0 at the 180° meridian, and the mipmap picks a blurry level along a seam line
    '  vec3 col = texture2D(u_tex, v_uv).rgb;',
    '  float s = dot(n, u_sun);',
    '  float day = u_shadow > 0.5 ? smoothstep(-0.105, 0.02, s) : 1.0;',
    '  vec3 lit = col*(0.62 + 0.38*clamp(s, 0.0, 1.0));',
    '  vec3 night = col*0.30 + vec3(0.015, 0.025, 0.07);',
    '  col = mix(night, lit, day);',
    '  float rim = 1.0 - clamp(dot(n, normalize(u_eye - n)), 0.0, 1.0);',
    '  col += vec3(0.25, 0.45, 0.9)*pow(rim, 3.0)*0.35;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'].join('\n');

  function compile(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var info = { prog: p, a: {}, u: {} };
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var i = 0; i < na; i++) { var a = gl.getActiveAttrib(p, i); info.a[a.name] = gl.getAttribLocation(p, a.name); }
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var j = 0; j < nu; j++) { var u = gl.getActiveUniform(p, j); info.u[u.name] = gl.getUniformLocation(p, u.name); }
    return info;
  }

  /* Growable float buffer. */
  function FBuf(floatsPerItem, initialItems) {
    this.k = floatsPerItem;
    this.data = new Float32Array(floatsPerItem * (initialItems || 256));
    this.n = 0;
  }
  FBuf.prototype.reserve = function (items) {
    var need = (this.n + items) * this.k;
    if (need > this.data.length) {
      var nd = new Float32Array(Math.max(need, this.data.length * 2));
      nd.set(this.data.subarray(0, this.n * this.k));
      this.data = nd;
    }
  };

  /* ---------- LineBatch ---------- */
  var LINE_FLOATS = 11 * 4; // per segment: 4 vertices x (p0 3, p1 3, color 4, width 1)

  function LineBatch(R, opts) {
    this.R = R; opts = opts || {};
    this.buf = new FBuf(LINE_FLOATS, opts.capacity || 512);
    this.vbo = R.gl.createBuffer();
    this.dirty = true;
    this.clip = !!opts.clipGround;
    this.model = null;
    this.visible = true;
  }
  LineBatch.prototype.clear = function () { this.buf.n = 0; this.dirty = true; return this; };
  LineBatch.prototype.seg = function (a, b, c, w) {
    var B = this.buf; B.reserve(1);
    var d = B.data, o = B.n * LINE_FLOATS, wd = w || 1;
    for (var v = 0; v < 4; v++) {
      d[o] = a[0]; d[o + 1] = a[1]; d[o + 2] = a[2];
      d[o + 3] = b[0]; d[o + 4] = b[1]; d[o + 5] = b[2];
      d[o + 6] = c[0]; d[o + 7] = c[1]; d[o + 8] = c[2]; d[o + 9] = c[3];
      d[o + 10] = wd; o += 11;
    }
    B.n++; this.dirty = true;
  };
  LineBatch.prototype.poly = function (pts, c, w, closed) {
    for (var i = 1; i < pts.length; i++) this.seg(pts[i - 1], pts[i], c, w);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0], c, w);
  };
  /* Cubic Bezier with control points p1 and p2 == p3 (the original ray shape). */
  LineBatch.prototype.bezier = function (p0, p1, p3, c, w, steps) {
    steps = steps || 20;
    var prev = p0;
    for (var i = 1; i <= steps; i++) {
      var t = i / steps, u = 1 - t, a = u * u * u, b = 3 * u * u * t, e = 3 * u * t * t + t * t * t;
      var p = [a * p0[0] + b * p1[0] + e * p3[0], a * p0[1] + b * p1[1] + e * p3[1], a * p0[2] + b * p1[2] + e * p3[2]];
      this.seg(prev, p, c, w); prev = p;
    }
  };

  /* ---------- PointBatch ---------- */
  var PT_FLOATS = 9; // pos 3, color 4, size 1, shape 1
  function PointBatch(R) {
    this.R = R; this.buf = new FBuf(PT_FLOATS, 256); this.vbo = R.gl.createBuffer();
    this.dirty = true; this.model = null; this.visible = true;
  }
  PointBatch.prototype.clear = LineBatch.prototype.clear;
  PointBatch.SHAPE = { disc: 0, sun: 1, star4: 2, star5: 3, star6: 4, dot: 5 };
  PointBatch.prototype.add = function (p, c, size, shape) {
    var B = this.buf; B.reserve(1);
    var d = B.data, o = B.n * PT_FLOATS;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2];
    d[o + 3] = c[0]; d[o + 4] = c[1]; d[o + 5] = c[2]; d[o + 6] = c[3];
    d[o + 7] = size; d[o + 8] = PointBatch.SHAPE[shape] || 0;
    B.n++; this.dirty = true;
  };

  /* ---------- TriBatch ---------- */
  var TRI_FLOATS = 7;
  function TriBatch(R) {
    this.R = R; this.buf = new FBuf(TRI_FLOATS, 96); this.vbo = R.gl.createBuffer();
    this.dirty = true; this.model = null; this.visible = true;
  }
  TriBatch.prototype.clear = LineBatch.prototype.clear;
  TriBatch.prototype.tri = function (a, b, c, col) {
    var B = this.buf; B.reserve(3);
    var d = B.data, o = B.n * TRI_FLOATS, P = [a, b, c];
    for (var i = 0; i < 3; i++) {
      d[o] = P[i][0]; d[o + 1] = P[i][1]; d[o + 2] = P[i][2];
      d[o + 3] = col[0]; d[o + 4] = col[1]; d[o + 5] = col[2]; d[o + 6] = col[3]; o += 7;
    }
    B.n += 3; this.dirty = true;
  };
  TriBatch.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };

  /* ---------- Renderer ---------- */
  function Renderer(canvas) {
    var opts = { antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false };
    var gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl; this.canvas = canvas;
    this.isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (!this.isGL2 && !gl.getExtension('OES_element_index_uint')) throw new Error('WebGL index extension missing.');
    this.pLine = compile(gl, LINE_VS, LINE_FS);
    this.pPoint = compile(gl, POINT_VS, POINT_FS);
    this.pTri = compile(gl, TRI_VS, TRI_FS);
    this.pDisc = compile(gl, DISC_VS, DISC_FS);
    this.pGlobe = compile(gl, GLOBE_VS, GLOBE_FS);
    this.identity = FE.M4.identity();
    this.cornerBuf = gl.createBuffer(); this.indexBuf = gl.createBuffer(); this.segCap = 0;
    this.ensureSegCap(4096);
    this.dpr = 1; this.width = 1; this.height = 1;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }
  /* Shared static corner + index buffers for line quads, grown on demand. */
  Renderer.prototype.ensureSegCap = function (n) {
    if (n <= this.segCap) return;
    var cap = Math.max(n, this.segCap * 2), gl = this.gl;
    var corners = new Float32Array(cap * 8), idx = new Uint32Array(cap * 6);
    for (var i = 0; i < cap; i++) {
      corners.set([0, -1, 0, 1, 1, -1, 1, 1], i * 8);
      var b = i * 4; idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf); gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.segCap = cap;
  };
  Renderer.prototype.lines = function (o) { return new LineBatch(this, o); };
  Renderer.prototype.points = function () { return new PointBatch(this); };
  Renderer.prototype.tris = function () { return new TriBatch(this); };

  /* forced = {w, h, scale}: render at a fixed pixel size (video export), with
     line widths and marker sizes scaled as if the view were w/scale CSS pixels wide. */
  Renderer.prototype.resize = function (forced) {
    var dpr = forced ? forced.scale : Math.min(window.devicePixelRatio || 1, 2), c = this.canvas;
    if (!forced && !c.clientWidth) return false;   // hidden: keep the old buffer
    var w = forced ? forced.w : Math.max(1, Math.round(c.clientWidth * dpr));
    var h = forced ? forced.h : Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.dpr = dpr; this.width = w; this.height = h;
    this.gl.viewport(0, 0, w, h);
  };
  Renderer.prototype.begin = function (vp) {
    var gl = this.gl;
    this.vp = vp;
    gl.clearColor(0, 0, 0, 0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };

  function upload(gl, batch, floats) {
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
    if (batch.dirty) {
      gl.bufferData(gl.ARRAY_BUFFER, batch.buf.data.subarray(0, floats), gl.DYNAMIC_DRAW);
      batch.dirty = false;
    }
  }
  function attrib(gl, loc, size, stride, offset) {
    if (loc === undefined || loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
  }
  function disableAll(gl, info) { for (var k in info.a) gl.disableVertexAttribArray(info.a[k]); }

  Renderer.prototype.drawLines = function (b) {
    if (!b.visible || b.buf.n === 0) return;
    var gl = this.gl, P = this.pLine;
    this.ensureSegCap(b.buf.n);
    gl.useProgram(P.prog);
    gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
    gl.uniformMatrix4fv(P.u.u_model, false, b.model || this.identity);
    gl.uniform2f(P.u.u_viewport, this.width, this.height);
    gl.uniform1f(P.u.u_dpr, this.dpr);
    gl.uniform1f(P.u.u_clip, b.clip ? 1 : 0);
    var cp = this.clipPlane || [0, 0, 1, 0];
    gl.uniform4f(P.u.u_plane, cp[0], cp[1], cp[2], cp[3]);
    upload(gl, b, b.buf.n * LINE_FLOATS);
    attrib(gl, P.a.a_p0, 3, 11, 0); attrib(gl, P.a.a_p1, 3, 11, 3);
    attrib(gl, P.a.a_color, 4, 11, 6); attrib(gl, P.a.a_width, 1, 11, 10);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    attrib(gl, P.a.a_corner, 2, 2, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, b.buf.n * 6, gl.UNSIGNED_INT, 0);
    disableAll(gl, P);
  };
  Renderer.prototype.drawPoints = function (b) {
    if (!b.visible || b.buf.n === 0) return;
    var gl = this.gl, P = this.pPoint;
    gl.useProgram(P.prog);
    gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
    gl.uniformMatrix4fv(P.u.u_model, false, b.model || this.identity);
    gl.uniform1f(P.u.u_dpr, this.dpr);
    upload(gl, b, b.buf.n * PT_FLOATS);
    attrib(gl, P.a.a_pos, 3, 9, 0); attrib(gl, P.a.a_color, 4, 9, 3);
    attrib(gl, P.a.a_size, 1, 9, 7); attrib(gl, P.a.a_shape, 1, 9, 8);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, b.buf.n);
    disableAll(gl, P);
  };
  Renderer.prototype.drawTris = function (b, writeDepth) {
    if (!b.visible || b.buf.n === 0) return;
    var gl = this.gl, P = this.pTri;
    gl.useProgram(P.prog);
    gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
    gl.uniformMatrix4fv(P.u.u_model, false, b.model || this.identity);
    upload(gl, b, b.buf.n * TRI_FLOATS);
    attrib(gl, P.a.a_pos, 3, 7, 0); attrib(gl, P.a.a_color, 4, 7, 3);
    gl.depthMask(!!writeDepth);
    gl.drawArrays(gl.TRIANGLES, 0, b.buf.n);
    disableAll(gl, P);
  };

  /* The map disc: its texture, and a polar-grid mesh (rebuilt by discMesh when the
     terrain changes). */
  Renderer.prototype.disc = function (radius, texCanvas) {
    var gl = this.gl;
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    var pot = (texCanvas.width & (texCanvas.width - 1)) === 0;
    if (pot) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pot ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var d = { vbo: gl.createBuffer(), ibo: gl.createBuffer(), tex: tex, n: 0, R: radius, sun: [1, 0, 0], shadow: true };
    this.discMesh(d, null);
    return d;
  };
  /* Rebuilds the disc surface. zAt(lat, lon) gives the height (null = flat). Rings
     every 0.6° of latitude, 540 spokes; an outer skirt closes the rim down to z = 0,
     so a raised rim shows as a wall. Steep faces get darker by a fixed light. */
  Renderer.prototype.discMesh = function (d, zAt) {
    var gl = this.gl, R = d.R, NR = zAt ? 300 : 1, NA = zAt ? 540 : 256, i, j;
    var nv = 1 + NR * NA + NA, v = new Float32Array(nv * 4), Z = new Float32Array(nv);
    var ca = new Float32Array(NA), sa = new Float32Array(NA);
    for (j = 0; j < NA; j++) { var a = j / NA * Math.PI * 2; ca[j] = Math.cos(a); sa[j] = Math.sin(a); }
    function idx(ri, j) { return ri === 0 ? 0 : 1 + (ri - 1) * NA + ((j % NA) + NA) % NA; }
    Z[0] = zAt ? zAt(90, 0) : 0;
    for (i = 1; i <= NR; i++) {
      var lat = 90 - 180 * i / NR;
      for (j = 0; j < NA; j++) Z[idx(i, j)] = zAt ? zAt(lat, j / NA * 360) : 0;
    }
    var L = [-0.42, 0.55, 0.72], dr = R / NR;
    function put(k, x, y, z, sh) { v[k * 4] = x; v[k * 4 + 1] = y; v[k * 4 + 2] = z; v[k * 4 + 3] = sh; }
    put(0, 0, 0, Z[0], 1);
    for (i = 1; i <= NR; i++) {
      var r = R * i / NR * (i === NR ? 1.0005 : 1), dt = 2 * Math.PI * r / NA;
      for (j = 0; j < NA; j++) {
        var k = idx(i, j), sh = 1;
        if (zAt) {
          var zr = (Z[idx(Math.min(NR, i + 1), j)] - Z[idx(i - 1, j)]) / ((Math.min(NR, i + 1) - (i - 1)) * dr);
          var zt = (Z[idx(i, j + 1)] - Z[idx(i, j - 1)]) / (2 * dt);
          var nx = -zr * ca[j] + zt * sa[j], ny = -zr * sa[j] - zt * ca[j], nl = Math.sqrt(nx * nx + ny * ny + 1);
          var lam = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / nl), steep = 1 - 1 / nl;
          sh = 1 + (0.35 + 0.75 * lam - 1) * Math.min(1, steep * 4);
        }
        put(k, r * ca[j], r * sa[j], Z[k], sh);
      }
    }
    // skirt: the rim again at z = 0, just inside so it samples the map colour
    for (j = 0; j < NA; j++) {
      var lit = 0.55 + 0.35 * Math.max(0, ca[j] * L[0] + sa[j] * L[1]);
      put(1 + NR * NA + j, R * 0.9995 * ca[j], R * 0.9995 * sa[j], 0, lit);
      v[idx(NR, j) * 4 + 3] = Math.min(v[idx(NR, j) * 4 + 3], 1);
    }
    var tris = [];
    for (j = 0; j < NA; j++) tris.push(0, idx(1, j), idx(1, j + 1));
    for (i = 1; i < NR; i++) for (j = 0; j < NA; j++) {
      var a0 = idx(i, j), a1 = idx(i, j + 1), b0 = idx(i + 1, j), b1 = idx(i + 1, j + 1);
      tris.push(a0, b0, b1, a0, b1, a1);
    }
    if (zAt) for (j = 0; j < NA; j++) {
      var t0 = idx(NR, j), t1 = idx(NR, j + 1), s0 = 1 + NR * NA + j, s1 = 1 + NR * NA + (j + 1) % NA;
      tris.push(t0, s0, s1, t0, s1, t1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, d.vbo); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(tris), gl.STATIC_DRAW);
    d.n = tris.length;
  };
  Renderer.prototype.drawDisc = function (d) {
    var gl = this.gl, P = this.pDisc;
    gl.useProgram(P.prog);
    gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
    gl.uniform1f(P.u.u_R, d.R);
    gl.uniform3f(P.u.u_sun, d.sun[0], d.sun[1], d.sun[2]);
    gl.uniform1f(P.u.u_shadow, d.shadow ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, d.tex);
    gl.uniform1i(P.u.u_tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, d.vbo);
    attrib(gl, P.a.a_pos, 3, 4, 0);
    attrib(gl, P.a.a_shade, 1, 4, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ibo);
    gl.depthMask(true);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 2);
    gl.drawElements(gl.TRIANGLES, d.n, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    disableAll(gl, P);
  };

  /* Globe mesh (a lat/lon grid of triangles on the unit sphere) and its texture. */
  Renderer.prototype.globe = function (radius, texCanvas) {
    var gl = this.gl, nLat = 64, nLon = 128, v = [];
    function P(i, j) { var la = -Math.PI / 2 + Math.PI * i / nLat, lo = -Math.PI + 2 * Math.PI * j / nLon; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la), j / nLon, i / nLat]; }
    for (var i = 0; i < nLat; i++) for (var j = 0; j < nLon; j++) {
      var a = P(i, j), b = P(i, j + 1), c = P(i + 1, j + 1), d = P(i + 1, j);
      v.push.apply(v, a.concat(b, c, a, c, d));
    }
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { vbo: vbo, tex: tex, n: v.length / 5, R: radius, sun: [1, 0, 0], eye: [0, 0, 1], shadow: true };
  };
  Renderer.prototype.drawGlobe = function (g) {
    var gl = this.gl, P = this.pGlobe;
    gl.useProgram(P.prog);
    gl.uniformMatrix4fv(P.u.u_vp, false, this.vp);
    gl.uniform1f(P.u.u_R, g.R);
    gl.uniform3f(P.u.u_sun, g.sun[0], g.sun[1], g.sun[2]);
    gl.uniform3f(P.u.u_eye, g.eye[0], g.eye[1], g.eye[2]);
    gl.uniform1f(P.u.u_shadow, g.shadow ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.uniform1i(P.u.u_tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
    attrib(gl, P.a.a_pos, 3, 5, 0);
    attrib(gl, P.a.a_uv, 2, 5, 3);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 2);
    gl.drawArrays(gl.TRIANGLES, 0, g.n);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.CULL_FACE);
    disableAll(gl, P);
  };

  FE.Renderer = Renderer;
  FE.PointBatch = PointBatch;
})();
