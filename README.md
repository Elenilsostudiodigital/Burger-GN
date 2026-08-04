# Burger GN

Sistema de pedidos para hamburgueria com:

- **Impressoras ESC/POS** (58 mm e 80 mm): cadastro, impressora padrão, impressão automática ao aceitar pedido e botão de impressão manual
- **Clube Burger**: 1 selo por compra concluída, meta configurável (padrão 12) e hambúrguer grátis automático
- **Cashback**: percentual configurável (padrão 3%), saldo acumulado por cliente e uso no checkout

## Stack

- Next.js 15 (App Router) + TypeScript
- Prisma + SQLite
- Tailwind CSS
- ESC/POS via TCP (porta 9100)

## Como rodar

```bash
npm install
npm run db:setup
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) para a loja e `/admin` para o painel.

## Fluxo principal

1. Cliente faz pedido na loja (pode usar cashback e hambúrguer grátis do clube)
2. Admin aceita o pedido em `/admin/pedidos` → imprime automaticamente se habilitado
3. Admin pode clicar em **Imprimir** a qualquer momento
4. Ao **Concluir compra**, o sistema:
   - Credita cashback (%)
   - Adiciona 1 selo
   - Libera hambúrguer grátis ao atingir a meta

## Impressoras

Cadastre em `/admin/impressoras` com IP da impressora térmica na rede local e largura 58 ou 80 mm. A impressão usa protocolo ESC/POS raw na porta configurada (padrão 9100).

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` | Build de produção |
| `npm test` | Testes unitários (clube, cashback, ESC/POS) |
| `npm run db:setup` | Cria/atualiza banco e popula cardápio |
