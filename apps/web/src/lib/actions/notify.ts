"use server";

import { createServiceClient } from "@sneakervault/supabase";
import type { Database } from "@sneakervault/supabase";

type Role = Database["public"]["Enums"]["user_role"];

/**
 * Discriminated union of all notification events.
 * Tambah event type baru di sini, lalu handle di formatMessage() + getRecipientRoles().
 */
export type NotifyEvent =
  | { type: "packing.created"; sessionId: string; platform: string; orderId: string | null; itemCount?: number }
  | { type: "packing.shipped"; sessionId: string; platform: string; orderId: string | null }
  | { type: "packing.completed"; sessionId: string; platform: string; orderId: string | null }
  | { type: "packing.has_return"; sessionId: string; platform: string; orderId: string | null }
  | { type: "return.initiated"; returnId: string; reason: string; productLabel: string }
  | { type: "return.verified"; returnId: string; productLabel: string }
  | { type: "return.processed"; returnId: string; returnType: "exchange_size" | "refund"; productLabel: string }
  | { type: "inbound.batch_received"; batchId: string; productLabel: string; quantity: number; unitCost: number }
  | { type: "low_stock.warning"; productId: string; productLabel: string; quantity: number; threshold: number }
  | { type: "product.condition_changed"; productId: string; productLabel: string; previousCondition: string; newCondition: string; reason?: string }
  | { type: "product.aging_detected"; productId: string; productLabel: string; daysSinceLastOutbound: number }
  | { type: "delete_request.submitted"; requestId: string; entityType: string; reason: string }
  | { type: "delete_request.reviewed"; requestId: string; entityType: string; status: "approved" | "rejected"; requesterId: string; notes?: string };

interface NotifyOptions {
  /** UUID user yang memicu event. Otomatis di-exclude dari recipients. */
  actorId?: string;
}

const RELATED_ENTITY_TYPE: Record<NotifyEvent["type"], string | null> = {
  "packing.created": "packing_session",
  "packing.shipped": "packing_session",
  "packing.completed": "packing_session",
  "packing.has_return": "packing_session",
  "return.initiated": "return",
  "return.verified": "return",
  "return.processed": "return",
  "inbound.batch_received": "purchase_batch",
  "low_stock.warning": "product",
  "product.condition_changed": "product",
  "product.aging_detected": "product",
  "delete_request.submitted": "delete_request",
  "delete_request.reviewed": "delete_request",
};

/**
 * Recipient roles per event type.
 * NOTE: low_stock.warning dan delete_request.reviewed di-handle khusus
 * di resolveRecipients() (broadcast / requester-only).
 */
const RECIPIENT_ROLES: Partial<Record<NotifyEvent["type"], Role[]>> = {
  "packing.created": ["owner"],
  "packing.shipped": ["owner", "admin_online"],
  "packing.completed": ["owner"],
  "packing.has_return": ["owner", "admin_gudang", "admin_online"],
  "return.initiated": ["owner", "admin_gudang"],
  "return.verified": ["owner", "admin_online"],
  "return.processed": ["owner"],
  "inbound.batch_received": ["owner"],
  "product.condition_changed": ["owner"],
  "product.aging_detected": ["owner"],
  "delete_request.submitted": ["owner"],
};

function getRelatedEntityId(event: NotifyEvent): string | null {
  switch (event.type) {
    case "packing.created":
    case "packing.shipped":
    case "packing.completed":
    case "packing.has_return":
      return event.sessionId;
    case "return.initiated":
    case "return.verified":
    case "return.processed":
      return event.returnId;
    case "inbound.batch_received":
      return event.batchId;
    case "low_stock.warning":
    case "product.condition_changed":
    case "product.aging_detected":
      return event.productId;
    case "delete_request.submitted":
    case "delete_request.reviewed":
      return event.requestId;
  }
}

function formatMessage(event: NotifyEvent): { subject: string; content: string } {
  switch (event.type) {
    case "packing.created": {
      const orderRef = event.orderId ? `#${event.orderId}` : "(tanpa Order ID)";
      return {
        subject: `Sesi packing baru — ${event.platform}`,
        content: `Sesi packing baru dimulai untuk ${event.platform} ${orderRef}${event.itemCount ? `, ${event.itemCount} item` : ""}.`,
      };
    }
    case "packing.shipped": {
      const orderRef = event.orderId ? `#${event.orderId}` : "(tanpa Order ID)";
      return {
        subject: `Pesanan dikirim — ${event.platform}`,
        content: `Pesanan ${event.platform} ${orderRef} sudah diserahkan ke kurir.`,
      };
    }
    case "packing.completed": {
      const orderRef = event.orderId ? `#${event.orderId}` : "(tanpa Order ID)";
      return {
        subject: `Pesanan selesai — ${event.platform}`,
        content: `Pesanan ${event.platform} ${orderRef} sudah diterima customer.`,
      };
    }
    case "packing.has_return": {
      const orderRef = event.orderId ? `#${event.orderId}` : "(tanpa Order ID)";
      return {
        subject: `Pengembalian masuk — ${event.platform}`,
        content: `Ada pengembalian untuk pesanan ${event.platform} ${orderRef}. Mohon segera dicek.`,
      };
    }
    case "return.initiated":
      return {
        subject: "Return baru diinisiasi",
        content: `Return baru: ${event.productLabel}. Alasan: "${event.reason}". Tunggu verifikasi fisik admin gudang.`,
      };
    case "return.verified":
      return {
        subject: "Return terverifikasi",
        content: `Barang return ${event.productLabel} sudah diverifikasi fisik. Siap diproses (tukar size / refund).`,
      };
    case "return.processed": {
      const label = event.returnType === "exchange_size" ? "Tukar size" : "Refund";
      return {
        subject: `Return diproses — ${label}`,
        content: `${label} untuk ${event.productLabel} sudah selesai diproses. Stok ter-update.`,
      };
    }
    case "inbound.batch_received":
      return {
        subject: "Stok masuk + HPP recalculated",
        content: `Batch baru: ${event.productLabel}, ${event.quantity} pcs @ Rp${event.unitCost.toLocaleString("id-ID")}. HPP model sudah di-recalculate.`,
      };
    case "low_stock.warning":
      return {
        subject: `⚠️ Stok rendah — ${event.productLabel}`,
        content: `Stok ${event.productLabel} tinggal ${event.quantity} pcs (di bawah threshold ${event.threshold}). Perlu restock.`,
      };
    case "product.condition_changed": {
      const toLabel = event.newCondition === "normal" ? "Normal" : event.newCondition === "defect" ? "Defect" : "Lama Tidak Laku";
      const fromLabel = event.previousCondition === "normal" ? "Normal" : event.previousCondition === "defect" ? "Defect" : "Lama Tidak Laku";
      return {
        subject: `Status produk diubah → ${toLabel}`,
        content: `${event.productLabel}: ${fromLabel} → ${toLabel}${event.reason ? `. Alasan: "${event.reason}"` : ""}.`,
      };
    }
    case "product.aging_detected":
      return {
        subject: `⏳ Aging terdeteksi — ${event.productLabel}`,
        content: `${event.productLabel} tidak ada outbound selama ${event.daysSinceLastOutbound} hari. Pertimbangkan diskon atau review harga.`,
      };
    case "delete_request.submitted":
      return {
        subject: "Permintaan hapus baru",
        content: `Ada permintaan hapus ${event.entityType}. Alasan: "${event.reason}". Mohon di-review.`,
      };
    case "delete_request.reviewed": {
      const verdict = event.status === "approved" ? "DISETUJUI" : "DITOLAK";
      const note = event.notes ? ` Catatan: "${event.notes}"` : "";
      return {
        subject: `Permintaan hapus ${verdict.toLowerCase()}`,
        content: `Permintaan hapus ${event.entityType} kamu ${verdict}.${note}`,
      };
    }
  }
}

async function resolveRecipients(
  event: NotifyEvent,
  opts: NotifyOptions = {}
): Promise<string[]> {
  const supabase = createServiceClient();

  // Special: delete_request.reviewed → kirim ke requester saja
  if (event.type === "delete_request.reviewed") {
    return event.requesterId === opts.actorId ? [] : [event.requesterId];
  }

  // Special: low_stock.warning → broadcast ke SEMUA karyawan aktif (per keputusan owner)
  if (event.type === "low_stock.warning") {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true);
    return (data ?? [])
      .map((p) => p.id)
      .filter((id) => id !== opts.actorId);
  }

  // Default: lookup by role
  const roles = RECIPIENT_ROLES[event.type];
  if (!roles || roles.length === 0) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, roles")
    .eq("is_active", true)
    .overlaps("roles", roles);

  return (data ?? [])
    .map((p) => p.id)
    .filter((id) => id !== opts.actorId);
}

/**
 * Emit a system notification ke pihak yang relevan.
 * Non-blocking: kalau gagal, log error tapi jangan throw — server action utama tetap success.
 */
export async function notifyEvent(
  event: NotifyEvent,
  opts: NotifyOptions = {}
): Promise<void> {
  try {
    const recipients = await resolveRecipients(event, opts);
    if (recipients.length === 0) return;

    const supabase = createServiceClient();
    const { subject, content } = formatMessage(event);
    const relatedEntityType = RELATED_ENTITY_TYPE[event.type];
    const relatedEntityId = getRelatedEntityId(event);
    const metadata = { event_type: event.type, auto_generated: true };

    // Filter recipients yang mute event ini
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("user_id, muted_event_types")
      .in("user_id", recipients);

    const mutedSet = new Set(
      (prefs ?? [])
        .filter((p) => (p.muted_event_types ?? []).includes(event.type))
        .map((p) => p.user_id)
    );
    const finalRecipients = recipients.filter((id) => !mutedSet.has(id));
    if (finalRecipients.length === 0) return;

    // Insert satu pesan per recipient via SECURITY DEFINER RPC
    await Promise.all(
      finalRecipients.map((receiverId) =>
        supabase.rpc("create_system_notification", {
          p_receiver_id: receiverId,
          p_content: content,
          p_subject: subject,
          p_related_entity_type: relatedEntityType ?? undefined,
          p_related_entity_id: relatedEntityId ?? undefined,
          p_metadata: metadata,
        })
      )
    );

    // Log ke activity_logs untuk audit trail
    await supabase.from("activity_logs").insert({
      user_id: opts.actorId ?? finalRecipients[0],
      action: "notification_sent",
      entity_type: relatedEntityType ?? "notification",
      entity_id: relatedEntityId ?? null,
      old_data: null,
      new_data: {
        event_type: event.type,
        recipients: finalRecipients,
        subject,
      },
    });
  } catch (error) {
    // Log tapi jangan throw — notif gagal tidak boleh crash parent action
    console.error("[notifyEvent] failed", {
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Cek apakah produk sudah di bawah threshold; kalau iya, fire low_stock.warning.
 * Dipanggil setelah outbound scan supaya owner & semua karyawan dapat alert real-time.
 */
export async function checkLowStockAndNotify(
  productId: string,
  opts: NotifyOptions = {}
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const [productRes, settingRes] = await Promise.all([
      supabase
        .from("products")
        .select("brand, model, size, quantity")
        .eq("id", productId)
        .maybeSingle(),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "low_stock_threshold")
        .maybeSingle(),
    ]);

    const product = productRes.data;
    if (!product) return;

    const threshold = Number(settingRes.data?.value ?? 3);
    if (product.quantity >= threshold) return;

    await notifyEvent(
      {
        type: "low_stock.warning",
        productId,
        productLabel: `${product.brand} ${product.model} size ${product.size}`,
        quantity: product.quantity,
        threshold,
      },
      opts
    );
  } catch (error) {
    console.error("[checkLowStockAndNotify] failed", {
      productId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
