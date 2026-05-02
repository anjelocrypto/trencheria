/**
 * WebSocket relay for Supabase Realtime.
 * Clients connect to /api/ws/realtime and send JSON messages:
 *   { type: "subscribe", channel: "world:global_world_1", config: {...} }
 *   { type: "broadcast", event: "move", payload: {...} }
 *   { type: "presence_track", payload: {...} }
 *   { type: "unsubscribe" }
 *
 * The server relays via Supabase Realtime channel.
 * postgres_changes subscriptions are supported by adding them before subscribe().
 */
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

const supabaseUrl = process.env["VITE_SUPABASE_URL"]!;
const anonKey = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;

export function setupRealtimeWss(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    // Create a dedicated Supabase client per WebSocket connection
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let channel: RealtimeChannel | null = null;

    const send = (msg: object) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.on("message", async (raw: Buffer) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === "subscribe") {
        if (channel) {
          await client.removeChannel(channel);
          channel = null;
        }

        channel = client.channel(msg.channel, msg.config ?? {});

        // Wire up broadcast listener
        channel.on("broadcast", { event: "*" } as any, (payload: any) => {
          send({ type: "broadcast", event: payload.event, payload: payload.payload });
        });

        // Wire up presence listeners
        channel
          .on("presence", { event: "sync" } as any, () => {
            const state = channel!.presenceState();
            send({ type: "presence_sync", state });
          })
          .on("presence", { event: "join" } as any, ({ key, newPresences }: any) => {
            send({ type: "presence_join", key, newPresences });
          })
          .on("presence", { event: "leave" } as any, ({ key, leftPresences }: any) => {
            send({ type: "presence_leave", key, leftPresences });
          });

        // Wire up postgres_changes listeners if requested
        if (Array.isArray(msg.postgresChanges)) {
          for (const sub of msg.postgresChanges) {
            channel.on(
              "postgres_changes" as any,
              { event: sub.event ?? "*", schema: sub.schema ?? "public", table: sub.table },
              (payload: any) => {
                send({ type: "postgres_changes", table: sub.table, payload });
              }
            );
          }
        }

        channel.subscribe((status: string) => {
          send({ type: "status", status });
        });

      } else if (msg.type === "broadcast" && channel) {
        channel.send({
          type: "broadcast",
          event: msg.event,
          payload: msg.payload,
        });

      } else if (msg.type === "presence_track" && channel) {
        channel.track(msg.payload);

      } else if (msg.type === "presence_untrack" && channel) {
        channel.untrack();

      } else if (msg.type === "unsubscribe" && channel) {
        await client.removeChannel(channel);
        channel = null;
        send({ type: "status", status: "unsubscribed" });
      }
    });

    ws.on("close", async () => {
      if (channel) {
        await client.removeChannel(channel).catch(() => {});
      }
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "Realtime WS client error");
    });
  });
}
