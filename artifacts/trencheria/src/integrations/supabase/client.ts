/**
 * Supabase compatibility shim.
 * All calls are proxied through the Replit api-server (credentials stay server-side).
 *
 * API:
 *   supabase.rpc(name, params)        → POST /api/rpc/:name  { ...params }
 *   supabase.functions.invoke(name)   → POST /api/functions/:name  { body }
 *   supabase.channel(name, config)    → WebSocket relay at /api/ws/realtime
 *   supabase.removeChannel(ch)        → closes the WS channel
 *
 * The channel shim supports:
 *   .on("broadcast", ...)
 *   .on("presence",  ...)
 *   .on("postgres_changes", ...)   — relayed via server-side Supabase Realtime
 */

const API_BASE = "/api";
const WS_URL = (() => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${API_BASE}/ws/realtime`;
})();

// ---------- RPC ----------

async function rpc(procedure: string, params: Record<string, unknown> = {}) {
  try {
    const res = await fetch(`${API_BASE}/rpc/${procedure}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      return { data: null, error: { message: json.error ?? "RPC failed", code: json.code } };
    }
    return { data: json.data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message ?? "Network error" } };
  }
}

// ---------- Edge Functions ----------

const functions = {
  invoke: async (name: string, options?: { body?: unknown }) => {
    try {
      const res = await fetch(`${API_BASE}/functions/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: options?.body }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        return { data: null, error: { message: json.error ?? "Function failed" } };
      }
      return { data: json.data, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message ?? "Network error" } };
    }
  },
};

// ---------- Realtime ----------

type PresenceState = Record<string, object[]>;
type PresenceEvent = "sync" | "join" | "leave";

interface BroadcastHandler { event: string; cb: (payload: any) => void; }
interface PresenceHandler  { event: PresenceEvent; cb: (payload: any) => void; }
interface PostgresHandler  { table: string; event: string; cb: (payload: any) => void; }

interface PostgresFilter {
  event?: string;
  schema?: string;
  table: string;
}

class Channel {
  private ws: WebSocket | null = null;
  private broadcastHandlers: BroadcastHandler[] = [];
  private presenceHandlers: PresenceHandler[] = [];
  private postgresHandlers: PostgresHandler[] = [];
  private _presenceState: PresenceState = {};
  private statusCb: ((status: string) => void) | null = null;
  private connected = false;
  private pendingTrack: object | null = null;

  constructor(
    public readonly name: string,
    private readonly config: object,
  ) {}

  on(type: "broadcast", filter: { event: string }, cb: (payload: any) => void): this;
  on(type: "presence", filter: { event: PresenceEvent }, cb: (payload: any) => void): this;
  on(type: "postgres_changes", filter: PostgresFilter, cb: (payload: any) => void): this;
  on(type: string, filter: any, cb: (payload: any) => void): this {
    if (type === "broadcast") {
      this.broadcastHandlers.push({ event: filter.event, cb });
    } else if (type === "presence") {
      this.presenceHandlers.push({ event: filter.event as PresenceEvent, cb });
    } else if (type === "postgres_changes") {
      this.postgresHandlers.push({ table: filter.table, event: filter.event ?? "*", cb });
    }
    return this;
  }

  subscribe(cb?: (status: string) => void): this {
    this.statusCb = cb ?? null;

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      // Tell the server which channel to subscribe, including any postgres_changes filters
      const postgresChanges = this.postgresHandlers.map((h) => ({
        table: h.table,
        event: h.event,
        schema: "public",
      }));

      ws.send(JSON.stringify({
        type: "subscribe",
        channel: this.name,
        config: this.config,
        postgresChanges: postgresChanges.length > 0 ? postgresChanges : undefined,
      }));

      this.connected = true;
      if (this.pendingTrack) {
        ws.send(JSON.stringify({ type: "presence_track", payload: this.pendingTrack }));
        this.pendingTrack = null;
      }
    };

    ws.onmessage = (evt) => {
      let msg: any;
      try { msg = JSON.parse(evt.data as string); } catch { return; }

      if (msg.type === "status") {
        this.statusCb?.(msg.status === "SUBSCRIBED" ? "SUBSCRIBED" : msg.status);
      } else if (msg.type === "broadcast") {
        for (const h of this.broadcastHandlers) {
          if (h.event === "*" || h.event === msg.event) {
            h.cb({ event: msg.event, payload: msg.payload });
          }
        }
      } else if (msg.type === "presence_sync") {
        this._presenceState = msg.state ?? {};
        for (const h of this.presenceHandlers) {
          if (h.event === "sync") h.cb({});
        }
      } else if (msg.type === "presence_join") {
        for (const h of this.presenceHandlers) {
          if (h.event === "join") h.cb({ key: msg.key, newPresences: msg.newPresences });
        }
      } else if (msg.type === "presence_leave") {
        for (const h of this.presenceHandlers) {
          if (h.event === "leave") h.cb({ key: msg.key, leftPresences: msg.leftPresences });
        }
      } else if (msg.type === "postgres_changes") {
        for (const h of this.postgresHandlers) {
          if (h.table === msg.table || h.table === "*") {
            h.cb(msg.payload);
          }
        }
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.statusCb?.("CLOSED");
    };

    ws.onerror = () => {
      this.statusCb?.("CHANNEL_ERROR");
    };

    return this;
  }

  presenceState(): PresenceState {
    return this._presenceState;
  }

  track(payload: object): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify({ type: "presence_track", payload }));
    } else {
      this.pendingTrack = payload;
    }
  }

  untrack(): void {
    this.ws?.send(JSON.stringify({ type: "presence_untrack" }));
  }

  send(msg: { type: string; event: string; payload: unknown }): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify({ type: "broadcast", event: msg.event, payload: msg.payload }));
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      try {
        this.ws.send(JSON.stringify({ type: "unsubscribe" }));
      } catch {}
      this.ws.onclose = () => resolve();
      setTimeout(resolve, 2000);
      this.ws.close();
    });
  }
}

// ---------- supabase client shim ----------

export const supabase = {
  rpc,
  functions,
  channel(name: string, config: object = {}): Channel {
    return new Channel(name, config);
  },
  async removeChannel(ch: Channel): Promise<void> {
    await ch.close();
  },
};
