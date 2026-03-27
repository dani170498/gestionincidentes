import { db } from "@/lib/db";

const WEBHOOK_URL = process.env.WEBHOOK_TARGET_URL || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

type CatalogEventPayload = {
  event: string;
  occurred_at: string;
  catalogo: string;
  action: "create" | "update" | "deactivate" | "activate";
  item: Record<string, unknown>;
};

type TicketActionEventPayload = {
  event: string;
  occurred_at: string;
  ticket: {
    id: number;
    tipo_registro: string;
    estado: string;
    solicitante: string;
    tipo_servicio: string;
    canal_oficina: string;
    gerencia: string;
    encargado: string;
  };
  action: {
    id: number;
    text: string;
    created_at: string;
    created_by: string;
  };
};

function buildHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WEBHOOK_SECRET) headers["x-webhook-secret"] = WEBHOOK_SECRET;
  return headers;
}

async function sendWebhook(targetUrl: string, payload: CatalogEventPayload) {
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook ${res.status}: ${text || "error"}`);
  }
}

async function publishWebhookEvent(eventType: string, payload: CatalogEventPayload | TicketActionEventPayload) {
  if (!WEBHOOK_URL) return { skipped: true };

  const outbox = await db.query(
    `INSERT INTO webhook_outbox (event_type, payload, target_url, status, attempts)
     VALUES ($1, $2, $3, 'PENDING', 0)
     RETURNING id`,
    [eventType, payload, WEBHOOK_URL]
  );

  const outboxId = outbox.rows[0]?.id;
  try {
    await sendWebhook(WEBHOOK_URL, payload as CatalogEventPayload);
    await db.query(
      `UPDATE webhook_outbox
       SET status = 'SENT', attempts = attempts + 1, last_error = NULL, updated_at = now()
       WHERE id = $1`,
      [outboxId]
    );
    return { ok: true, id: outboxId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    await db.query(
      `UPDATE webhook_outbox
       SET status = 'FAILED', attempts = attempts + 1, last_error = $2, updated_at = now()
       WHERE id = $1`,
      [outboxId, message]
    );
    return { ok: false, id: outboxId, error: message };
  }
}

export async function publishCatalogEvent(params: {
  catalogo: string;
  action: "create" | "update" | "deactivate" | "activate";
  item: Record<string, unknown>;
}) {
  const payload: CatalogEventPayload = {
    event: "catalog.changed",
    occurred_at: new Date().toISOString(),
    catalogo: params.catalogo,
    action: params.action,
    item: params.item,
  };

  return publishWebhookEvent(payload.event, payload);
}

export async function publishTicketActionEvent(params: {
  ticket: {
    id: number;
    tipo_registro: string;
    estado: string;
    solicitante: string;
    tipo_servicio: string;
    canal_oficina: string;
    gerencia: string;
    encargado: string;
  };
  action: {
    id: number;
    text: string;
    created_at: string;
    created_by: string;
  };
}) {
  const payload: TicketActionEventPayload = {
    event: "ticket.action.created",
    occurred_at: new Date().toISOString(),
    ticket: params.ticket,
    action: params.action,
  };

  return publishWebhookEvent(payload.event, payload);
}

export async function retryWebhookOutbox(id?: number) {
  const rows = id
    ? await db.query(
        "SELECT id, payload, target_url FROM webhook_outbox WHERE id = $1 AND status IN ('PENDING','FAILED')",
        [id]
      )
    : await db.query(
        "SELECT id, payload, target_url FROM webhook_outbox WHERE status IN ('PENDING','FAILED') ORDER BY created_at ASC LIMIT 50"
      );

  const items = rows.rows || [];
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await sendWebhook(item.target_url, item.payload as CatalogEventPayload);
      await db.query(
        `UPDATE webhook_outbox
         SET status = 'SENT', attempts = attempts + 1, last_error = NULL, updated_at = now()
         WHERE id = $1`,
        [item.id]
      );
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook error";
      await db.query(
        `UPDATE webhook_outbox
         SET status = 'FAILED', attempts = attempts + 1, last_error = $2, updated_at = now()
         WHERE id = $1`,
        [item.id, message]
      );
      failed += 1;
    }
  }

  return { total: items.length, sent, failed };
}
