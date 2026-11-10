/* tween.js — declarative timelines for the demo scripts.
 *
 * A timeline is a tree of nodes:
 *   leaf:     { prop, to, span, delay, ease }   // tween one model property
 *             { span, delay }                  // a pause (no prop)
 *   serial:   { serial: [nodes], delay }
 *   parallel: { parallel: [nodes], delay }
 *
 * compile() flattens the tree into leaves with absolute start/end times (ms), sorted
 * by start. A leaf captures its start value when it begins, so serial tweens on the
 * same property chain correctly. Running to t = Infinity yields the exact end state,
 * which the demo player uses to derive every keyframe automatically instead of
 * keeping hand-written state snapshots that can drift out of sync. */
var FE = window.FE = window.FE || {};

(function () {
  var EASE = {
    cosine: function (f) { return (1 - Math.cos(Math.PI * f)) / 2; },
    linear: function (f) { return f; }
  };

  function compile(root) {
    var leaves = [], seq = 0;
    function walk(node, start) {
      var t0 = start + (node.delay || 0);
      if (node.serial) {
        var t = t0;
        for (var i = 0; i < node.serial.length; i++) t = walk(node.serial[i], t);
        return t;
      }
      if (node.parallel) {
        var end = t0;
        for (var j = 0; j < node.parallel.length; j++) end = Math.max(end, walk(node.parallel[j], t0));
        return end;
      }
      var span = node.span || 0;
      leaves.push({ prop: node.prop, to: node.to, start: t0, end: t0 + span, span: span,
                    ease: EASE[node.ease || 'cosine'], seq: seq++ });
      return t0 + span;
    }
    var duration = walk(root, 0);
    leaves.sort(function (a, b) { return a.start - b.start || a.seq - b.seq; });
    return { leaves: leaves, duration: duration };
  }

  /* A running instance of a compiled timeline against a model with get/set. */
  function Run(compiled, model) {
    this.c = compiled;
    this.model = model;
    this.state = compiled.leaves.map(function () { return { begun: false, done: false, from: 0 }; });
    this.t = 0;
  }
  Run.prototype.seek = function (t) {
    this.t = t;
    var L = this.c.leaves, S = this.state, m = this.model;
    for (var i = 0; i < L.length; i++) {
      var leaf = L[i], st = S[i];
      if (leaf.start > t) break;           // sorted by start: nothing later has begun
      if (st.done) continue;
      if (!leaf.prop) { if (t >= leaf.end) st.done = true; continue; }
      if (!st.begun) { st.begun = true; st.from = m.get(leaf.prop); }
      var f = leaf.span > 0 ? Math.min(1, (t - leaf.start) / leaf.span) : 1;
      if (typeof leaf.to === 'number' && typeof st.from === 'number') {
        m.set(leaf.prop, st.from + (leaf.to - st.from) * leaf.ease(f));
      } else if (f >= 1) {
        m.set(leaf.prop, leaf.to);       // strings, booleans, objects switch at the end
      }
      if (f >= 1) st.done = true;
    }
    return t >= this.c.duration;
  };

  FE.Timeline = { compile: compile, Run: Run, EASE: EASE };
})();
