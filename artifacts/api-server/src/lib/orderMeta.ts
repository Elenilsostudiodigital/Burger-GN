/** Order metadata embedded in `orders.notes` — no schema changes required. */

export type WorkflowStage = "new" | "accepted" | "preparing" | "ready" | "out" | "done";
export type CardType = "credit" | "debit";

export interface StatusHistoryEntry {
  stage: WorkflowStage | "cancelled";
  label: string;
  at: string;
}

export interface OrderMeta {
  workflow?: WorkflowStage;
  cardType?: CardType;
  needsChange?: boolean;
  receiptDataUrl?: string;
  receiptUploadedAt?: string;
  history?: StatusHistoryEntry[];
  pixCopyPaste?: string;
  pixKey?: string;
}

export const WORKFLOW_LABELS: Record<WorkflowStage | "cancelled", string> = {
  new: "Novo Pedido",
  accepted: "Pedido Aceito",
  preparing: "Em Preparo",
  ready: "Pronto",
  out: "Saiu para Entrega",
  done: "Finalizado",
  cancelled: "Cancelado",
};

/** Maps UI workflow to existing DB `order_status` enum values. */
export const WORKFLOW_TO_STATUS: Record<WorkflowStage, "new" | "preparing" | "delivery" | "done"> = {
  new: "new",
  accepted: "new",
  preparing: "preparing",
  ready: "preparing",
  out: "delivery",
  done: "done",
};

const META_RE = /<!--BGN_META:([\s\S]*?):BGN_META-->/;

export function parseOrderNotes(notes: string | null | undefined): { publicNotes: string; meta: OrderMeta } {
  const raw = notes ?? "";
  const match = raw.match(META_RE);
  if (!match) return { publicNotes: raw.trim(), meta: {} };
  let meta: OrderMeta = {};
  try {
    meta = JSON.parse(match[1] || "{}") as OrderMeta;
  } catch {
    meta = {};
  }
  const publicNotes = raw.replace(META_RE, "").trim();
  return { publicNotes, meta };
}

export function serializeOrderNotes(publicNotes: string, meta: OrderMeta): string {
  const cleanMeta: OrderMeta = {};
  if (meta.workflow) cleanMeta.workflow = meta.workflow;
  if (meta.cardType) cleanMeta.cardType = meta.cardType;
  if (typeof meta.needsChange === "boolean") cleanMeta.needsChange = meta.needsChange;
  if (meta.receiptDataUrl) cleanMeta.receiptDataUrl = meta.receiptDataUrl;
  if (meta.receiptUploadedAt) cleanMeta.receiptUploadedAt = meta.receiptUploadedAt;
  if (meta.history?.length) cleanMeta.history = meta.history;
  if (meta.pixCopyPaste) cleanMeta.pixCopyPaste = meta.pixCopyPaste;
  if (meta.pixKey) cleanMeta.pixKey = meta.pixKey;

  const hasMeta = Object.keys(cleanMeta).length > 0;
  const body = (publicNotes || "").trim();
  if (!hasMeta) return body;
  return `${body}${body ? "\n\n" : ""}<!--BGN_META:${JSON.stringify(cleanMeta)}:BGN_META-->`;
}

export function resolveWorkflow(
  status: string,
  meta: OrderMeta,
): WorkflowStage | "cancelled" {
  if (status === "cancelled") return "cancelled";
  if (meta.workflow && meta.workflow in WORKFLOW_TO_STATUS) return meta.workflow;
  if (status === "preparing") return "preparing";
  if (status === "delivery") return "out";
  if (status === "done") return "done";
  return "new";
}

export function appendHistory(meta: OrderMeta, stage: WorkflowStage | "cancelled"): OrderMeta {
  const entry: StatusHistoryEntry = {
    stage,
    label: WORKFLOW_LABELS[stage],
    at: new Date().toISOString(),
  };
  const history = [...(meta.history ?? [])];
  const last = history[history.length - 1];
  if (last?.stage === stage) return meta;
  history.push(entry);
  return { ...meta, history, workflow: stage === "cancelled" ? meta.workflow : stage };
}
