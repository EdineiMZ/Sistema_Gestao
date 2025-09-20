# Mapeamento da view `manageFinance.ejs`

> **Nota:** a view monolítica `manageFinance.ejs` foi decomposta nas páginas `finance/overview.ejs`, `finance/budgets.ejs`, `finance/payments.ejs` e `finance/investments.ejs`. O mapeamento abaixo permanece como referência histórica dos blocos originais e auxilia no rastreio de responsabilidades migradas.

> Objetivo: orientar a extração modular da view financeira atual, indicando responsabilidades de cada bloco e os dados necessários para renderização.

## Estrutura geral

A página inclui diretamente os parciais globais `partials/header` e `partials/footer`, definindo toda a lógica de contexto (formatadores, valores padrão, listas derivadas) no topo do template. Diversos trechos assumem a existência de helpers adicionais em `locals` fornecidos pelo controller.

## Blocos e dependências de dados

| Bloco | Descrição | Dados esperados |
| --- | --- | --- |
| **Contexto inicial** | Normaliza opções de recorrência, filtros e formatadores de moeda. | `recurringIntervalOptions`, `filters`, `periodLabel`, `formatCurrency` (opcional via `locals`). |
| **Hero / Overview** | Cabeçalho com chip “Saúde financeira”, título e contagem de lançamentos. Exibe mensagens flash de sucesso/erro. | `entries` (array para contar), `success_msg`, `error_msg`. |
| **Visão rápida de resultados** | Cards com totais (receber, pagar, saldo projetado, em atraso) e CTA para painel de orçamentos. | `financeTotals` (ou `summaryTotals`), `formatCurrency`, `budgetPageUrl`. |
| **Limites globais** | Formulário para sobrepor limites de atraso, alerta de consumo e piso de meta líquida. Usa dados para estados iniciais e endpoint. | `financeThresholds`, `csrfToken`, `financeThresholdsEndpoint`. |
| **Cartões de orçamento + gráficos** | Loop sobre `budgetCards` / `budgetSummaries` exibindo métricas, alertas, thresholds e gatilhos para atualização via `financeBudgets.js`. Mostra também gráfico de distribuição por categoria. | `budgetCards`, `categoryConsumption`, `budgetMonths`, `budgetStatusPalette`, `formatCurrency`. |
| **Metas & projeções** | Tabela com projeções, destaque de meta próxima, alertas e resumo (`goalSummary`). | `projectionList`/`financeProjections`, `projectionAlerts`, `highlightProjection`, `financeGoalSummary`, `financeGoals`. |
| **Formulário de metas** | Permite registrar nova meta mensal. | `financeGoals` (para preencher campos), `csrfToken`. |
| **Prévia de importação** | Exibe tabela com entradas em pré-importação, conflitos e ações. | `financeImportPreview` / `importPreview`. |
| **Filtros inteligentes** | Formulário GET para período, tipo, status e parâmetros de simulação. | `filters`, `contributionFrequencyLabels`, `periodLabel`. |
| **Resumo analítico** | Cards adicionais (receitas, despesas, saldo) e tabela por tipo/status. | `financeTotals`, `summaryStatus`. |
| **Listagem de lançamentos** | Tabela principal com ações (editar, excluir), anexos e tooltips. | `entries` (inclui `category`, `attachments`), `financeCategories`. |
| **Modais de edição** | Um modal por lançamento preenchido com dados e anexos existentes. | `entries`, `recurringIntervalOptions`, `FinanceAttachment`. |
| **Formulário de novo lançamento** | Formulário completo com uploads e selects de categoria. | `categories` (`financeCategoryOptions` derivados), `recurringIntervalOptions`, `csrfToken`. |
| **Scripts inline** | JSON serializado (`financeBudgetState`), import de Chart.js, lógica de filtros, thresholds e gráficos. | `normalizedBudgetData`, `categoryConsumptionList`, `summaryMonthly`, `clientBudgetStatusMeta`. |

## Observações para extração

- Diversos helpers (`formatCurrency`, `financeThresholds`, `budgetStatusMeta`) são fornecidos tanto diretamente quanto via `locals`; as novas rotas devem resolver esses valores explicitamente.
- `financeBudgets.js` depende do bloco `financeBudgetState` (JSON) e dos elementos com data-atributos específicos; ao isolar a página de orçamentos, garantir que ambos permaneçam sincronizados.
- A prévia de importação usa sessão (`req.session.financeImportPreview`) para persistir dados; ao mover para `/finance/payments`, o controller deve continuar a limpar a sessão após o commit.
- O bloco de simulação de investimentos depende de filtros específicos (`investmentPeriodMonths`, `investmentContribution`, `investmentContributionFrequency`); a página `/finance/investments` precisa encaminhar esses parâmetros ao serviço de simulação.
- As ações de CRUD (POST/PUT/DELETE) permanecem nas rotas atuais (`/finance/create`, `/finance/update/:id`, etc.); os novos templates apenas redistribuem a apresentação.

