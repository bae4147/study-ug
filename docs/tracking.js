/* study-ug — observational data recorder.
 *
 * Two kinds of data come out of a reading session:
 *
 *   points    a thing happened at an instant (tab clicked, audio seeked)
 *   intervals a state held for a span of time (window was deactivated for 42s)
 *
 * Intervals are recorded as *closed* records with an explicit start and end, so
 * an analyst never has to reconstruct them by pairing up start/stop point
 * events. Three interval streams run at once, and each one is a complete
 * partition of the time it covers:
 *
 *   window   activated | deactivated        covers the whole session
 *   reading  on | paused                    covers the whole session
 *   panel    reading | ai | none            covers only (activated AND on)
 *
 * The panel stream is gated: it is suspended whenever the window is deactivated
 * or reading is paused, and resumes in whatever state it was in before. That
 * gating is what makes the three streams line up into one timeline.
 *
 * Durability. study2 lost data three ways, and each is closed here:
 *   1. it filtered events against a whitelist before saving, silently dropping
 *      every type nobody remembered to add -- here nothing is filtered;
 *   2. it read the whole event array, appended, and wrote it back, which loses
 *      concurrent writes and dies at the 1MB document ceiling -- here batches
 *      are immutable append-only documents that are never read back;
 *   3. it only flushed every 20 events, so the tail of every session died with
 *      the tab -- here pagehide fires a sendBeacon that survives the close.
 */
(function (global) {
  'use strict';

  // Standalone in this project (no shared config module): the two knobs the
  // recorder needs are inlined here.
  const CFG = {
    FLUSH_EVERY_EVENTS: 25,
    FLUSH_EVERY_MS: 10000,
    FUNCTIONS_BASE: 'https://us-central1-study-ug-osu.cloudfunctions.net'
  };

  function newId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function Tracker(options) {
    this.write = options.write;   // (path, body) => Promise
    this.uid = options.uid;
    this.sessionId = options.sessionId;
    this.topic = options.topic;
    this.condition = options.condition;
    // Opaque per-session token minted by assignTopic. The pagehide beacon
    // cannot carry an Authorization header, so it proves itself with this.
    this.beaconToken = options.beaconToken || null;

    this.seq = 0;              // monotonic, orders everything within a session
    this.batchSeq = 0;
    this.pointBuffer = [];
    this.intervalBuffer = [];
    this.flushing = false;
    this.sessionStart = null;
    this.sessionEnd = null;

    // open interval per stream: { state, start }
    this.open = { window: null, reading: null, panel: null };
    // panel state remembered across gate closures
    this.panelDesired = 'none';
    this.gateOpen = false;

    this._boundFlush = this._onPageHide.bind(this);
    this._timer = null;
  }

  // ---- low level -----------------------------------------------------------

  Tracker.prototype._now = function () { return Date.now(); };

  Tracker.prototype.point = function (type, payload) {
    const t = this._now();
    this.seq += 1;
    const ev = Object.assign({
      seq: this.seq,
      t: t,
      sinceStart: this.sessionStart ? t - this.sessionStart : 0,
      type: type
    }, payload || {});
    this.pointBuffer.push(ev);
    if (this.pointBuffer.length + this.intervalBuffer.length >= CFG.FLUSH_EVERY_EVENTS) {
      this.flush();
    }
    return ev;
  };

  Tracker.prototype._closeInterval = function (stream, at) {
    const cur = this.open[stream];
    if (!cur) return;
    this.seq += 1;
    const rec = {
      seq: this.seq,
      stream: stream,
      state: cur.state,
      start: cur.start,
      end: at,
      duration: at - cur.start,
      startSinceStart: this.sessionStart ? cur.start - this.sessionStart : 0
    };
    if (stream === 'window' && cur.state === 'deactivated') {
      rec.documentHidden = cur.documentHidden;
    }
    this.intervalBuffer.push(rec);
    this.open[stream] = null;
  };

  Tracker.prototype._openInterval = function (stream, state, at) {
    this.open[stream] = { state: state, start: at };
    if (stream === 'window' && state === 'deactivated') {
      this.open[stream].documentHidden = !!document.hidden;
    }
  };

  // Returns true only when the state actually changed. Browsers fire blur and
  // visibilitychange for the same act of switching away, so without this the
  // recorder would emit two point events for one transition.
  Tracker.prototype._transition = function (stream, state, at) {
    const cur = this.open[stream];
    if (cur && cur.state === state) return false;   // already there, keep the span intact
    this._closeInterval(stream, at);
    this._openInterval(stream, state, at);
    return true;
  };

  // The panel stream only runs while the window is activated AND reading is on.
  Tracker.prototype._syncGate = function (at) {
    const shouldBeOpen =
      !!this.open.window && this.open.window.state === 'activated' &&
      !!this.open.reading && this.open.reading.state === 'on';

    if (shouldBeOpen && !this.gateOpen) {
      this.gateOpen = true;
      this._openInterval('panel', this.panelDesired, at);
    } else if (!shouldBeOpen && this.gateOpen) {
      this.gateOpen = false;
      this._closeInterval('panel', at);
    }
  };

  // ---- session lifecycle ---------------------------------------------------

  Tracker.prototype.startSession = function () {
    const t = this._now();
    this.sessionStart = t;
    this._openInterval('window', document.hidden ? 'deactivated' : 'activated', t);
    this._openInterval('reading', 'on', t);
    this.panelDesired = 'none';
    this._syncGate(t);
    this.point('reading_start', { topic: this.topic, condition: this.condition });
    this._attach();
    return t;
  };

  Tracker.prototype.endSession = function (reason) {
    const t = this._now();
    this.sessionEnd = t;
    this.point('reading_end', { reason: reason || 'finished' });
    this.gateOpen = false;
    this._closeInterval('panel', t);
    this._closeInterval('reading', t);
    this._closeInterval('window', t);
    this._detach();
    return this.flush(true);
  };

  // ---- the three streams ---------------------------------------------------

  /* `cause` separates two things that both look like "went away" but mean
   * different things to an analyst:
   *
   *   hidden  document.hidden is true -- another tab, a minimised window, a
   *           locked screen, or a backgrounded mobile app. The page is not on
   *           screen at all.
   *   blur    the page lost keyboard focus but is still painted -- another
   *           application in the foreground, or a second window side by side.
   *           The participant may well still be looking at the article.
   *
   * Without this the two are indistinguishable, and treating a side-by-side
   * window as "left the study" would be wrong.
   */
  Tracker.prototype.setWindowActive = function (active, cause) {
    const t = this._now();
    const changed = this._transition('window', active ? 'activated' : 'deactivated', t);
    if (!changed) return;
    this._syncGate(t);
    this.point(active ? 'window_activated' : 'window_deactivated', {
      cause: cause || null,
      documentHidden: !!document.hidden
    });
  };

  Tracker.prototype.setPaused = function (paused) {
    const t = this._now();
    const changed = this._transition('reading', paused ? 'paused' : 'on', t);
    if (!changed) return;
    this._syncGate(t);
    this.point(paused ? 'reading_paused' : 'reading_resumed', {});
  };

  Tracker.prototype.setPanelFocus = function (which) {
    // which: 'reading' | 'ai' | 'none'
    const t = this._now();
    if (this.panelDesired === which && this.gateOpen) return;
    this.panelDesired = which;
    if (this.gateOpen) {
      this._transition('panel', which, t);
      // No point event here: study2's focus_switch already records the switch
      // with its target and dwell time; the panel interval stream holds the span.
    }
  };

  // ---- convenience wrappers for the named requirements ---------------------

  Tracker.prototype.tabClick = function (from, to) {
    this.point('tab_click', { from: from, to: to });
  };

  Tracker.prototype.media = function (kind, action, detail) {
    // kind: 'audio' | 'video'; action: 'play' | 'pause' | 'seek' | 'ended'
    this.point(kind + '_' + action, detail || {});
  };

  Tracker.prototype.chat = function (action, detail) {
    this.point('chat_' + action, detail || {});
  };

  // ---- persistence ---------------------------------------------------------

  Tracker.prototype._sessionPath = function () {
    return 'users/' + this.uid + '/sessions/' + this.sessionId;
  };

  Tracker.prototype.flush = function (isFinal) {
    const points = this.pointBuffer;
    const intervals = this.intervalBuffer;
    if (!points.length && !intervals.length) return Promise.resolve(true);
    if (this.flushing && !isFinal) return Promise.resolve(false);

    this.pointBuffer = [];
    this.intervalBuffer = [];
    this.flushing = true;
    this.batchSeq += 1;

    const batchId = String(this.batchSeq).padStart(5, '0') + '-' + newId().slice(0, 8);
    const body = {
      batchSeq: this.batchSeq,
      writtenAt: Date.now(),
      final: !!isFinal,
      topic: this.topic,
      condition: this.condition,
      points: points,
      intervals: intervals
    };

    const self = this;
    return this.write(this._sessionPath() + '/eventBatches/' + batchId, body)
      .then(function () {
        self.flushing = false;
        return true;
      })
      .catch(function (err) {
        // Put the records back so the next flush (or the beacon) retries them.
        console.error('[tracking] flush failed, re-queueing', err);
        self.pointBuffer = points.concat(self.pointBuffer);
        self.intervalBuffer = intervals.concat(self.intervalBuffer);
        self.flushing = false;
        return false;
      });
  };

  // A Firestore write started in pagehide will not finish. sendBeacon will:
  // the browser hands the payload to the network stack and lets the page die.
  Tracker.prototype._onPageHide = function () {
    const t = this._now();
    // Snapshot the still-open intervals so the timeline is closed even here.
    const snapshot = [];
    const self = this;
    ['window', 'reading', 'panel'].forEach(function (stream) {
      const cur = self.open[stream];
      if (!cur) return;
      snapshot.push({
        seq: ++self.seq,
        stream: stream,
        state: cur.state,
        start: cur.start,
        end: t,
        duration: t - cur.start,
        truncatedByUnload: true,
        startSinceStart: self.sessionStart ? cur.start - self.sessionStart : 0
      });
    });

    this.seq += 1;
    const points = this.pointBuffer.concat([{
      seq: this.seq,
      t: t,
      sinceStart: this.sessionStart ? t - this.sessionStart : 0,
      type: 'window_closed_during_reading'
    }]);

    const payload = JSON.stringify({
      uid: this.uid,
      sessionId: this.sessionId,
      beaconToken: this.beaconToken,
      topic: this.topic,
      condition: this.condition,
      batchSeq: this.batchSeq + 1,
      points: points,
      intervals: this.intervalBuffer.concat(snapshot)
    });

    try {
      navigator.sendBeacon(
        CFG.FUNCTIONS_BASE + '/ingestEvents',
        new Blob([payload], { type: 'application/json' })
      );
    } catch (e) {
      /* nothing left to try at this point */
    }
  };

  Tracker.prototype._attach = function () {
    const self = this;

    this._onVisibility = function () {
      self.setWindowActive(!document.hidden, 'visibilitychange');
    };
    this._onBlur = function () { self.setWindowActive(false, 'blur'); };
    this._onFocus = function () { self.setWindowActive(true, 'focus'); };

    document.addEventListener('visibilitychange', this._onVisibility);
    global.addEventListener('blur', this._onBlur);
    global.addEventListener('focus', this._onFocus);
    global.addEventListener('pagehide', this._boundFlush);

    this._timer = setInterval(function () { self.flush(); }, CFG.FLUSH_EVERY_MS);
  };

  Tracker.prototype._detach = function () {
    document.removeEventListener('visibilitychange', this._onVisibility);
    global.removeEventListener('blur', this._onBlur);
    global.removeEventListener('focus', this._onFocus);
    global.removeEventListener('pagehide', this._boundFlush);
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  };

  global.Tracker = Tracker;
  global.newTrackingId = newId;
})(window);
