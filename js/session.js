/* LUDUS — sessions de jeu : contre l'IA, même écran, hôte en ligne, invité en ligne */
(function (root) {
  'use strict';
  const L = root.Ludus, AI = root.LudusAI;

  // Contrôleur « humain » : la réponse arrive depuis l'interface (ou depuis le réseau pour un adversaire distant)
  class HumanController {
    constructor() { this.pending = null; }
    decide(prompt) { return new Promise(res => { this.pending = { id: prompt.id, res }; }); }
    answer(id, value) { if (this.pending && this.pending.id === id) { const r = this.pending.res; this.pending = null; r(value); return true; } return false; }
    cancel() { if (this.pending) { const r = this.pending.res; this.pending = null; r(undefined); } }
  }

  class AIController {
    constructor(seat, ai, getSpeed) { this.seat = seat; this.ai = ai; this.getSpeed = getSpeed; this.timer = null; }
    delayFor(p) {
      if (p.kind === 'ack') return 250;
      if (p.kind === 'choice' && (p.mode === 'prep' || p.mode === 'place')) return 800;
      if (p.kind === 'choice' && p.mode === 'toss') return 600;
      return 650;
    }
    decide(prompt, game) {
      const sp = this.getSpeed() || 1;
      return new Promise(res => {
        this.timer = setTimeout(() => {
          this.timer = null;
          try { res(this.ai.decide(game.viewFor(this.seat), prompt)); } catch (e) { console.error('IA', e); res(undefined); }
        }, this.delayFor(prompt) / sp);
      });
    }
    cancel() { if (this.timer) clearTimeout(this.timer); }
  }

  class Emitter {
    constructor() { this.fns = new Set(); this._queued = false; }
    onChange(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
    notify() {
      if (this._queued) return;
      this._queued = true;
      setTimeout(() => { this._queued = false; for (const f of this.fns) { try { f(); } catch (e) { console.error(e); } } }, 16);
    }
  }

  // ---------------- Session locale : IA, deux joueurs sur le même écran, hôte d'une partie en ligne ----------------
  class LocalSession extends Emitter {
    constructor(o) {
      super();
      this.mode = o.mode;                         // 'ai' | 'hotseat' | 'host'
      this.speed = o.speed || 1;
      this.names = o.names; this.colors = o.colors;
      this.gameCfg = { tutorial: !!o.tutorial, advanced: o.advanced, variantEmperor: o.variant, names: o.names, colors: o.colors };
      this.humans = [new HumanController(), new HumanController()];
      // l'IA a son propre hasard (indépendant de celui de la partie) : indispensable pour pouvoir rejouer une partie à l'identique
      this.live = o.mode === 'ai' ? [this.humans[0], new AIController(1, AI.create(o.level || 'normal'), () => this.speed)] : this.humans;
      this.game = new L.Game(Object.assign({ speed: this.speed }, this.gameCfg));
      this.game.ctrl = this.live;
      this.active = 0; this.passTo = null;
      this.finished = false; this.conn = null; this.connLost = false;
      this.undoReq = null; this.undoStamp = 0; this._undoId = 0;
      this.bindGame();
    }
    bindGame() { this.game.subscribe(() => { this.notify(); this.queueSend(); }); }
    start() { this.startRun(this.game); }
    startRun(g) {
      g.run().then(() => { if (this.game !== g) return; this.finished = true; this.notify(); this.queueSend(); }).catch(e => { if (this.game !== g) return; console.error(e); this.error = e; this.notify(); });
    }

    // ---------- annuler le coup précédent ----------
    lastOwnIndex(seat) {
      const h = this.game.history;
      for (let i = h.length - 1; i >= 0; i--) if (h[i].seat === seat && h[i].kind !== 'ack' && h[i].mode !== 'toss') return i;
      return -1;
    }
    canUndo(seat) { return !this.gameCfg.tutorial && !this.finished && !this.game.s.over && !this.undoReq && this.lastOwnIndex(seat) >= 0; }
    // demande d'annulation faite par « seat » ; l'adversaire doit accepter (l'ordinateur accepte toujours)
    requestUndo(seat) {
      if (!this.canUndo(seat)) return;
      const to = 1 - seat;
      if (this.mode === 'ai') { this.doUndo(seat); return; }
      this.undoReq = { id: ++this._undoId, from: seat, to, status: 'pending' };
      this.notify(); this.queueSend();
    }
    answerUndo(ok) {
      const r = this.undoReq; if (!r || r.status !== 'pending') return;
      if (ok) { this.undoReq = null; this.doUndo(r.from); return; }
      r.status = 'refused'; this.notify(); this.queueSend();
      setTimeout(() => { if (this.undoReq === r) { this.undoReq = null; this.notify(); this.queueSend(); } }, 4000);
    }
    doUndo(seat) {
      const idx = this.lastOwnIndex(seat);
      if (idx < 0) return;
      const keep = this.game.history.slice(0, idx);
      const old = this.game;
      const g = new L.Game(Object.assign({ speed: 0, seed: old.seed }, this.gameCfg));
      const queues = [[], []]; keep.forEach(h => queues[h.seat].push(h.value));
      let announced = false;
      g.ctrl = [0, 1].map(seat_ => ({
        decide: (prompt, game) => {
          if (queues[seat_].length) return Promise.resolve(queues[seat_].shift());
          game.cfg.speed = this.speed;              // le rejeu est terminé : on reprend en direct
          if (!announced) { announced = true; game.say(`↩ ${game.s.players[seat].name} annule son dernier coup.`); }
          return this.live[seat_].decide(prompt, game);
        },
        cancel: () => { if (this.live[seat_].cancel) this.live[seat_].cancel(); },
      }));
      this.game = g;
      try { old.abort(); } catch (e) { /* ignore */ }
      this.humans.forEach(h => h.cancel());
      this.bindGame();
      this.undoStamp++;
      this.startRun(g);
      if (root.LudusSfx) root.LudusSfx.reset();
      this.notify(); this.queueSend();
    }
    decorate(v, seat) { v.undo = this.undoReq ? Object.assign({}, this.undoReq) : null; v.canUndo = this.canUndo(seat); v.undoStamp = this.undoStamp; return v; }
    stop() { try { this.game.abort(); } catch (e) { /* ignore */ } if (this.conn) { try { this.conn.close(); } catch (e) { /* ignore */ } } }
    needsPass() {
      if (this.mode !== 'hotseat') return null;
      const pend = [0, 1].filter(i => this.game.s.prompts[i]);
      if (pend.length && !pend.includes(this.active)) return pend[0];
      return null;
    }
    confirmPass() { const t = this.needsPass(); if (t != null) { this.active = t; this.notify(); } }
    viewSeat() { return this.mode === 'hotseat' ? this.active : 0; }
    getView() { const s = this.viewSeat(); return this.decorate(this.game.viewFor(s), s); }
    answer(promptId, value) {
      for (const seat of [0, 1]) {
        const p = this.game.s.prompts[seat];
        if (p && p.id === promptId) { this.humans[seat].answer(promptId, value); return; }
      }
    }
    // --- partie en ligne (hôte) ---
    attach(conn) {
      this.conn = conn; this.connLost = false;
      conn.on('data', msg => {
        if (!msg) return;
        if (msg.t === 'answer') this.humans[1].answer(msg.id, msg.value);
        else if (msg.t === 'undo-request') this.requestUndo(1);
        else if (msg.t === 'undo-answer' && this.undoReq && this.undoReq.to === 1) this.answerUndo(!!msg.ok);
      });
      conn.on('close', () => { if (this.conn === conn) { this.connLost = true; this.notify(); } });
      conn.on('error', () => { if (this.conn === conn) { this.connLost = true; this.notify(); } });
      this.sendView();
      this.notify();
    }
    queueSend() { if (this.mode !== 'host' || !this.conn || this._sendQ) return; this._sendQ = setTimeout(() => { this._sendQ = null; this.sendView(); }, 40); }
    sendView() { if (this.mode === 'host' && this.conn && this.conn.open) { try { this.conn.send({ t: 'view', view: this.decorate(this.game.viewFor(1), 1) }); } catch (e) { console.error(e); } } }
  }

  // ---------------- Session invitée : on ne fait qu'afficher la vue envoyée par l'hôte ----------------
  class GuestSession extends Emitter {
    constructor(conn) {
      super();
      this.mode = 'guest'; this.conn = conn; this.view = null; this.connLost = false; this.finished = false;
      conn.on('data', msg => { if (msg && msg.t === 'view') { this.view = msg.view; if (msg.view.over) this.finished = true; this.notify(); } });
      conn.on('close', () => { this.connLost = true; this.notify(); });
      conn.on('error', () => { this.connLost = true; this.notify(); });
    }
    start() { /* l'hôte pilote la partie */ }
    stop() { try { this.conn.close(); } catch (e) { /* ignore */ } }
    needsPass() { return null; }
    getView() { return this.view; }
    answer(promptId, value) { if (this.conn.open) this.conn.send({ t: 'answer', id: promptId, value }); }
    requestUndo() { if (this.conn.open) this.conn.send({ t: 'undo-request' }); }
    answerUndo(ok) { if (this.conn.open) this.conn.send({ t: 'undo-answer', ok }); }
  }

  // ---------------- Réseau (PeerJS : WebRTC pair à pair) ----------------
  const Net = {
    available() { return typeof root.Peer === 'function'; },
    code() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; },
    // Crée une salle : cb.onCode(code), cb.onGuest(conn), cb.onError(msg)
    host(cb) {
      let tries = 0, peer = null;
      const open = () => {
        const code = Net.code();
        peer = new root.Peer('ludus-' + code, { debug: 0 });
        peer.on('open', () => cb.onCode(code, peer));
        peer.on('connection', conn => cb.onGuest(conn));
        peer.on('error', e => {
          if (e.type === 'unavailable-id' && tries++ < 5) { try { peer.destroy(); } catch (x) { /* ignore */ } open(); return; }
          cb.onError(Net.explain(e));
        });
        peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
      };
      open();
      return { destroy() { try { peer.destroy(); } catch (e) { /* ignore */ } } };
    },
    join(code, cb) {
      const peer = new root.Peer({ debug: 0 });
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; cb.onError('Impossible de joindre cette partie (délai dépassé). Vérifiez le code et votre connexion.'); try { peer.destroy(); } catch (e) { /* ignore */ } } }, 15000);
      peer.on('open', () => {
        const conn = peer.connect('ludus-' + code.trim().toUpperCase(), { reliable: true });
        conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); cb.onOpen(conn, peer); });
        conn.on('error', e => { if (!done) { done = true; clearTimeout(timer); cb.onError(Net.explain(e)); } });
      });
      peer.on('error', e => { if (!done) { done = true; clearTimeout(timer); cb.onError(Net.explain(e)); } });
      return { destroy() { clearTimeout(timer); try { peer.destroy(); } catch (e) { /* ignore */ } } };
    },
    explain(e) {
      const t = e && e.type;
      if (t === 'peer-unavailable') return 'Aucune partie trouvée avec ce code. Vérifiez-le et que votre ami a bien créé la partie.';
      if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Impossible de contacter le serveur de mise en relation. Vérifiez votre connexion Internet.';
      if (t === 'browser-incompatible') return 'Ce navigateur ne gère pas les connexions en ligne.';
      return 'Erreur de connexion' + (t ? ' (' + t + ')' : '') + '.';
    },
  };

  root.LudusSession = { LocalSession, GuestSession, Net, HumanController, AIController };
})(typeof window !== 'undefined' ? window : globalThis);
