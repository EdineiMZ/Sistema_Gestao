# Alertas de orçamento

Este módulo controla os limites percentuais utilizados para sinalizar o consumo de orçamentos financeiros. Os valores são configurados via variáveis de ambiente e aplicados automaticamente quando um orçamento é criado ou atualizado.

## Variáveis de ambiente

As seguintes variáveis foram adicionadas ao `.env.example`:

| Variável | Descrição |
| --- | --- |
| `BUDGET_THRESHOLD_DEFAULTS` | Lista de percentuais entre `0` e `1` separados por vírgula. Ex.: `0.5,0.75,0.9` representa 50%, 75% e 90% do orçamento mensal. |
| `BUDGET_ALERT_ENABLED` | Habilita (`true`) ou desabilita (`false`) o uso de alertas automáticos de orçamento. |
| `BUDGET_ALERT_CHANNELS` | Canais de notificação (ex.: `email`, `sms`). |
| `BUDGET_ALERT_RECIPIENTS` | Destinatários padrão dos alertas, separados por vírgula. |

Quando nenhum percentual é informado pelo usuário, o sistema utiliza `BUDGET_THRESHOLD_DEFAULTS` como fallback. Se os alertas forem desativados (`BUDGET_ALERT_ENABLED=false`), nenhum limiar adicional é aplicado.

## API de atualização

A rota `PUT /finance/budgets/:id/thresholds` atualiza os percentuais de alerta de um orçamento específico. A rota aceita payloads `JSON` ou `form-urlencoded` com o campo `thresholds` (array ou string separada por vírgulas). Exemplos:

```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -d '{"thresholds": [0.6, 0.85, 0.95]}' \
  http://localhost:3000/finance/budgets/12/thresholds
```

```bash
curl -X PUT \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'thresholds=0.7,0.9,1' \
  http://localhost:3000/finance/budgets/12/thresholds
```

### Regras de validação

- Todos os valores devem ser numéricos entre `0` e `1` (exclusivo de `0` e inclusivo de `1`).
- Valores inválidos resultam em resposta `400` com a mensagem `Percentuais de alerta devem ser números entre 0 e 1 (ex.: 0.75).`
- Se nenhum percentual válido for enviado, os padrões configurados são aplicados automaticamente.

### Resposta JSON

Quando a rota é chamada via `Accept: application/json` ou `fetch/ajax`, o payload de sucesso segue o formato:

```json
{
  "success": true,
  "message": "Percentuais de alerta atualizados com sucesso.",
  "budget": {
    "id": 12,
    "thresholds": [0.6, 0.85, 0.95],
    "appliedDefaults": false,
    "alertEnabled": true
  }
}
```

## Integração com relatórios

O serviço `financeReportingService` utiliza os percentuais configurados para classificar o status de consumo (saudável, atenção, alerta ou crítico). Os valores são expostos na view `manageFinance` através das variáveis `budgetThresholdDefaults` e `budgetAlertsEnabled`, permitindo ajustar a interface conforme a configuração atual.
