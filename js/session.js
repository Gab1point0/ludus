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
      if (p.kind === 'choice' && (p.mode === 'prep' || p.mode === 'place')) return 1000;
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
      this.game = new L.Game({ advanced: o.advanced, variantEmperor: o.variant, names: o.names, colors: o.colors, speed: this.speed });
      this.humans = [new HumanController(), new HumanController()];
      this.seats = o.mode === 'ai' ? [this.humans[0], new AIController(1, AI.create(o.level || 'normal', this.game.rand.bind(this.game)), () => this.speed)] : this.humans;
      this.game.ctrl = this.seats;
      this.active = 0; this.passTo = null;
      this.finished = false; this.conn = null; this.connLost = false;
      this.game.subscribe(() => { this.notify(); this.queueSend(); });
    }
    start() {
      this.game.run().then(() => { this.finished = true; this.notify(); this.queueSend(); }).catch(e => { console.error(e); this.error = e; this.notify(); });
    }
    stop() { try { this.game.abort(); } catch (e) { /* ignore */ } if (this.conn) { try { this.conn.close(); } catch (e) { /* ignore */ } } }
    needsPass() {
      if (this.mode !== 'hotseat') return null;
      const pend = [0, 1].filter(i => this.game.s.prompts[i]);
      if (pend.length && !pend.includes(this.active)) return pend[0];
      return null;
    }
    confirmPass() { const t = this.needsPass(); if (t != null) { this.active = t; this.notify(); } }
    viewSeat() { return this.mode === 'hotseat' ? this.active : 0; }
    getView() { return this.game.viewFor(this.viewSeat()); }
    answer(promptId, value) {
      for (const seat of [0, 1]) {
        const p = this.game.s.prompts[seat];
        if (p && p.id === promptId) { this.humans[seat].answer(promptId, value); return; }
      }
    }
    // --- partie en ligne (hôte) ---
    attach(conn) {
      this.conn = conn; this.connLost = false;
      conn.on('data', msg => { if (msg && msg.t === 'answer') this.humans[1].answer(msg.id, msg.value); });
      conn.on('close', () => { if (this.conn === conn) { this.connLost = true; this.notify(); } });
      conn.on('error', () => { if (this.conn === conn) { this.connLost = true; this.notify(); } });
      this.sendView();
      this.notify();
    }
    queueSend() { if (this.mode !== 'host' || !this.conn || this._sendQ) return; this._sendQ = setTimeout(() => { this._sendQ = null; this.sendView(); }, 40); }
    sendView() { if (this.mode === 'host' && this.conn && this.conn.open) { try { this.conn.send({ t: 'view', view: this.game.viewFor(1) }); } catch (e) { console.error(e); } } }
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
