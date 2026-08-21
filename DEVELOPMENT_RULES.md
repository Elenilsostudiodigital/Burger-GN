# Burger GN - Regras de Desenvolvimento

1. Antes de iniciar qualquer implementação, ler obrigatoriamente:
   - `DEVELOPMENT_RULES.md`
   - `PROJECT_STATUS.md`

2. Trabalhar exclusivamente no módulo solicitado.

3. Nunca alterar módulos marcados como **CONCLUÍDOS** sem autorização explícita do proprietário.

4. Nunca fazer refatorações gerais quando a tarefa envolver apenas um módulo específico.

5. Caso seja realmente necessário alterar um módulo concluído:
   - **PARAR** imediatamente.
   - Explicar:
     - por que precisa alterar;
     - quais arquivos serão alterados;
     - quais riscos existem.
   - Somente continuar após autorização do proprietário.

6. Toda implementação deverá seguir obrigatoriamente este fluxo:

   ```
   Implementar
   ↓
   Executar testes locais
   ↓
   Corrigir bugs
   ↓
   Executar novamente
   ↓
   Todos os testes aprovados
   ↓
   Deploy
   ↓
   Validação manual do proprietário
   ↓
   Somente após aprovação manual considerar a tarefa concluída.
   ```

7. Nunca considerar uma tarefa concluída apenas porque os testes automatizados passaram.  
   A validação final sempre será do proprietário.

---

## Tratamento por módulo

A partir deste momento o Burger GN **não** é tratado como um único bloco de mudanças.

- Cada módulo é tratado **individualmente**.
- Ao solicitar uma nova funcionalidade: **não** alterar módulos concluídos.
- Trabalhar **apenas** no módulo solicitado.
- Sempre preservar a estabilidade do sistema.

## Estabilidade

Foco principal:

- reduzir riscos;
- impedir regressões;
- evitar que uma correção quebre outro módulo.

Sempre que um módulo for concluído e validado manualmente pelo proprietário, movê-lo para **MÓDULOS CONCLUÍDOS (PROTEGIDOS)** em `PROJECT_STATUS.md`.
