import { Router } from "express";
import { db, messageTemplatesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireCompanyAuth } from "../middlewares/auth";
import { ensureMessageTemplatesSchema } from "../lib/ensureMessageTemplatesSchema";
import {
  MESSAGE_TEMPLATE_KEYS,
  MESSAGE_TEMPLATE_NAMES,
  MESSAGE_TEMPLATE_VARIABLES,
  getDefaultMessageBody,
  interpolateMessageTemplate,
  isMessageTemplateKey,
  type MessageTemplateKey,
  type MessageTemplateVars,
} from "../lib/messageTemplates";

const router = Router();

async function listForCompany(companyId: number) {
  const rows = await db
    .select()
    .from(messageTemplatesTable)
    .where(eq(messageTemplatesTable.companyId, companyId));
  const byKey = new Map(rows.map((r) => [r.templateKey, r]));

  return MESSAGE_TEMPLATE_KEYS.map((key) => {
    const row = byKey.get(key);
    const defaultBody = getDefaultMessageBody(key);
    return {
      key,
      name: MESSAGE_TEMPLATE_NAMES[key],
      body: row?.body ?? defaultBody,
      defaultBody,
      updatedAt: row?.updatedAt?.toISOString?.() ?? null,
      isCustom: !!row && row.body !== defaultBody,
    };
  });
}

async function upsertBody(companyId: number, key: MessageTemplateKey, body: string) {
  const [existing] = await db
    .select()
    .from(messageTemplatesTable)
    .where(
      and(
        eq(messageTemplatesTable.companyId, companyId),
        eq(messageTemplatesTable.templateKey, key),
      ),
    );

  if (existing) {
    const [updated] = await db
      .update(messageTemplatesTable)
      .set({ body, updatedAt: new Date() })
      .where(eq(messageTemplatesTable.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(messageTemplatesTable)
    .values({ companyId, templateKey: key, body })
    .returning();
  return created!;
}

router.get("/admin/message-templates", requireCompanyAuth, async (req, res) => {
  try {
    await ensureMessageTemplatesSchema();
    const templates = await listForCompany(req.companyId!);
    res.json({
      templates,
      variables: MESSAGE_TEMPLATE_VARIABLES,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list message templates");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/message-templates/:key", requireCompanyAuth, async (req, res) => {
  try {
    await ensureMessageTemplatesSchema();
    const key = String(req.params.key || "");
    if (!isMessageTemplateKey(key)) {
      res.status(404).json({ error: "Mensagem não encontrada" });
      return;
    }
    const templates = await listForCompany(req.companyId!);
    const found = templates.find((t) => t.key === key)!;
    res.json(found);
  } catch (err) {
    req.log.error({ err }, "Failed to get message template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/message-templates/:key", requireCompanyAuth, async (req, res) => {
  try {
    await ensureMessageTemplatesSchema();
    const key = String(req.params.key || "");
    if (!isMessageTemplateKey(key)) {
      res.status(404).json({ error: "Mensagem não encontrada" });
      return;
    }
    const body = String((req.body as { body?: string })?.body ?? "").trim();
    if (!body) {
      res.status(400).json({ error: "Informe o texto da mensagem." });
      return;
    }
    if (body.length > 4000) {
      res.status(400).json({ error: "Mensagem muito longa (máx. 4000 caracteres)." });
      return;
    }

    await upsertBody(req.companyId!, key, body);
    const templates = await listForCompany(req.companyId!);
    res.json(templates.find((t) => t.key === key));
  } catch (err) {
    req.log.error({ err }, "Failed to save message template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/message-templates/:key/restore", requireCompanyAuth, async (req, res) => {
  try {
    await ensureMessageTemplatesSchema();
    const key = String(req.params.key || "");
    if (!isMessageTemplateKey(key)) {
      res.status(404).json({ error: "Mensagem não encontrada" });
      return;
    }
    const defaultBody = getDefaultMessageBody(key);
    await upsertBody(req.companyId!, key, defaultBody);
    const templates = await listForCompany(req.companyId!);
    res.json(templates.find((t) => t.key === key));
  } catch (err) {
    req.log.error({ err }, "Failed to restore message template");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Preview with provided vars (or sample) — does not persist. */
router.post("/admin/message-templates/:key/preview", requireCompanyAuth, async (req, res) => {
  try {
    await ensureMessageTemplatesSchema();
    const key = String(req.params.key || "");
    if (!isMessageTemplateKey(key)) {
      res.status(404).json({ error: "Mensagem não encontrada" });
      return;
    }
    const payload = req.body as { body?: string; vars?: MessageTemplateVars };
    const templates = await listForCompany(req.companyId!);
    const current = templates.find((t) => t.key === key)!;
    const source = typeof payload.body === "string" && payload.body.trim()
      ? payload.body
      : current.body;

    const sample: MessageTemplateVars = {
      cliente: "João",
      pedido: "42",
      valor: "R$ 45,90",
      status: MESSAGE_TEMPLATE_NAMES[key],
      link: "https://burger-gn.vercel.app/pedido/exemplo",
      loja: "The Burger GN",
      telefone: "(71) 99999-0000",
      horario: "35–45 min",
      ...(payload.vars || {}),
    };

    res.json({
      key,
      name: current.name,
      preview: interpolateMessageTemplate(source, sample),
      vars: sample,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to preview message template");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
