# FinSim — DRE, Balanço e Capital de Giro

App educacional interativo para ensinar, na prática, como premissas operacionais se propagam pela DRE, pelo Balanço Patrimonial e pelo Capital de Giro.

## Como usar

1. Abra `index.html` em qualquer navegador moderno (Chrome, Edge, Firefox, Safari).
2. Navegue pelas abas:
   - **Painel de Premissas**: ajuste sliders de receita, custos e prazos.
   - **DRE Gerencial**: veja a cascata de resultado, indicadores e comparativo.
   - **Balanço**: explore Ativo, Passivo e PL; clique nas contas para rastrear a premissa.
   - **Capital de Giro**: analise CCC, NCG, CDG e Saldo de Tesouraria.
   - **Aprender**: consulte o glossário, responda o quiz e tente os desafios.
3. Use **Salvar cenário** para guardar uma configuração e comparar com ajustes futuros.

## Estrutura

- `index.html` — estrutura e navegação
- `styles.css` — estilos e layout responsivo
- `app.js` — motor de cálculo e renderização

## Motor de cálculo (resumo)

- **DRE**: Receita Bruta → Deduções → Receita Líquida → CMV → Lucro Bruto → Despesas → EBITDA → Depreciação → EBIT → IR → Lucro Líquido.
- **Balanço**: Contas a Receber, Estoque e Contas a Pagar são derivadas dos prazos; o Caixa é a conta de fechamento que garante `Ativo = Passivo + PL`.
- **Capital de Giro**: CCC = PME + PMR − PMP; NCG = ACO − PCO; Tesouraria = CDG − NCG.

## Requisitos

Nenhuma dependência. App 100% HTML/CSS/JS puro.
