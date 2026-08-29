# CHANGELOG — Burger GN

Nunca apagar versões anteriores.  
Toda nova implementação aprovada pelo proprietário gera uma nova versão.

---

## Burger GN v1.5.18

- Modo Operação / Modo Sono
  - Agenda: liga sexta 17:30 e dorme segunda 23:30 (horário de Brasília)
  - Em **Configurações** (`/admin/config`): **Ligar Sistema** / **Colocar Sistema para Dormir**, com próximo despertar e descanso
  - No sono: para polling, heartbeat, presença e SSE; cadastro e testes voltam ao clicar em Ligar

---

## Burger GN v1.5.17

- Redução de consumo Vercel (polling)
  - Presence do cardápio e da cozinha passam a usar SSE + intervalos longos
  - `GET /orders` compartilhado em cache; aba oculta pausa os loops
  - Horário da loja, healthz e acompanhamento de pedido polam menos e não duplicam

---

## Burger GN v1.5.16

- Aviso do Print Agent só no PC da loja
  - Celular e dispositivos sem suporte ocultam “Agente de impressão desconectado” e **Reconectar Impressora**
  - O painel admin no celular continua igual; impressão silenciosa permanece no Windows da loja

---

## Burger GN v1.5.15

- Agente de impressão sem PowerShell no autostart
  - Remove `create-startup-shortcut.ps1` (falso positivo Avast IDP.ALEXA.54)
  - Registro de início automático com cópia de `startup-logon.vbs` + `schtasks.exe` (sem `.ps1` e sem `CreateShortcut`)
  - Runtime continua oculto: `wscript.exe` + `start-hidden.vbs` (sem CMD visível)

---

## Burger GN v1.5.14

- Reimprimir comprovante em Pedidos Finalizados
  - Botão com ícone de impressora e tooltip **Reimprimir comprovante**
  - Busca o pedido completo e envia o mesmo cupom térmico 58 mm ao Print Agent (POS-58)
  - Sem `window.print()` e sem janela de impressão do navegador ou do Windows
  - Cupom com número, cliente, produtos, observações, pagamento, taxa, total, data e hora do pedido

---

## Burger GN v1.5.13

- 403 pós-deploy (Vercel WAF, não auth/middleware)
  - Causa: no deploy as conexões SSE caem juntas, o painel e o SW disparam rajada no mesmo IP e o firewall da Vercel devolve 403 em todo o site por alguns minutos; depois a mitigação expira sozinha
  - SSE envia `retry:` com jitter; CDN não guarda 403 (`no-store` em HTML/API)
  - SW tenta de novo em 403/429; o painel detecta WAF (`X-BurgerGN-Api` ausente), registra log e avisa
  - `POST /api/client-telemetry` + `node scripts/probe-edge-403.mjs` para ver o bloqueio na hora

---

## Burger GN v1.5.12

- Agente de impressão sem janela de CMD
  - Início oculto via `wscript.exe` + `start-hidden.vbs` (não usa cmd.exe/.bat em runtime)
  - Tarefas do Windows e protocolo `burgergn-print://` relançam o agente em background
  - Logs só em `agent.log`

---

## Burger GN v1.5.11

- Agente de impressão definitivo (sem abrir start.bat a cada uso)
  - Watchdog local + `install-autostart.bat` (inicia com o Windows, religa se cair)
  - Painel detecta queda, tenta reconectar e oferece **Reconectar Impressora**
  - Se o agente estiver fechado, a mensagem explica o instalador único neste PC da loja

---

## Burger GN v1.5.10

- Mapa da solicitação de região
  - Substitui staticmap.openstreetmap.de (fora do ar) por Leaflet embutido
  - Marcador na coordenada enviada; alternância Mapa / Satélite
  - Exibe endereço, latitude e longitude

---

## Burger GN v1.5.9

- Fix 403 após ~20–30 min de uso
  - Uma única conexão SSE compartilhada no admin (evita tempestade de reconnect que dispara WAF/IP block da Vercel)
  - SSE encerra de forma limpa antes do maxDuration
  - Service worker não cacheia HTML de navegação
  - HTML público com CDN-Cache-Control: no-store

---

## Burger GN v1.5.8

- Fluxo de pedidos por tipo
  - Entrega: Pronto → Saiu para Entrega → Entregue → Finalizar
  - Retirada / Local: Pronto → Finalizar Pedido (sem “Saiu para Entrega”)

---

## Burger GN v1.5.7

- Fix cardápio público 403
  - `resolvePublicCompany` não bloqueia mais leitura do catálogo quando a loja está `blocked`
  - Pedidos online continuam recusando loja bloqueada
  - Service worker não cacheia respostas 401/403/5xx (evita “403 Proibido” grudado)
  - Cache-Control sem store prolongado em `/`, `/cardapio`, `/clube`

---

## Burger GN v1.5.6

- Impressão automática silenciosa (sem janela do navegador)
  - Agente local `tools/burger-gn-print-agent` (Windows RAW / ESC/POS)
  - Configurações → Impressoras: automática, vias 1–4, testar, reimprimir
  - Ao aceitar pedido: envia direto à impressora padrão (ex.: POS-58)

---

## Burger GN v1.5.5

- Módulo Impressoras (Configurações)
  - Aba Configurações → Impressoras
  - Detectar/atualizar lista, USB, Bluetooth (quando o SO/navegador permitir)
  - Status: Conectada / Desconectada / Offline / Erro
  - Testar impressora (comprovante BURGER GN)
  - Impressão automática ao aceitar (opcional), 2ª via, nº em destaque, QR do acompanhamento

---

## Burger GN v1.5.4

- Mensagens Automáticas (Configurações)
  - Nova aba: Configurações → Mensagens Automáticas
  - 6 mensagens editáveis no banco (Recebido, Confirmado, Em Preparo, Pronto, Retirado, Cancelado)
  - Variáveis: {{cliente}} {{pedido}} {{valor}} {{status}} {{link}} {{loja}} {{telefone}} {{horario}}
  - Visualizar / Restaurar padrão / Salvar por mensagem
  - Botão WhatsApp “Enviar atualização ao cliente” usa a mensagem Em Preparo do banco

---

## Burger GN v1.5.3

- Comunicação WhatsApp no andamento do pedido (Em preparo)
  - Botão “📲 Enviar atualização ao cliente” no card Em preparo
  - Abre o WhatsApp com o número do pedido e mensagem pré-preenchida (sem envio automático)
  - Inclui link direto do acompanhamento `/pedido/:trackingId`

---

## Burger GN v1.5.2

- Edição de pedidos aceitos (painel da hamburgueria)
  - Botão “Editar” no card do pedido (Em preparo / Pronto / Saiu)
  - Modal reutiliza o seletor do cardápio (`ProductDetailModal`)
  - Adicionar/remover itens, alterar quantidades e observações
  - Recalcula subtotal/total; mantém número do pedido e tempo de preparo
  - Histórico registra “Pedido editado”; painel e acompanhamento do cliente atualizam

---

## Burger GN v1.5.1 (em validação)

- Limpar carrinho (cliente)
  - Botão “Limpar carrinho” com confirmação
  - Remove todos os itens/adicionais; zera subtotal, total e badge
  - Persistência: carrinho vazio permanece vazio após atualizar a página (PWA/navegador)

---

## Burger GN v1.5 (em validação)

- Utilização de Cashback e Fidelidade (Clube Burger GN)
  - Checkout: card de cashback, checkbox opcional, desconto em tempo real (sem saldo negativo)
  - Limite % máximo de uso por pedido (admin)
  - Validade do cashback e da fidelidade (sem validade / dias / data) + expiração automática no histórico
  - Avisos quando faltam poucos dias para vencer
  - Histórico com saldo anterior/atual; resumo no Clube do cliente
  - Cálculos e débito 100% no servidor (anti overdraft / duplicação)

---

## Burger GN v1.4.1

- Correção pontual: pedidos #3 e #7 (PIX legado `pending` já em Entregue)
  - Regularização só desses registros + finalização pelo fluxo normal
  - Lógica geral de finalização inalterada

---

## Burger GN v1.4

- Upload Profissional de Imagens dos Produtos
  - Selecionar foto no computador ou galeria/câmera no celular
  - Arrastar e soltar, recorte (zoom/mover/girar), otimização automática
  - Pré-visualizar, trocar e remover; URL apenas como opção avançada
  - Compatível com cardápio, promoções, destaques e demais telas que usam `image`

---

## Burger GN v1.3

- Clientes Online / Monitoramento do Cardápio
  - Faixa em tempo real no topo da tela de Pedidos (Online / Carrinhos / Checkout)
  - Alertas visuais na própria tela de Pedidos
  - Sons configuráveis em Notificações e Sons
  - Sessões anônimas até nome/telefone; remoção por inatividade

---

## Burger GN v1.2

- Controle de Produtos Esgotados
  - Toggle Disponível/Esgotado no Cardápio ADM (sem editar/excluir)
  - Filtros Todos / Disponíveis / Esgotados
  - Selo ESGOTADO no cardápio público + compra bloqueada
  - Carrinho e pedidos rejeitam itens esgotados

---

## Burger GN v1.1

- Notificações e Sons (Configurações)
  - Biblioteca de sons + upload .mp3/.wav
  - Volume geral, repetição, horário de notificações
  - Push por dispositivo (Notebook / Android / Tablet / PWA)
  - Sons por etapa do pedido (incluindo atraso)
  - Voz Inteligente preparada (sem IA ainda)

---

## Burger GN v1.0

- Dashboard (Tela Inicial)
- Horário de Funcionamento
- Configuração de Pagamentos
- Configuração do WhatsApp
- Tempo de Preparo

---

<!-- Próximas versões (exemplos de numeração):
## v1.2
## v2.0
-->
