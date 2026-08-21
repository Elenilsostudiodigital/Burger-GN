/** Automatic message templates — defaults + interpolation (server). */

export const MESSAGE_TEMPLATE_KEYS = [
  "pedido_recebido",
  "pedido_confirmado",
  "em_preparo",
  "pedido_pronto",
  "pedido_retirado",
  "pedido_cancelado",
] as const;

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number];

export const MESSAGE_TEMPLATE_NAMES: Record<MessageTemplateKey, string> = {
  pedido_recebido: "Pedido Recebido",
  pedido_confirmado: "Pedido Confirmado",
  em_preparo: "Em Preparo",
  pedido_pronto: "Pedido Pronto",
  pedido_retirado: "Pedido Retirado",
  pedido_cancelado: "Pedido Cancelado",
};

export const MESSAGE_TEMPLATE_DEFAULTS: Record<MessageTemplateKey, string> = {
  pedido_recebido:
    `Olá {{cliente}} 👋\n` +
    `Recebemos o seu pedido #{{pedido}} ({{valor}}).\n` +
    `Status: {{status}}.\n` +
    `Acompanhe em tempo real:\n` +
    `{{link}}\n\n` +
    `— {{loja}}`,
  pedido_confirmado:
    `Olá {{cliente}} 👋\n` +
    `Seu pedido #{{pedido}} foi confirmado.\n` +
    `Valor: {{valor}}.\n` +
    `Acompanhe:\n` +
    `{{link}}\n\n` +
    `— {{loja}}`,
  em_preparo:
    `Olá {{cliente}} 👋\n` +
    `Seu pedido já entrou em preparo.\n` +
    `Acompanhe em tempo real pelo link abaixo:\n` +
    `{{link}}`,
  pedido_pronto:
    `Olá {{cliente}} 👋\n` +
    `Seu pedido #{{pedido}} está pronto!\n` +
    `Valor: {{valor}}.\n` +
    `Horário estimado: {{horario}}.\n` +
    `Acompanhe:\n` +
    `{{link}}\n\n` +
    `— {{loja}}`,
  pedido_retirado:
    `Olá {{cliente}} 👋\n` +
    `Seu pedido #{{pedido}} foi retirado. Bom apetite!\n` +
    `Dúvidas: {{telefone}}\n\n` +
    `— {{loja}}`,
  pedido_cancelado:
    `Olá {{cliente}} 👋\n` +
    `Infelizmente seu pedido #{{pedido}} foi cancelado.\n` +
    `Status: {{status}}.\n` +
    `Fale conosco: {{telefone}}\n\n` +
    `— {{loja}}`,
};

export const MESSAGE_TEMPLATE_VARIABLES = [
  "cliente",
  "pedido",
  "valor",
  "status",
  "link",
  "loja",
  "telefone",
  "horario",
] as const;

export type MessageTemplateVars = Partial<Record<(typeof MESSAGE_TEMPLATE_VARIABLES)[number], string>>;

export function isMessageTemplateKey(value: string): value is MessageTemplateKey {
  return (MESSAGE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function interpolateMessageTemplate(
  template: string,
  vars: MessageTemplateVars,
): string {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = vars[key as keyof MessageTemplateVars];
    return v != null && v !== "" ? String(v) : "";
  });
}

export function getDefaultMessageBody(key: MessageTemplateKey): string {
  return MESSAGE_TEMPLATE_DEFAULTS[key];
}
