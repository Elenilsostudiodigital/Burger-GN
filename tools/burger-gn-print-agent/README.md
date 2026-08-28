# Burger GN Print Agent

Serviço local de impressão **silenciosa** (Windows) para o painel admin.

Navegadores não imprimem sem diálogo. Este agente roda no **computador da loja** e recebe o pedido do painel via `http://127.0.0.1:19191`.

## Instalação definitiva (uma vez neste PC)

Não dependa de deixar uma janela `start.bat` aberta.

1. Instale o [Node.js LTS](https://nodejs.org) se ainda não houver.
2. Execute **uma vez**:

```bat
tools\burger-gn-print-agent\install-autostart.bat
```

Isso:

- Copia o agente para `%LOCALAPPDATA%\BurgerGN\print-agent` (sobrevive a deploys do site)
- Cria tarefa no login do Windows + verificação a cada minuto
- Cria atalho em Inicializar
- Registra o protocolo `burgergn-print://` para o botão **Reconectar Impressora** do painel
- Sobe o watchdog agora (janela pode ser fechada)

O watchdog reinicia o agente se o processo cair. O painel detecta a queda, tenta religar e oferece **Reconectar Impressora**.

## Endpoints

| Método | Rota | Função |
| --- | --- | --- |
| GET | `/health` | Status do agente |
| GET | `/printers` | Lista impressoras do Windows |
| POST | `/print` | `{ printerName, text, copies }` — RAW ESC/POS sem diálogo |

## POS-58

Selecione a impressora `POS-58` em **Configurações → Impressoras** e ative impressão automática.

## Remover o início automático

```bat
tools\burger-gn-print-agent\uninstall-autostart.bat
```
