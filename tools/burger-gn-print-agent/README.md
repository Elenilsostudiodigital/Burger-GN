# Burger GN Print Agent

Serviço local de impressão **silenciosa** (Windows) para o painel admin.

## Por quê?

Navegadores não permitem imprimir sem diálogo. Este agente roda no computador da loja e recebe o pedido do painel via `http://127.0.0.1:19191`.

## Como iniciar

```bat
tools\burger-gn-print-agent\start.bat
```

Ou:

```bash
node tools/burger-gn-print-agent/server.mjs
```

Deixe a janela aberta enquanto usar o painel de pedidos.

## Endpoints

| Método | Rota | Função |
|--------|------|--------|
| GET | `/health` | Status do agente |
| GET | `/printers` | Lista impressoras do Windows |
| POST | `/print` | `{ printerName, text, copies }` — RAW ESC/POS sem diálogo |

## POS-58

Selecione a impressora `POS-58` em **Configurações → Impressoras** e ative impressão automática.
