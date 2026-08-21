# CHANGELOG — Burger GN

Nunca apagar versões anteriores.  
Toda nova implementação aprovada pelo proprietário gera uma nova versão.

---

## Burger GN v1.5.2 (em validação)

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
