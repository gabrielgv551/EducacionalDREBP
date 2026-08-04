const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const formatPercent = (v) => `${v.toFixed(1).replace('.', ',')}%`;

function formatAccountingInput(v) {
  if (v === '' || v == null || Number.isNaN(Number(v))) return '';
  const num = Math.round(parseFloat(v));
  const abs = Math.abs(num);
  return (num < 0 ? '-' : '') + abs.toLocaleString('pt-BR');
}

function parseAccountingInput(s) {
  if (typeof s !== 'string') return parseFloat(s) || 0;
  const cleaned = s.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  return parseFloat(cleaned) || 0;
}

function maskAccountingInput(input) {
  const raw = input.value.replace(/[^\d,\-]/g, '');
  const numeric = parseAccountingInput(raw);
  const formatted = formatAccountingInput(numeric);
  const prevLen = input.value.length;
  const prevCursor = input.selectionStart || 0;
  input.value = formatted;
  const addedDots = formatted.length - prevLen;
  const newCursor = Math.max(0, prevCursor + addedDots);
  input.setSelectionRange(newCursor, newCursor);
}

// Helpers para os novos inputs de texto das premissas
function clamp(v, min, max) {
  if (min != null && v < min) return Number(min);
  if (max != null && v > max) return Number(max);
  return v;
}

function parseNumberBR(s) {
  if (typeof s !== 'string') return Number(s) || 0;
  const cleaned = s.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  return parseFloat(cleaned) || 0;
}

function formatCurrencyInput(v) {
  const n = Math.round(parseNumberBR(v));
  return n.toLocaleString('pt-BR');
}

function formatPercentInput(v, decimals = 1) {
  const n = parseNumberBR(v);
  return n.toFixed(decimals).replace('.', ',');
}

function formatDaysInput(v) {
  return String(Math.round(parseNumberBR(v)));
}

function formatInputByType(v, type) {
  if (type === 'currency') return formatCurrencyInput(v);
  if (type === 'percent') return formatPercentInput(v);
  if (type === 'percentSigned') return formatPercentInput(v);
  if (type === 'days') return formatDaysInput(v);
  return String(v);
}

function parseInputByType(s, type) {
  if (type === 'currency') return Math.round(parseNumberBR(s));
  if (type === 'percent' || type === 'percentSigned') return parseNumberBR(s);
  if (type === 'days') return Math.round(parseNumberBR(s));
  return parseNumberBR(s);
}

const defaultState = {
  receitaBruta: 5_000_000,
  deducoes: 12,
  cmvPercent: 45,
  despesasFixas: 800_000,
  despesasVariaveis: 12,
  despesasEmprestimos: 120_000,
  pmr: 45,
  pme: 35,
  pmp: 30,
  depreciacao: 180_000,
  sazonalidade: 1.0,
};

const accountSuggestions = {
  ativoCirculante: ['Aplicações Financeiras', 'Títulos a Receber', 'Adiantamentos a Fornecedores', 'Estoque de Mercadorias', 'Contas a Receber de Curto Prazo'],
  ativoNaoCirculante: ['Intangível', 'Investimentos', 'Terrenos', 'Máquinas e Equipamentos', 'Veículos'],
  passivoCirculante: ['Fornecedores', 'Salários a Pagar', 'Impostos a Pagar', 'Empréstimos de Curto Prazo', 'Contas a Pagar', 'Provisão para 13º e Férias'],
  passivoNaoCirculante: ['Financiamentos', 'Provisão para Contingências', 'Debêntures', 'Impostos Diferidos'],
  patrimonioLiquido: ['Reservas de Capital', 'Lucros a Realizar', 'Reservas de Lucros', 'Lucros ou prejuízos acumulados'],
};

let state = { ...defaultState };
let savedScenario = null;
let selectedTrace = null;
let viewMode = 'annual'; // 'annual' | 'monthly'
let currentBalanceStep = 0;

function cloneBalanceAccounts(accounts) {
  return Object.fromEntries(Object.entries(accounts).map(([k, v]) => [k, v.map((a) => ({ ...a }))]));
}

function sumAccounts(accounts) {
  return accounts.reduce((acc, a) => acc + (parseFloat(a.value) || 0), 0);
}

function getAccountValue(accounts, group, id) {
  const account = accounts[group].find((a) => a.id === id);
  return account ? parseFloat(account.value) || 0 : 0;
}

function getOtherAccountsTotal(accounts, group, excludeId) {
  return accounts[group]
    .filter((a) => a.id !== excludeId)
    .reduce((acc, a) => acc + (parseFloat(a.value) || 0), 0);
}

function accountMatches(name, ...terms) {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return terms.some((t) => n.includes(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

function resolveAccountValue(name, group, baseValue, m, dec) {
  const v = parseFloat(baseValue) || 0;

  // Se o usuário digitou um valor manual, usa o valor digitado (sobrescreve o cálculo automático)
  if (v !== 0) return v;

  if (group === 'ativoCirculante') {
    if (accountMatches(name, 'aplicação', 'aplicacao', 'aplicacoes', 'aplicações')) {
      return v * 1.1; // rendimento 10% a.a.
    }
    if (accountMatches(name, 'título', 'titulo', 'contas a receber', 'receber')) {
      return dec.receitaLiquida * (m.pmr / 30);
    }
    if (accountMatches(name, 'estoque')) {
      return dec.cmv * (m.pme / 30);
    }
  }

  if (group === 'ativoNaoCirculante') {
    if (accountMatches(name, 'imobilizado', 'máquina', 'maquina', 'equipamento', 'veículo', 'veiculo', 'frota', 'móvel', 'movel', 'instalação', 'instalacao')) {
      return v - m.depreciacao;
    }
    if (accountMatches(name, 'intangível', 'intangivel', 'software', 'patente', 'marca')) {
      return v - m.depreciacao * 0.5; // amortização simplificada
    }
  }

  if (group === 'passivoCirculante') {
    if (accountMatches(name, 'contas a pagar', 'fornecedor', 'fornecedores', 'obrigação social', 'obrigacao social', 'fgts', 'inss')) {
      return dec.cmv * (m.pmp / 30);
    }
  }

  if (group === 'passivoNaoCirculante') {
    if (accountMatches(name, 'empréstimo', 'emprestimo', 'financiamento')) {
      return v - m.despesasEmprestimos;
    }
  }

  return v;
}

function getResolvedAccountValue(accounts, group, id, m, dec) {
  const account = accounts[group].find((a) => a.id === id);
  if (!account) return 0;
  return resolveAccountValue(account.name, group, account.value, m, dec);
}

function sumResolvedAccounts(accounts, group, m, dec) {
  return accounts[group].reduce((acc, a) => acc + resolveAccountValue(a.name, group, a.value, m, dec), 0);
}

function getOtherResolvedAccountsTotal(accounts, group, excludeId, m, dec, excludeDynamic = false) {
  return accounts[group]
    .filter((a) => a.id !== excludeId && !(excludeDynamic && accountIsDynamic(a.name, group)))
    .reduce((acc, a) => acc + resolveAccountValue(a.name, group, a.value, m, dec), 0);
}

function accountIsDynamic(name, group) {
  if (group === 'ativoCirculante') {
    return accountMatches(name, 'aplicação', 'aplicacao', 'aplicacoes', 'aplicações', 'título', 'titulo', 'contas a receber', 'receber', 'estoque');
  }
  if (group === 'ativoNaoCirculante') {
    return accountMatches(name, 'imobilizado', 'máquina', 'maquina', 'equipamento', 'veículo', 'veiculo', 'frota', 'móvel', 'movel', 'instalação', 'instalacao', 'intangível', 'intangivel', 'software', 'patente', 'marca');
  }
  if (group === 'passivoCirculante') {
    return accountMatches(name, 'contas a pagar', 'fornecedor', 'fornecedores', 'obrigação social', 'obrigacao social', 'fgts', 'inss');
  }
  if (group === 'passivoNaoCirculante') {
    return accountMatches(name, 'empréstimo', 'emprestimo', 'financiamento');
  }
  return false;
}

function isDynamicAccount(name, group) {
  return accountIsDynamic(name, group);
}

function resolveAccountDescription(name, group, baseValue, m, dec) {
  const v = parseFloat(baseValue) || 0;
  if (group === 'ativoCirculante') {
    if (accountMatches(name, 'aplicação', 'aplicacao', 'aplicacoes', 'aplicações')) return 'Valor informado + rendimento de 10% ao ano.';
    if (accountMatches(name, 'título', 'titulo', 'contas a receber', 'receber')) return `Receita Líquida de dezembro × PMR ÷ 30 = ${formatCurrency(dec.receitaLiquida)} × ${m.pmr} ÷ 30`;
    if (accountMatches(name, 'estoque')) return `CMV de dezembro × PME ÷ 30 = ${formatCurrency(dec.cmv)} × ${m.pme} ÷ 30`;
  }
  if (group === 'ativoNaoCirculante') {
    if (accountMatches(name, 'imobilizado', 'máquina', 'maquina', 'equipamento', 'veículo', 'veiculo', 'frota', 'móvel', 'movel', 'instalação', 'instalacao')) return `Valor informado menos depreciação anual = ${formatCurrency(v)} − ${formatCurrency(m.depreciacao)}`;
    if (accountMatches(name, 'intangível', 'intangivel', 'software', 'patente', 'marca')) return `Valor informado menos amortização anual simplificada = ${formatCurrency(v)} − ${formatCurrency(m.depreciacao * 0.5)}.`;
  }
  if (group === 'passivoCirculante') {
    if (accountMatches(name, 'contas a pagar', 'fornecedor', 'fornecedores', 'obrigação social', 'obrigacao social', 'fgts', 'inss')) return `CMV de dezembro × PMP ÷ 30 = ${formatCurrency(dec.cmv)} × ${m.pmp} ÷ 30`;
  }
  if (group === 'passivoNaoCirculante') {
    if (accountMatches(name, 'empréstimo', 'emprestimo', 'financiamento')) return `Valor informado menos amortização simplificada dos juros = ${formatCurrency(v)} − ${formatCurrency(m.despesasEmprestimos)}`;
  }
  return 'Valor informado nas premissas do balanço.';
}

const inputs = {};
const displays = {};

const formatCurrencyMonthly = (v) => formatCurrency(v / 12);
const formatPercentView = (v) => formatPercent(v);

const inputDefs = [
  ['receitaBruta', 'valReceitaBruta', 'currency', 0, 20000000, () => viewMode === 'monthly' ? formatCurrencyMonthly(state.receitaBruta) : formatCurrency(state.receitaBruta)],
  ['deducoes', 'valDeducoes', 'percent', 0, 35, () => formatPercentView(state.deducoes)],
  ['cmvPercent', 'valCmvPercent', 'percent', 0, 90, () => formatPercentView(state.cmvPercent)],
  ['despesasFixas', 'valDespesasFixas', 'currency', 0, 8000000, () => viewMode === 'monthly' ? formatCurrencyMonthly(state.despesasFixas) : formatCurrency(state.despesasFixas)],
  ['despesasVariaveis', 'valDespesasVariaveis', 'percent', 0, 40, () => formatPercentView(state.despesasVariaveis)],
  ['despesasEmprestimos', 'valDespesasEmprestimos', 'currency', 0, 2000000, () => viewMode === 'monthly' ? formatCurrencyMonthly(state.despesasEmprestimos) : formatCurrency(state.despesasEmprestimos)],
  ['pmr', 'valPmr', 'days', 0, 180, (v) => `${v} dias`],
  ['pme', 'valPme', 'days', 0, 180, (v) => `${v} dias`],
  ['pmp', 'valPmp', 'days', 0, 180, (v) => `${v} dias`],
  ['depreciacao', 'valDepreciacao', 'currency', 0, 2000000, () => viewMode === 'monthly' ? formatCurrencyMonthly(state.depreciacao) : formatCurrency(state.depreciacao)],
  ['sazonalidade', 'valSazonalidade', 'percentSigned', -5, 10, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}% / mês`],
];

function getInputDef(key) {
  return inputDefs.find(([k]) => k === key);
}

function updateInputDisplays() {
  inputDefs.forEach(([key, displayId, type, min, max, formatter]) => {
    const input = inputs[key];
    const display = displays[key];
    if (input) input.value = formatInputByType(state[key], type);
    if (display) display.textContent = formatter(state[key]);
  });
}

function initViewToggle() {
  const btnAnnual = document.getElementById('btnViewAnnual');
  const btnMonthly = document.getElementById('btnViewMonthly');
  btnAnnual.addEventListener('click', () => {
    viewMode = 'annual';
    btnAnnual.classList.add('active');
    btnMonthly.classList.remove('active');
    updateInputDisplays();
    updateAll();
  });
  btnMonthly.addEventListener('click', () => {
    viewMode = 'monthly';
    btnMonthly.classList.add('active');
    btnAnnual.classList.remove('active');
    updateInputDisplays();
    updateAll();
  });
}

function initInputs() {
  inputDefs.forEach(([key, displayId, type, min, max, formatter]) => {
    const el = document.getElementById(key);
    const disp = document.getElementById(displayId);
    if (!el) return;
    inputs[key] = el;
    displays[key] = disp;

    el.value = formatInputByType(state[key], type);
    if (disp) disp.textContent = formatter(state[key]);

    let rawDuringEdit = '';

    el.addEventListener('focus', () => {
      rawDuringEdit = el.value;
      // Seleciona o valor para facilitar a substituição
      el.select();
    });

    el.addEventListener('input', () => {
      rawDuringEdit = el.value;
      // Durante a digitação permite caracteres livres; atualiza display com preview quando possível
      const parsed = parseInputByType(rawDuringEdit, type);
      if (!Number.isNaN(parsed) && disp) {
        const previewState = { ...state, [key]: clamp(parsed, min, max) };
        disp.textContent = formatter(previewState[key]);
      }
    });

    el.addEventListener('blur', () => {
      let parsed = parseInputByType(rawDuringEdit, type);
      if (Number.isNaN(parsed)) parsed = 0;
      parsed = clamp(parsed, min, max);
      state[key] = parsed;
      el.value = formatInputByType(parsed, type);
      if (disp) disp.textContent = formatter(parsed);
      updateAll();
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        el.blur();
      }
    });
  });
}

function calculateDRE(s = state) {
  const monthly = calculateDREMonthly(s);
  const sum = (key) => monthly.reduce((acc, m) => acc + m[key], 0);
  return {
    receitaBruta: sum('receitaBruta'),
    receitaLiquida: sum('receitaLiquida'),
    cmv: sum('cmv'),
    lucroBruto: sum('lucroBruto'),
    despesasVariaveis: sum('despesasVariaveis'),
    margemContribuicao: sum('margemContribuicao'),
    despesasFixas: sum('despesasFixas'),
    despesasOperacionais: sum('despesasOperacionais'),
    ebitda: sum('ebitda'),
    depreciacao: sum('depreciacao'),
    ebit: sum('ebit'),
    despesasEmprestimos: sum('despesasEmprestimos'),
    laIR: sum('laIR'),
    ir: sum('ir'),
    lucroLiquido: sum('lucroLiquido'),
  };
}

function calculateDREMonthly(s = state) {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const baseReceita = s.receitaBruta / 12;
  const baseDespesasFixas = s.despesasFixas / 12;
  const baseDepreciacao = s.depreciacao / 12;
  const baseDespesasEmprestimos = s.despesasEmprestimos / 12;
  return months.map((month, i) => {
    const factor = Math.pow(1 + s.sazonalidade / 100, i);
    const receitaBruta = baseReceita * factor;
    const receitaLiquida = receitaBruta * (1 - s.deducoes / 100);
    const cmv = receitaLiquida * (s.cmvPercent / 100);
    const lucroBruto = receitaLiquida - cmv;
    const despesasVariaveis = receitaLiquida * (s.despesasVariaveis / 100);
    const despesasFixas = baseDespesasFixas;
    const despesasOperacionais = despesasFixas + despesasVariaveis;
    const margemContribuicao = lucroBruto - despesasVariaveis;
    const ebitda = margemContribuicao - despesasFixas;
    const ebit = ebitda - baseDepreciacao;
    const despesasEmprestimos = baseDespesasEmprestimos;
    const laIR = ebit - despesasEmprestimos;
    const ir = Math.max(0, laIR * 0.34);
    const lucroLiquido = laIR - ir;
    return {
      month,
      receitaBruta,
      receitaLiquida,
      cmv,
      lucroBruto,
      despesasVariaveis,
      margemContribuicao,
      despesasFixas,
      despesasOperacionais,
      ebitda,
      depreciacao: baseDepreciacao,
      ebit,
      despesasEmprestimos,
      laIR,
      ir,
      lucroLiquido,
    };
  });
}

function calculateBalanco(dre, s = state) {
  const monthly = calculateBalancoMonthly(s);
  return monthly[monthly.length - 1];
}

function buildDefaultBalanceAccounts() {
  const dec = calculateDREMonthly(defaultState)[11];
  return {
    ativoCirculante: [
      { id: 'caixaInicial', name: 'Caixa Inicial', value: 500_000, type: 'fixed' },
      { id: 'contasReceber', name: 'Contas a Receber', value: 0, type: 'fixed' },
      { id: 'estoque', name: 'Estoque', value: 0, type: 'fixed' },
    ],
    ativoNaoCirculante: [
      { id: 'imobilizado', name: 'Imobilizado', value: 1_500_000, type: 'fixed' },
    ],
    passivoCirculante: [
      { id: 'fornecedores', name: 'Fornecedores', value: 0, type: 'fixed' },
      { id: 'contasPagar', name: 'Contas a Pagar', value: 0, type: 'fixed' },
    ],
    passivoNaoCirculante: [
      { id: 'emprestimos', name: 'Empréstimos', value: 1_000_000, type: 'fixed' },
    ],
    patrimonioLiquido: [
      { id: 'capitalSocial', name: 'Capital Social', value: 500_000, type: 'fixed' },
    ],
  };
}

const defaultBalanceAccounts = buildDefaultBalanceAccounts();

let balanceAccounts = cloneBalanceAccounts(defaultBalanceAccounts);

function sumManualDynamicAccounts(accounts, group, matcher, s, dec) {
  return accounts[group].reduce((acc, a) => {
    const v = parseFloat(a.value) || 0;
    if (v !== 0 && matcher(a.name)) {
      return acc + resolveAccountValue(a.name, group, a.value, s, dec);
    }
    return acc;
  }, 0);
}

function calculateBalancoMonthly(s = state, accounts = balanceAccounts) {
  const monthlyDRE = calculateDREMonthly(s);
  const daysInMonth = 30;
  const dec = monthlyDRE[monthlyDRE.length - 1];

  const caixaInicial = getResolvedAccountValue(accounts, 'ativoCirculante', 'caixaInicial', s, dec);
  const outrasAtivoCirculante = getOtherResolvedAccountsTotal(accounts, 'ativoCirculante', 'caixaInicial', s, dec, true);
  const totalAtivoNaoCirculanteInformado = sumResolvedAccounts(accounts, 'ativoNaoCirculante', s, dec);
  const ativoNaoCirculanteContasMensais = {};
  accounts.ativoNaoCirculante.forEach((a) => {
    const v = resolveAccountValue(a.name, 'ativoNaoCirculante', a.value, s, dec);
    ativoNaoCirculanteContasMensais[a.id] = new Array(monthlyDRE.length).fill(v);
  });
  const passivoCirculanteDinamicas = accounts.passivoCirculante.filter((a) => accountIsDynamic(a.name, 'passivoCirculante'));
  const passivoCirculanteNaoDinamicas = accounts.passivoCirculante.filter((a) => !accountIsDynamic(a.name, 'passivoCirculante'));
  const totalPassivoCirculanteNaoDinamico = passivoCirculanteNaoDinamicas.reduce(
    (acc, a) => acc + resolveAccountValue(a.name, 'passivoCirculante', a.value, s, dec),
    0
  );
  const totalPassivoCirculanteInformado = totalPassivoCirculanteNaoDinamico;
  const totalPassivoNaoCirculanteInformado = sumResolvedAccounts(accounts, 'passivoNaoCirculante', s, dec);
  const totalPatrimonioLiquidoInformado = sumResolvedAccounts(accounts, 'patrimonioLiquido', s, dec);

  // Valores manuais para contas dinâmicas (sobrescrevem o cálculo automático no mês 0)
  const manualContasReceber = sumManualDynamicAccounts(
    accounts,
    'ativoCirculante',
    (name) => accountMatches(name, 'título', 'titulo', 'contas a receber', 'receber'),
    s,
    dec
  );
  const manualEstoque = sumManualDynamicAccounts(
    accounts,
    'ativoCirculante',
    (name) => accountMatches(name, 'estoque'),
    s,
    dec
  );
  const manualContasPagar = sumManualDynamicAccounts(
    accounts,
    'passivoCirculante',
    (name) => accountMatches(name, 'contas a pagar', 'fornecedor', 'fornecedores', 'obrigação social', 'obrigacao social', 'fgts', 'inss'),
    s,
    dec
  );

  // Prepara vetores mensais para contas dinâmicas operacionais
  const contasReceberMensal = monthlyDRE.map((m, i) =>
    i === 0 && manualContasReceber > 0 ? manualContasReceber : m.receitaLiquida * (s.pmr / daysInMonth)
  );
  const estoqueMensal = monthlyDRE.map((m, i) =>
    i === 0 && manualEstoque > 0 ? manualEstoque : m.cmv * (s.pme / daysInMonth)
  );
  const contasPagarMensal = monthlyDRE.map((m, i) =>
    i === 0 && manualContasPagar > 0 ? manualContasPagar : m.cmv * (s.pmp / daysInMonth)
  );
  const ncgMensal = contasReceberMensal.map((cr, i) => cr + estoqueMensal[i] - contasPagarMensal[i]);

  // Distribui o valor dinâmico do passivo circulante entre as contas dinâmicas proporcionalmente aos valores informados
  const totalManualDinamico = passivoCirculanteDinamicas.reduce((acc, a) => acc + (parseFloat(a.value) || 0), 0);
  const dynamicWeights = passivoCirculanteDinamicas.map((a) =>
    totalManualDinamico > 0 ? (parseFloat(a.value) || 0) / totalManualDinamico : (passivoCirculanteDinamicas.length > 0 ? 1 / passivoCirculanteDinamicas.length : 0)
  );
  const passivoCirculanteContasMensais = {};
  passivoCirculanteDinamicas.forEach((a, idx) => {
    passivoCirculanteContasMensais[a.id] = contasPagarMensal.map((total) => total * dynamicWeights[idx]);
  });
  passivoCirculanteNaoDinamicas.forEach((a) => {
    const v = resolveAccountValue(a.name, 'passivoCirculante', a.value, s, dec);
    passivoCirculanteContasMensais[a.id] = new Array(monthlyDRE.length).fill(v);
  });

  const caixaMensal = new Array(monthlyDRE.length).fill(0);
  caixaMensal[0] = caixaInicial;
  for (let i = 1; i < monthlyDRE.length; i++) {
    caixaMensal[i] = caixaMensal[i - 1] + monthlyDRE[i].lucroLiquido - (ncgMensal[i] - ncgMensal[i - 1]);
  }

  const lucroLiquidoAcumuladoMensal = monthlyDRE.map((_, i) =>
    monthlyDRE.slice(0, i + 1).reduce((acc, x) => acc + x.lucroLiquido, 0)
  );

  const outrosAtivosMensal = new Array(monthlyDRE.length).fill(0);
  const outrosPassivosMensal = new Array(monthlyDRE.length).fill(0);
  const ativoNaoCirculanteMensal = new Array(monthlyDRE.length).fill(0);
  const passivoNaoCirculanteMensal = new Array(monthlyDRE.length).fill(0);
  const passivoCirculanteMensal = new Array(monthlyDRE.length).fill(0);
  const patrimonioLiquidoMensal = new Array(monthlyDRE.length).fill(0);
  const totalPassivoPLMensal = new Array(monthlyDRE.length).fill(0);
  const ativoCirculanteMensal = new Array(monthlyDRE.length).fill(0);
  const ativoTotalMensal = new Array(monthlyDRE.length).fill(0);

  for (let i = 0; i < monthlyDRE.length; i++) {
    const lucrosAcumulados = lucroLiquidoAcumuladoMensal[i];

    const passivoCirculante = contasPagarMensal[i] + totalPassivoCirculanteNaoDinamico;
    const patrimonioLiquido = totalPatrimonioLiquidoInformado + lucrosAcumulados;

    // Ativo real sem as contas residuais (Outros Ativos / Outros Passivos)
    const ativoReal = caixaMensal[i] + contasReceberMensal[i] + estoqueMensal[i] + outrasAtivoCirculante + totalAtivoNaoCirculanteInformado;
    // Passivo + PL real sem a conta residual de Outros Passivos
    const passivoPLReal = passivoCirculante + totalPassivoNaoCirculanteInformado + patrimonioLiquido;

    const diferenca = ativoReal - passivoPLReal;
    const outrosAtivos = Math.max(0, -diferenca);
    const outrosPassivos = Math.max(0, diferenca);

    const ativoNaoCirculante = totalAtivoNaoCirculanteInformado + outrosAtivos;
    const passivoNaoCirculante = totalPassivoNaoCirculanteInformado + outrosPassivos;
    const totalPassivoPL = passivoCirculante + passivoNaoCirculante + patrimonioLiquido;
    const ativoCirculante = caixaMensal[i] + contasReceberMensal[i] + estoqueMensal[i] + outrasAtivoCirculante;
    const ativoTotal = ativoCirculante + ativoNaoCirculante;

    outrosAtivosMensal[i] = outrosAtivos;
    outrosPassivosMensal[i] = outrosPassivos;
    ativoNaoCirculanteMensal[i] = ativoNaoCirculante;
    passivoNaoCirculanteMensal[i] = passivoNaoCirculante;
    passivoCirculanteMensal[i] = passivoCirculante;
    patrimonioLiquidoMensal[i] = patrimonioLiquido;
    totalPassivoPLMensal[i] = totalPassivoPL;
    ativoCirculanteMensal[i] = ativoCirculante;
    ativoTotalMensal[i] = ativoTotal;
  }

  return monthlyDRE.map((m, i) => ({
    month: m.month,
    caixa: caixaMensal[i],
    contasReceber: contasReceberMensal[i],
    estoque: estoqueMensal[i],
    outrasAtivoCirculante,
    ativoCirculante: ativoCirculanteMensal[i],
    ativoNaoCirculante: ativoNaoCirculanteMensal[i],
    ativoNaoCirculanteContas: ativoNaoCirculanteContasMensais,
    outrosAtivos: outrosAtivosMensal[i],
    ativoTotal: ativoTotalMensal[i],
    contasPagar: contasPagarMensal[i],
    outrasObrigacoes: totalPassivoCirculanteNaoDinamico,
    passivoCirculanteContas: passivoCirculanteContasMensais,
    passivoCirculante: passivoCirculanteMensal[i],
    passivoNaoCirculante: passivoNaoCirculanteMensal[i],
    outrosPassivos: outrosPassivosMensal[i],
    patrimonioLiquidoInformado: totalPatrimonioLiquidoInformado,
    lucrosAcumulados: lucroLiquidoAcumuladoMensal[i],
    lucrosAcumuladosIniciais: 0,
    patrimonioLiquido: patrimonioLiquidoMensal[i],
    totalPassivoPL: totalPassivoPLMensal[i],
  }));
}

function calculateGiro(balanco, s = state) {
  const ccc = s.pme + s.pmr - s.pmp;
  const aco = balanco.contasReceber + balanco.estoque;
  const pco = balanco.contasPagar;
  const ncg = aco - pco;
  const cdg = balanco.caixa + balanco.outrasObrigacoes;
  const tesouraria = cdg - ncg;
  return { ccc, aco, pco, ncg, cdg, tesouraria };
}

function safeDiv(n, d) {
  return d === 0 ? 0 : n / d;
}

function evaluateKpi(value, thresholds) {
  if (value >= thresholds.healthy) return 'healthy';
  if (value >= thresholds.warning) return 'warning';
  return 'critical';
}

function evaluateKpiLow(value, thresholds) {
  if (value <= thresholds.healthy) return 'healthy';
  if (value <= thresholds.warning) return 'warning';
  return 'critical';
}

function calculateKPIs(dre, balanco, giro) {
  return [
    {
      group: 'Rentabilidade',
      items: [
        {
          id: 'margemBruta',
          name: 'Margem Bruta',
          value: safeDiv(dre.lucroBruto, dre.receitaLiquida),
          format: 'percent',
          formula: 'Lucro Bruto ÷ Receita Líquida',
          desc: 'Quanto da receita sobra após o custo direto.',
          eval: (v) => evaluateKpi(v, { healthy: 0.30, warning: 0.15 }),
        },
        {
          id: 'margemEbitda',
          name: 'Margem EBITDA',
          value: safeDiv(dre.ebitda, dre.receitaLiquida),
          format: 'percent',
          formula: 'EBITDA ÷ Receita Líquida',
          desc: 'Geração de caixa operacional por real de receita.',
          eval: (v) => evaluateKpi(v, { healthy: 0.25, warning: 0.10 }),
        },
        {
          id: 'margemLiquida',
          name: 'Margem Líquida',
          value: safeDiv(dre.lucroLiquido, dre.receitaLiquida),
          format: 'percent',
          formula: 'Lucro Líquido ÷ Receita Líquida',
          desc: 'Resultado final em relação à receita.',
          eval: (v) => evaluateKpi(v, { healthy: 0.10, warning: 0.03 }),
        },
        {
          id: 'roe',
          name: 'ROE',
          value: safeDiv(dre.lucroLiquido, balanco.patrimonioLiquido),
          format: 'percent',
          formula: 'Lucro Líquido ÷ Patrimônio Líquido',
          desc: 'Retorno sobre o capital dos sócios.',
          eval: (v) => evaluateKpi(v, { healthy: 0.15, warning: 0.05 }),
        },
        {
          id: 'roa',
          name: 'ROA',
          value: safeDiv(dre.lucroLiquido, balanco.ativoTotal),
          format: 'percent',
          formula: 'Lucro Líquido ÷ Ativo Total',
          desc: 'Retorno sobre todos os recursos aplicados.',
          eval: (v) => evaluateKpi(v, { healthy: 0.08, warning: 0.03 }),
        },
      ],
    },
    {
      group: 'Liquidez',
      items: [
        {
          id: 'liquidezCorrente',
          name: 'Liquidez Corrente',
          value: safeDiv(balanco.ativoCirculante, balanco.passivoCirculante),
          format: 'ratio',
          formula: 'Ativo Circulante ÷ Passivo Circulante',
          desc: 'Capacidade de honrar obrigações de curto prazo.',
          eval: (v) => evaluateKpi(v, { healthy: 1.5, warning: 1.0 }),
        },
        {
          id: 'liquidezSeca',
          name: 'Liquidez Seca',
          value: safeDiv(balanco.ativoCirculante - balanco.estoque, balanco.passivoCirculante),
          format: 'ratio',
          formula: '(Ativo Circulante − Estoque) ÷ Passivo Circulante',
          desc: 'Liquidez sem considerar estoque, que é menos conversível.',
          eval: (v) => evaluateKpi(v, { healthy: 1.0, warning: 0.7 }),
        },
        {
          id: 'liquidezImediata',
          name: 'Liquidez Imediata',
          value: safeDiv(balanco.caixa, balanco.passivoCirculante),
          format: 'ratio',
          formula: 'Caixa ÷ Passivo Circulante',
          desc: 'Quanto do passivo circulante pode ser pago com caixa disponível.',
          eval: (v) => evaluateKpi(v, { healthy: 0.3, warning: 0.1 }),
        },
      ],
    },
    {
      group: 'Endividamento',
      items: [
        {
          id: 'endividamentoGeral',
          name: 'Endividamento Geral',
          value: safeDiv(balanco.passivoCirculante + balanco.passivoNaoCirculante, balanco.patrimonioLiquido),
          format: 'ratio',
          formula: '(Passivo Circulante + Passivo Não Circulante) ÷ Patrimônio Líquido',
          desc: 'Relação entre dívida total e capital próprio.',
          eval: (v) => evaluateKpiLow(v, { healthy: 0.5, warning: 1.0 }),
        },
        {
          id: 'endividamentoCurtoPrazo',
          name: 'Endividamento de Curto Prazo',
          value: safeDiv(balanco.passivoCirculante, balanco.patrimonioLiquido),
          format: 'ratio',
          formula: 'Passivo Circulante ÷ Patrimônio Líquido',
          desc: 'Pressão de curto prazo sobre o patrimônio líquido.',
          eval: (v) => evaluateKpiLow(v, { healthy: 0.3, warning: 0.6 }),
        },
        {
          id: 'coberturaJuros',
          name: 'Cobertura de Juros',
          value: safeDiv(dre.ebit, dre.despesasEmprestimos),
          format: 'multiple',
          formula: 'EBIT ÷ Despesas com Empréstimos',
          desc: 'Quantas vezes o lucro operacional cobre os juros.',
          eval: (v) => evaluateKpi(v, { healthy: 3.0, warning: 1.5 }),
        },
      ],
    },
    {
      group: 'Rotatividade / Eficiência',
      items: [
        {
          id: 'giroAtivo',
          name: 'Giro do Ativo',
          value: safeDiv(dre.receitaLiquida, balanco.ativoTotal),
          format: 'multiple',
          formula: 'Receita Líquida ÷ Ativo Total',
          desc: 'Eficiência em gerar receita com o ativo total.',
          eval: (v) => evaluateKpi(v, { healthy: 1.0, warning: 0.5 }),
        },
        {
          id: 'rotatividadeEstoque',
          name: 'Rotatividade de Estoque',
          value: safeDiv(dre.cmv, balanco.estoque),
          format: 'multiple',
          formula: 'CMV ÷ Estoque',
          desc: 'Quantas vezes o estoque gira no ano.',
          eval: (v) => evaluateKpi(v, { healthy: 6.0, warning: 3.0 }),
        },
        {
          id: 'prazoMedioEstoque',
          name: 'Prazo Médio de Estoque',
          value: state.pme,
          format: 'days',
          formula: 'PME',
          desc: 'Dias médios que a mercadoria fica parada em estoque.',
          eval: () => 'info',
        },
        {
          id: 'prazoMedioRecebimento',
          name: 'Prazo Médio de Recebimento',
          value: state.pmr,
          format: 'days',
          formula: 'PMR',
          desc: 'Dias médios para receber de clientes.',
          eval: () => 'info',
        },
        {
          id: 'prazoMedioPagamento',
          name: 'Prazo Médio de Pagamento',
          value: state.pmp,
          format: 'days',
          formula: 'PMP',
          desc: 'Dias médios para pagar fornecedores.',
          eval: () => 'info',
        },
        {
          id: 'cccKpi',
          name: 'Ciclo de Conversão de Caixa',
          value: giro.ccc,
          format: 'days',
          formula: 'PME + PMR − PMP',
          desc: 'Tempo que o dinheiro fica preso no ciclo operacional.',
          eval: (v) => evaluateKpiLow(v, { healthy: 30, warning: 60 }),
        },
      ],
    },
    {
      group: 'Capital de Giro',
      items: [
        {
          id: 'ncgReceita',
          name: 'NCG / Receita Líquida',
          value: safeDiv(giro.ncg, dre.receitaLiquida),
          format: 'percent',
          formula: 'NCG ÷ Receita Líquida',
          desc: 'Quanto da receita fica preso na necessidade de giro.',
          eval: (v) => evaluateKpiLow(v, { healthy: 0.15, warning: 0.25 }),
        },
        {
          id: 'tesourariaReceita',
          name: 'Tesouraria / Receita Líquida',
          value: safeDiv(giro.tesouraria, dre.receitaLiquida),
          format: 'percent',
          formula: 'Tesouraria ÷ Receita Líquida',
          desc: 'Folga ou déficit de caixa em relação à receita.',
          eval: (v) => evaluateKpi(v, { healthy: 0.05, warning: 0.0 }),
        },
        {
          id: 'cdgNcg',
          name: 'CDG / NCG',
          value: safeDiv(giro.cdg, giro.ncg),
          format: 'ratio',
          formula: 'CDG ÷ NCG',
          desc: 'Quanto o capital disponível cobre a necessidade de giro.',
          eval: (v) => evaluateKpi(v, { healthy: 1.5, warning: 1.0 }),
        },
      ],
    },
  ];
}

function formatKpiValue(item) {
  if (item.value === null || Number.isNaN(item.value)) return '—';
  switch (item.format) {
    case 'percent':
      return formatPercent(item.value * 100);
    case 'ratio':
      return item.value.toFixed(2).replace('.', ',');
    case 'multiple':
      return `${item.value.toFixed(1).replace('.', ',')}x`;
    case 'days':
      return `${item.value} dias`;
    default:
      return item.value.toString();
  }
}

function renderKPIs(kpiGroups) {
  const tbody = document.querySelector('#kpisTable tbody');
  if (!tbody) return;

  const rows = [];
  kpiGroups.forEach((group) => {
    group.items.forEach((item, index) => {
      const status = item.eval ? item.eval(item.value) : 'info';
      const statusClass = `kpi-status ${status}`;
      const statusLabel = {
        healthy: 'Saudável',
        warning: 'Atenção',
        critical: 'Crítico',
        info: 'Informativo',
      }[status];
      rows.push(`
        <tr>
          ${index === 0 ? `<td class="kpi-group" rowspan="${group.items.length}">${group.group}</td>` : ''}
          <td class="kpi-name"><strong>${item.name}</strong></td>
          <td class="kpi-value"><span class="${statusClass}">${formatKpiValue(item)}</span></td>
          <td class="kpi-formula">
            <div class="kpi-formula-text">${item.formula}</div>
            <div class="kpi-desc">${item.desc}</div>
            <span class="kpi-status-label ${statusClass}">${statusLabel}</span>
          </td>
        </tr>
      `);
    });
  });
  tbody.innerHTML = rows.join('');

  const legend = document.getElementById('kpisLegend');
  if (legend) {
    legend.innerHTML = `
      <span class="kpi-status healthy">Saudável</span>
      <span class="kpi-status warning">Atenção</span>
      <span class="kpi-status critical">Crítico</span>
      <span class="kpi-status info">Informativo</span>
    `;
  }
}

function updateKPIsFeedback(kpiGroups) {
  const el = document.querySelector('#feedbackKpis');
  if (!el) return;
  const span = el.querySelector('span');
  if (!span) return;

  const allItems = kpiGroups.flatMap((g) => g.items);
  const critical = allItems.filter((i) => i.eval && i.eval(i.value) === 'critical').length;
  const warning = allItems.filter((i) => i.eval && i.eval(i.value) === 'warning').length;

  if (critical > 0) {
    el.className = 'card feedback critical';
    span.textContent = `${critical} indicador(es) está(ão) em zona crítica. Revenda prazos, custos ou estrutura de capital.`;
  } else if (warning > 0) {
    el.className = 'card feedback warning';
    span.textContent = `${warning} indicador(es) está(ão) em atenção. Ajustes operacionais podem melhorar a saúde financeira.`;
  } else {
    el.className = 'card feedback';
    span.textContent = 'Todos os indicadores monitorados estão em zona saudável. Boa performance financeira.';
  }
}

function calculateKPIsMonthly(s = state) {
  const monthlyDRE = calculateDREMonthly(s);
  const monthlyBalanco = calculateBalancoMonthly(s);

  return monthlyDRE.map((m, i) => {
    const b = monthlyBalanco[i];
    const ncg = b.contasReceber + b.estoque - b.contasPagar;
    const cdg = b.caixa + b.outrasObrigacoes;
    const tesouraria = cdg - ncg;
    const ccc = s.pme + s.pmr - s.pmp;

    const lucroLiquidoAcumulado = monthlyDRE.slice(0, i + 1).reduce((acc, x) => acc + x.lucroLiquido, 0);
    const ebitAcumulado = monthlyDRE.slice(0, i + 1).reduce((acc, x) => acc + x.ebit, 0);
    const despesasEmprestimosAcumulado = monthlyDRE.slice(0, i + 1).reduce((acc, x) => acc + x.despesasEmprestimos, 0);
    const patrimonioLiquido = b.patrimonioLiquido;
    const ativoTotal = b.ativoTotal;

    return {
      month: m.month,
      margemBruta: safeDiv(m.lucroBruto, m.receitaLiquida),
      margemEbitda: safeDiv(m.ebitda, m.receitaLiquida),
      margemLiquida: safeDiv(m.lucroLiquido, m.receitaLiquida),
      roe: safeDiv(lucroLiquidoAcumulado, patrimonioLiquido),
      roa: safeDiv(lucroLiquidoAcumulado, ativoTotal),
      liquidezCorrente: safeDiv(b.ativoCirculante, b.passivoCirculante),
      liquidezSeca: safeDiv(b.ativoCirculante - b.estoque, b.passivoCirculante),
      liquidezImediata: safeDiv(b.caixa, b.passivoCirculante),
      coberturaJuros: safeDiv(ebitAcumulado, despesasEmprestimosAcumulado),
      giroAtivo: safeDiv(m.receitaLiquida, ativoTotal),
      rotatividadeEstoque: safeDiv(m.cmv, b.estoque),
      ncgValor: ncg,
      tesourariaValor: tesouraria,
      cdgNcg: safeDiv(cdg, ncg),
      pmr: s.pmr,
      pme: s.pme,
      pmp: s.pmp,
      ccc,
    };
  });
}

function renderMonthlyKPIs() {
  const monthly = calculateKPIsMonthly();
  const head = document.querySelector('#monthlyKpisTable thead');
  const tbody = document.querySelector('#monthlyKpisTable tbody');
  if (!head || !tbody) return;

  head.innerHTML = `<tr><th>Descrição</th>${monthly.map((m) => `<th>${m.month}</th>`).join('')}</tr>`;

  const rowDefs = [
    { key: 'margemBruta', label: 'Margem Bruta', cls: 'pos', fmt: 'percent' },
    { key: 'margemEbitda', label: 'Margem EBITDA', cls: 'pos', fmt: 'percent' },
    { key: 'margemLiquida', label: 'Margem Líquida', cls: 'total', fmt: 'percent' },
    { key: 'roe', label: 'ROE (acumulado)', cls: 'pos', fmt: 'percent' },
    { key: 'roa', label: 'ROA (acumulado)', cls: 'pos', fmt: 'percent' },
    { key: 'liquidezCorrente', label: 'Liquidez Corrente', cls: 'pos', fmt: 'ratio' },
    { key: 'liquidezSeca', label: 'Liquidez Seca', cls: 'pos', fmt: 'ratio' },
    { key: 'liquidezImediata', label: 'Liquidez Imediata', cls: 'pos', fmt: 'ratio' },
    { key: 'coberturaJuros', label: 'Cobertura de Juros', cls: 'pos', fmt: 'multiple' },
    { key: 'giroAtivo', label: 'Giro do Ativo', cls: 'pos', fmt: 'multiple' },
    { key: 'rotatividadeEstoque', label: 'Rotatividade de Estoque', cls: 'pos', fmt: 'multiple' },
    { key: 'pme', label: 'PME (dias)', cls: 'sub', fmt: 'days' },
    { key: 'ncgValor', label: 'NCG (R$)', cls: 'neg', fmt: 'currency' },
    { key: 'tesourariaValor', label: 'Tesouraria (R$)', cls: 'pos', fmt: 'currency' },
    { key: 'cdgNcg', label: 'CDG / NCG', cls: 'pos', fmt: 'ratio' },
    { key: 'pmr', label: 'PMR (dias)', cls: 'sub', fmt: 'days' },
    { key: 'pmp', label: 'PMP (dias)', cls: 'sub', fmt: 'days' },
    { key: 'ccc', label: 'CCC (dias)', cls: 'sub', fmt: 'days' },
  ];

  const fmtValue = (v, fmt) => {
    if (v === null || Number.isNaN(v)) return '—';
    if (fmt === 'currency') return formatCurrency(v);
    if (fmt === 'percent') return formatPercent(v * 100);
    if (fmt === 'ratio') return v.toFixed(2).replace('.', ',');
    if (fmt === 'multiple') return `${v.toFixed(1).replace('.', ',')}x`;
    if (fmt === 'days') return `${v}d`;
    return v.toString();
  };

  tbody.innerHTML = rowDefs
    .map((r) => {
      const monthlyValues = monthly.map((m) => `<td>${fmtValue(m[r.key], r.fmt)}</td>`).join('');
      return `<tr class="${r.cls}"><td>${r.label}</td>${monthlyValues}</tr>`;
    })
    .join('');
}

function projectCash(s = state) {
  return calculateBalancoMonthly(s).map((m, i) => ({ month: i + 1, caixa: m.caixa }));
}

function renderDreTable(tableId, indicatorsId, dre, divisor) {
  const rows = [
    ['Receita Bruta', dre.receitaBruta / divisor, 'pos', 'Faturamento total antes de deduções e impostos.', ''],
    ['(−) Deduções/Impostos', (-dre.receitaBruta + dre.receitaLiquida) / divisor, 'neg', 'ICMS, PIS/COFINS, IPI, devoluções e descontos.', ''],
    ['Receita Líquida', dre.receitaLiquida / divisor, 'total', 'Valor efetivo gerado por vendas.', 'Receita Líquida'],
    ['(−) CMV', -dre.cmv / divisor, 'neg', 'Custo da mercadoria vendida ou custo dos serviços prestados.', 'CMV'],
    ['Lucro Bruto', dre.lucroBruto / divisor, 'sub', 'Receita líquida menos custos.', 'Lucro Bruto'],
    ['(−) Despesas Variáveis', -dre.despesasVariaveis / divisor, 'neg', 'Despesas que variam com a receita.', ''],
    ['Margem de Contribuição', dre.margemContribuicao / divisor, 'sub', 'Lucro bruto menos despesas variáveis.', ''],
    ['(−) Despesas Operacionais Fixas', -dre.despesasFixas / divisor, 'neg', 'Despesas fixas do dia a dia.', ''],
    ['EBITDA', dre.ebitda / divisor, 'sub', 'Resultado operacional antes de depreciação e impostos.', 'EBITDA'],
    ['(−) Depreciação', -dre.depreciacao / divisor, 'neg', 'Custo do desgaste de ativos imobilizados.', ''],
    ['EBIT', dre.ebit / divisor, 'sub', 'Lucro operacional antes de juros e impostos.', 'EBIT'],
    ['(−) Despesas com Juros', -dre.despesasEmprestimos / divisor, 'neg', 'Juros e encargos financeiros.', ''],
    ['LAIR', dre.laIR / divisor, 'sub', 'Lucro antes do Imposto de Renda.', 'LAIR'],
    ['(−) IR/CSLL', -dre.ir / divisor, 'neg', 'Tributos sobre o lucro.', ''],
    ['Lucro Líquido', dre.lucroLiquido / divisor, 'total', 'Resultado final disponível para os acionistas.', 'Lucro Líquido'],
  ];

  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = rows
    .map(([name, value, cls, tip, term]) => {
      const isTotal = cls === 'total';
      const className = isTotal ? 'total' : cls === 'sub' ? '' : cls;
      const displayName = term ? `<span class="term" data-term="${term}">${name}</span>` : name;
      return `<tr class="${className}" title="${tip}"><td>${displayName}</td><td>${formatCurrency(value)}</td></tr>`;
    })
    .join('');

  const margemBruta = (dre.lucroBruto / dre.receitaLiquida) * 100;
  const margemContribuicao = (dre.margemContribuicao / dre.receitaLiquida) * 100;
  const margemEbitda = (dre.ebitda / dre.receitaLiquida) * 100;
  const margemLiquida = (dre.lucroLiquido / dre.receitaLiquida) * 100;

  document.getElementById(indicatorsId).innerHTML = `
    <div class="indicator"><span class="label">Margem Bruta</span><span class="value">${margemBruta.toFixed(1).replace('.', ',')}%</span></div>
    <div class="indicator"><span class="label">Margem de Contribuição</span><span class="value">${margemContribuicao.toFixed(1).replace('.', ',')}%</span></div>
    <div class="indicator"><span class="label">Margem EBITDA</span><span class="value">${margemEbitda.toFixed(1).replace('.', ',')}%</span></div>
    <div class="indicator"><span class="label">Margem Líquida</span><span class="value">${margemLiquida.toFixed(1).replace('.', ',')}%</span></div>
  `;
}

function updateDRE() {
  const dre = calculateDRE();
  renderDreTable('dreTable', 'dreIndicators', dre, 1);
  initInlineTooltips();
  renderWaterfall(dre);
  renderMonthlyTable();
  renderCompareDRE(dre);
}

function renderWaterfall(dre) {
  const divisor = viewMode === 'monthly' ? 12 : 1;
  const items = [
    ['Receita Líquida', dre.receitaLiquida / divisor, 'pos'],
    ['CMV', -dre.cmv / divisor, 'neg'],
    ['Desp. Var.', -dre.despesasVariaveis / divisor, 'neg'],
    ['Desp. Fixas', -dre.despesasFixas / divisor, 'neg'],
    ['Deprec.', -dre.depreciacao / divisor, 'neg'],
    ['Juros', -dre.despesasEmprestimos / divisor, 'neg'],
    ['LAIR', dre.laIR / divisor, 'sub'],
    ['IR/CSLL', -dre.ir / divisor, 'neg'],
    ['Lucro Líquido', dre.lucroLiquido / divisor, 'total'],
  ];

  const maxVal = Math.max(dre.receitaLiquida / divisor, ...items.map((i) => Math.abs(i[1])));
  const container = document.getElementById('dreWaterfall');
  container.innerHTML = items
    .map(([label, value, cls]) => {
      const height = Math.max(4, (Math.abs(value) / maxVal) * 260);
      const color = cls === 'total' ? 'total' : value >= 0 ? 'pos' : 'neg';
      return `
        <div class="waterfall-item">
          <div class="waterfall-bar ${color}" style="height:${height}px">
            <span class="waterfall-value">${formatCurrency(value)}</span>
          </div>
          <div class="waterfall-label">${label}</div>
        </div>`;
    })
    .join('');
}

function renderCompareDRE(dre) {
  const container = document.getElementById('compareDre');
  if (!savedScenario) {
    container.innerHTML = '<p class="hint">Salve um cenário no Painel de Premissas para comparar.</p>';
    return;
  }
  const old = calculateDRE(savedScenario);
  const metrics = [
    ['Receita Líquida', 'receitaLiquida'],
    ['Lucro Bruto', 'lucroBruto'],
    ['EBITDA', 'ebitda'],
    ['Lucro Líquido', 'lucroLiquido'],
  ];
  container.innerHTML = metrics
    .map(([label, key]) => {
      const a = old[key];
      const b = dre[key];
      const diff = b - a;
      const pct = a !== 0 ? ((diff / a) * 100).toFixed(1).replace('.', ',') : '0,0';
      const color = diff >= 0 ? 'var(--success)' : 'var(--danger)';
      return `
        <div class="compare-item">
          <div class="label">${label}</div>
          <div class="values">
            <span>${formatCurrency(a)}</span>
            <span>→</span>
            <span>${formatCurrency(b)}</span>
          </div>
          <div style="color:${color};font-weight:700;font-size:0.85rem;margin-top:4px">
            ${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct}%)
          </div>
        </div>`;
    })
    .join('');
}

function updateBalanco() {
  const dre = calculateDRE();
  const b = calculateBalanco(dre);
  const dec = calculateDREMonthly()[11];

  const ativoCirculanteContas = balanceAccounts.ativoCirculante
    .filter((acc) => acc.id !== 'caixaInicial' && !accountIsDynamic(acc.name, 'ativoCirculante'))
    .map((acc) => [acc.name, getResolvedAccountValue(balanceAccounts, 'ativoCirculante', acc.id, state, dec), acc.id, resolveAccountDescription(acc.name, 'ativoCirculante', acc.value, state, dec)]);
  const ativoNaoCirculanteContas = balanceAccounts.ativoNaoCirculante.map((acc) => [acc.name, getResolvedAccountValue(balanceAccounts, 'ativoNaoCirculante', acc.id, state, dec), acc.id, resolveAccountDescription(acc.name, 'ativoNaoCirculante', acc.value, state, dec)]);
  const passivoCirculanteDinamicas = balanceAccounts.passivoCirculante.filter((acc) => accountIsDynamic(acc.name, 'passivoCirculante'));
  const passivoCirculanteNaoDinamicas = balanceAccounts.passivoCirculante.filter((acc) => !accountIsDynamic(acc.name, 'passivoCirculante'));
  const passivoNaoCirculanteContas = balanceAccounts.passivoNaoCirculante.map((acc) => [acc.name, getResolvedAccountValue(balanceAccounts, 'passivoNaoCirculante', acc.id, state, dec), acc.id, resolveAccountDescription(acc.name, 'passivoNaoCirculante', acc.value, state, dec)]);
  const patrimonioLiquidoContas = balanceAccounts.patrimonioLiquido.map((acc) => [acc.name, getResolvedAccountValue(balanceAccounts, 'patrimonioLiquido', acc.id, state, dec), acc.id, resolveAccountDescription(acc.name, 'patrimonioLiquido', acc.value, state, dec)]);

  const ativoItems = [
    ['Caixa', b.caixa, 'caixa', 'Saldo de caixa de fechamento de dezembro. Calculado como resíduo para garantir Ativo = Passivo + PL.'],
    ['Contas a Receber', b.contasReceber, 'receber', `Receita Líquida de dezembro × PMR ÷ 30 = ${formatCurrency(dec.receitaLiquida)} × ${state.pmr} ÷ 30`],
    ['Estoque', b.estoque, 'estoque', `CMV de dezembro × PME ÷ 30 = ${formatCurrency(dec.cmv)} × ${state.pme} ÷ 30`],
    ...ativoCirculanteContas,
  ];
  const anItems = [
    ...ativoNaoCirculanteContas,
    ['Outros Ativos', b.outrosAtivos, 'outrosAtivos', 'Conta residual para fechar o balanço quando o ativo informado é menor que o passivo + PL.'],
  ];

  renderBlock('#ativoCirculante .block-items', ativoItems, 'A');
  renderBlock('#ativoNaoCirculante .block-items', anItems, 'A');
  document.getElementById('totalAtivo').textContent = `Total Ativo: ${formatCurrency(b.ativoTotal)}`;

  const passivoItems = [
    ...(passivoCirculanteDinamicas.length > 0
      ? passivoCirculanteDinamicas.map((acc) => [
          acc.name,
          b.passivoCirculanteContas[acc.id][11],
          acc.id,
          resolveAccountDescription(acc.name, 'passivoCirculante', acc.value, state, dec),
        ])
      : [['Contas a Pagar', b.contasPagar, 'pagar', `CMV de dezembro × PMP ÷ 30 = ${formatCurrency(dec.cmv)} × ${state.pmp} ÷ 30`]]),
    ...passivoCirculanteNaoDinamicas.map((acc) => [acc.name, getResolvedAccountValue(balanceAccounts, 'passivoCirculante', acc.id, state, dec), acc.id, resolveAccountDescription(acc.name, 'passivoCirculante', acc.value, state, dec)]),
  ];
  const pnpItems = [
    ...passivoNaoCirculanteContas,
    ['Outros Passivos', b.outrosPassivos, 'outrosPassivos', 'Conta residual para fechar o balanço quando o ativo informado é maior que o passivo + PL.'],
  ];
  const plItems = [
    ...patrimonioLiquidoContas,
    ['Resultado do Exercício', b.lucrosAcumulados, 'la', 'Lucro Líquido acumulado do exercício.'],
  ];

  renderBlock('#passivoCirculante .block-items', passivoItems, 'P');
  renderBlock('#passivoNaoCirculante .block-items', pnpItems, 'P');
  renderBlock('#patrimonioLiquido .block-items', plItems, 'P');
  document.getElementById('totalPassivoPL').textContent = `Total Passivo + PL: ${formatCurrency(b.totalPassivoPL)}`;

  if (selectedTrace) {
    showTrace(selectedTrace);
  }

  renderMonthlyBalanco();
}

function renderBlock(selector, items, side) {
  const container = document.querySelector(selector);
  container.innerHTML = items
    .map(([name, value, key, desc]) => {
      const negative = value < 0;
      return `
        <div class="block-item" data-side="${side}" data-key="${key}" data-desc="${desc.replace(/"/g, '&quot;')}" data-name="${name}">
          <span class="name">${name}</span>
          <span class="value" style="color:${negative ? 'var(--danger)' : 'inherit'}">${formatCurrency(value)}</span>
        </div>`;
    })
    .join('');

  container.querySelectorAll('.block-item').forEach((el) => {
    el.addEventListener('click', () => {
      selectedTrace = {
        key: el.dataset.key,
        name: el.dataset.name,
        desc: el.dataset.desc,
        side: el.dataset.side,
      };
      document.querySelectorAll('.block-item').forEach((i) => i.classList.remove('selected'));
      el.classList.add('selected');
      showTrace(selectedTrace);
    });
  });
}

function showTrace(item) {
  const sideLabel = item.side === 'A' ? 'Ativo' : 'Passivo + PL';
  document.getElementById('traceInfo').innerHTML = `
    <strong>${item.name}</strong> (${sideLabel})<br>
    <span style="color:var(--text-muted)">${item.desc}</span>
  `;
}

function renderBalancePremissas(direction = 'none') {
  const container = document.getElementById('balanceWizard');
  if (!container) return;

  const groupKeys = Object.keys(balanceAccounts);
  const groupMeta = {
    ativoCirculante: { label: 'Ativo Circulante', icon: '💵', subtitle: 'Bens e direitos de curto prazo, como caixa, recebíveis e estoque.', side: 'ativo', color: 'var(--accent-2)' },
    ativoNaoCirculante: { label: 'Ativo Não Circulante', icon: '🏭', subtitle: 'Bens e direitos de longo prazo, como imobilizado e investimentos.', side: 'ativo', color: 'var(--accent-2)' },
    passivoCirculante: { label: 'Passivo Circulante', icon: '💳', subtitle: 'Obrigações de curto prazo, como fornecedores e salários.', side: 'passivo', color: 'var(--danger)' },
    passivoNaoCirculante: { label: 'Passivo Não Circulante', icon: '📜', subtitle: 'Obrigações de longo prazo, como empréstimos e financiamentos.', side: 'passivo', color: 'var(--danger)' },
    patrimonioLiquido: { label: 'Patrimônio Líquido', icon: '👑', subtitle: 'Recursos próprios da empresa, como capital social e reservas.', side: 'pl', color: 'var(--accent-3)' },
  };

  const totalAccounts = groupKeys.reduce((acc, k) => acc + balanceAccounts[k].length, 0);
  const completedSteps = groupKeys.filter((k, i) => i < currentBalanceStep).length;
  const xp = totalAccounts * 50 + completedSteps * 100;

  const isCompleted = currentBalanceStep >= groupKeys.length;
  const progressText = isCompleted ? 'Concluído! 🏆' : `Fase ${currentBalanceStep + 1} de ${groupKeys.length}`;
  const progressPct = isCompleted ? 100 : ((currentBalanceStep + 1) / groupKeys.length) * 100;

  document.getElementById('wizardProgressText').textContent = progressText;
  document.getElementById('wizardXpText').textContent = xp;
  document.getElementById('wizardAccountsText').textContent = totalAccounts;

  const progressFill = document.getElementById('wizardProgressFill');
  if (progressFill) {
    progressFill.style.width = `${progressPct}%`;
  }

  const stepsContainer = document.getElementById('wizardProgressSteps');
  if (stepsContainer) {
    stepsContainer.innerHTML = groupKeys
      .map((k, i) => {
        const meta = groupMeta[k];
        const state = i === currentBalanceStep ? 'active' : i < currentBalanceStep ? 'completed' : 'locked';
        return `
          <div class="wizard-step-indicator ${state}" data-step="${i}" title="${meta.label}">
            <span class="step-icon">${meta.icon}</span>
            <span>${meta.label}</span>
          </div>`;
      })
      .join('');
  }

  updateWizardStepIndicators();
  attachWizardStepListeners();

  const content = document.getElementById('wizardContent');
  if (currentBalanceStep >= groupKeys.length) {
    content.innerHTML = renderWizardCompletion(groupKeys, groupMeta, totalAccounts, xp);
    content.className = 'wizard-content animate-in-right';
    updateWizardNavigation();
    return;
  }

  const group = groupKeys[currentBalanceStep];
  const meta = groupMeta[group];
  const accounts = balanceAccounts[group];
  const dec = calculateDREMonthly()[11];
  const total = sumResolvedAccounts(balanceAccounts, group, state, dec);

  content.className = `wizard-content ${direction === 'next' ? 'animate-in-right' : direction === 'prev' ? 'animate-in-left' : ''}`;

  content.innerHTML = `
    <div class="wizard-phase-header">
      <div class="phase-title-wrap">
        <span class="phase-badge">${meta.icon} Fase ${currentBalanceStep + 1}</span>
        <h3 class="wizard-group-title" style="color:${meta.color}">
          <span class="group-icon">${meta.icon}</span>
          ${meta.label}
        </h3>
        <p class="wizard-group-subtitle">${meta.subtitle}</p>
      </div>
    </div>
    <div class="wizard-group-total" style="border-color:${meta.color}">
      <span class="label">Total do grupo</span>
      <span class="value" id="wizardGroupTotal" style="color:${meta.color}">${formatCurrency(total)}</span>
    </div>
    <div class="account-list" data-group="${group}">
      ${accounts.length === 0
        ? `<div class="empty-account-hint">Nenhuma conta nesta fase. Adicione uma conta para começar! 🚀</div>`
        : accounts
            .map(
              (acc, index) => {
                const resolved = resolveAccountValue(acc.name, group, acc.value, state, dec);
                const dynamic = accountIsDynamic(acc.name, group);
                const hasManualValue = parseFloat(acc.value || 0) !== 0;
                const displayValue = dynamic && !hasManualValue ? resolved : acc.value;
                const dynamicDesc = dynamic && hasManualValue
                  ? 'Usando valor digitado manualmente. Zerar o campo para voltar ao cálculo automático.'
                  : resolveAccountDescription(acc.name, group, acc.value, state, dec);
                const badgeLabel = dynamic && hasManualValue ? 'Manual' : 'Automático';
                return `
        <div class="account-item ${meta.side} ${dynamic ? 'dynamic' : ''} ${dynamic && hasManualValue ? 'manual' : ''}" data-group="${group}" data-index="${index}" title="${dynamic ? dynamicDesc.replace(/"/g, '&quot;') : ''}">
          <div class="account-main">
            <input type="text" class="account-name" value="${acc.name.replace(/"/g, '&quot;')}" data-field="name" placeholder="Nome da conta" />
            <input type="text" class="account-value ${dynamic ? 'dynamic-input' : ''}" value="${formatAccountingInput(displayValue)}" data-field="value" inputmode="decimal" placeholder="${dynamic ? 'Saldo inicial R$' : 'R$'}" ${dynamic ? 'data-tooltip="Valor base usado no cálculo automático"' : ''} />
            <div class="account-actions">
              ${dynamic ? `<span class="dynamic-badge ${hasManualValue ? 'manual' : ''}" title="${dynamicDesc.replace(/"/g, '&quot;')}">${hasManualValue ? '✏️ Manual' : '⚡ Automático'}</span>` : ''}
              ${acc.type === 'custom' ? `<button class="btn-remove-account" title="Remover conta">×</button>` : ''}
            </div>
          </div>
          ${dynamic ? `<div class="account-resolved"><span class="resolved-label">Valor usado:</span> <span class="resolved-value">${formatCurrency(resolved)}</span><span class="resolved-formula">${dynamicDesc}</span></div>` : ''}
        </div>`;
              }
            )
            .join('')}
    </div>
    <div class="add-account">
      <button class="add-account-btn">+ Adicionar conta</button>
      <div class="suggestions-dropdown">
        ${(accountSuggestions[group] || [])
          .map((s) => `<div class="suggestion-item" data-suggestion="${s}">${s}</div>`)
          .join('')}
        <div class="suggestion-divider">ou crie uma conta</div>
        <div class="suggestion-custom">
          <input type="text" class="custom-account-input" placeholder="Digite o nome e pressione Enter" />
        </div>
      </div>
    </div>
  `;

  content.querySelectorAll('.account-item input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const item = e.target.closest('.account-item');
      const group = item.dataset.group;
      const index = parseInt(item.dataset.index, 10);
      const field = e.target.dataset.field;
      if (field === 'value') {
        balanceAccounts[group][index][field] = parseAccountingInput(e.target.value);
      } else {
        balanceAccounts[group][index][field] = e.target.value;
      }
      document.getElementById('wizardGroupTotal').textContent = formatCurrency(sumAccounts(balanceAccounts[group]));
      updateWizardScoreboard();
      updateAll();
    });

    input.addEventListener('blur', (e) => {
      const field = e.target.dataset.field;
      if (field !== 'value') return;
      e.target.value = formatAccountingInput(parseAccountingInput(e.target.value));
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });
  });

  content.querySelectorAll('.btn-remove-account').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.account-item');
      const group = item.dataset.group;
      const index = parseInt(item.dataset.index, 10);
      balanceAccounts[group].splice(index, 1);
      renderBalancePremissas();
      updateAll();
    });
  });

  const wrapper = content.querySelector('.add-account');
  const btn = wrapper.querySelector('.add-account-btn');
  const dropdown = wrapper.querySelector('.suggestions-dropdown');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  dropdown.querySelectorAll('.suggestion-item').forEach((item) => {
    item.addEventListener('click', () => {
      const suggestion = item.dataset.suggestion;
      const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      balanceAccounts[group].push({ id, name: suggestion, value: 0, type: 'custom' });
      renderBalancePremissas();
      updateAll();
    });
  });

  const customInput = wrapper.querySelector('.custom-account-input');
  if (customInput) {
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = customInput.value.trim();
        if (!name) return;
        const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        balanceAccounts[group].push({ id, name, value: 0, type: 'custom' });
        renderBalancePremissas();
        updateAll();
      }
    });
  }

  updateWizardNavigation();
}

function renderWizardCompletion(groupKeys, groupMeta, totalAccounts, xp) {
  const totals = groupKeys.map((k) => ({ label: groupMeta[k].label, icon: groupMeta[k].icon, value: sumResolvedAccounts(balanceAccounts, k, state, calculateDREMonthly()[11]), color: groupMeta[k].color }));
  const grandTotal = totals.reduce((acc, t) => acc + t.value, 0);
  return `
    <div class="wizard-completion">
      <div class="completion-icon">🏆</div>
      <h3>Balanço Montado!</h3>
      <p>Você configurou <strong>${totalAccounts} contas</strong> e acumulou <strong>${xp} XP</strong>. O balanço está pronto para gerar os resultados.</p>
      <div class="completion-stats">
        ${totals
          .map(
            (t) => `
          <div class="completion-stat">
            <div class="value" style="color:${t.color}">${t.icon} ${formatCurrency(t.value)}</div>
            <div class="label">${t.label}</div>
          </div>`
          )
          .join('')}
      </div>
      <div class="completion-stats">
        <div class="completion-stat">
          <div class="value" style="color:var(--accent)">${formatCurrency(grandTotal)}</div>
          <div class="label">Total Geral</div>
        </div>
      </div>
      <button class="btn primary" id="wizardFinishBtn">Ver DRE →</button>
    </div>
  `;
}

function updateWizardScoreboard() {
  const groupKeys = Object.keys(balanceAccounts);
  const totalAccounts = groupKeys.reduce((acc, k) => acc + balanceAccounts[k].length, 0);
  const completedSteps = groupKeys.filter((k, i) => i < currentBalanceStep).length;
  const xp = totalAccounts * 50 + completedSteps * 100;
  document.getElementById('wizardXpText').textContent = xp;
  document.getElementById('wizardAccountsText').textContent = totalAccounts;
}

function updateWizardStepIndicators() {
  const container = document.getElementById('balanceWizard');
  if (!container) return;
  const groupKeys = Object.keys(balanceAccounts);
  container.querySelectorAll('.wizard-step-indicator').forEach((el, i) => {
    el.classList.toggle('active', i === currentBalanceStep);
    el.classList.toggle('completed', i < currentBalanceStep);
    el.classList.toggle('locked', i > currentBalanceStep);
  });
}

function attachWizardStepListeners() {
  const container = document.getElementById('balanceWizard');
  if (!container) return;
  container.querySelectorAll('.wizard-step-indicator').forEach((el) => {
    el.replaceWith(el.cloneNode(true)); // remove listeners antigos
  });
  container.querySelectorAll('.wizard-step-indicator').forEach((el) => {
    el.addEventListener('click', () => {
      const step = parseInt(el.dataset.step, 10);
      if (step > currentBalanceStep + 1) return;
      const direction = step > currentBalanceStep ? 'next' : 'prev';
      currentBalanceStep = step;
      renderBalancePremissas(direction);
    });
  });
}

function updateWizardNavigation() {
  const groupKeys = Object.keys(balanceAccounts);
  const prevBtn = document.getElementById('wizardPrev');
  const nextBtn = document.getElementById('wizardNext');
  if (prevBtn) prevBtn.disabled = currentBalanceStep === 0;
  if (nextBtn) {
    if (currentBalanceStep >= groupKeys.length) {
      nextBtn.style.display = 'none';
    } else {
      nextBtn.style.display = 'inline-flex';
      nextBtn.textContent = currentBalanceStep === groupKeys.length - 1 ? 'Concluir ✓' : 'Próximo →';
      nextBtn.disabled = false;
    }
  }
}

function initBalanceWizard() {
  const container = document.getElementById('balanceWizard');
  if (!container) return;

  attachWizardStepListeners();

  const prevBtn = document.getElementById('wizardPrev');
  const nextBtn = document.getElementById('wizardNext');
  const groupKeys = Object.keys(balanceAccounts);

  prevBtn.addEventListener('click', () => {
    if (currentBalanceStep > 0) {
      currentBalanceStep--;
      renderBalancePremissas('prev');
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentBalanceStep < groupKeys.length) {
      currentBalanceStep++;
      renderBalancePremissas('next');
    }
  });

  document.getElementById('wizardContent').addEventListener('click', (e) => {
    if (e.target.id === 'wizardFinishBtn') {
      document.querySelector('[data-tab="dre"]').click();
    }
  });
}

function closeAllSuggestions(e) {
  const container = document.getElementById('balanceWizard');
  if (!container || (e && e.target.closest('.add-account'))) return;
  container.querySelectorAll('.suggestions-dropdown').forEach((d) => d.classList.remove('open'));
}

function updateGiro() {
  const dre = calculateDRE();
  const b = calculateBalanco(dre);
  const g = calculateGiro(b);

  document.getElementById('metricCCC').textContent = `${g.ccc} dias`;
  document.getElementById('metricNCG').textContent = formatCurrency(g.ncg);
  document.getElementById('metricCDG').textContent = formatCurrency(g.cdg);
  const tes = document.getElementById('metricTesouraria');
  tes.textContent = formatCurrency(g.tesouraria);
  tes.style.color = g.tesouraria >= 0 ? 'var(--success)' : 'var(--danger)';

  const health = document.getElementById('metricHealth');
  if (g.tesouraria > 0) {
    health.textContent = 'Saudável';
    health.className = 'metric-health healthy';
  } else if (g.tesouraria === 0) {
    health.textContent = 'Apertado';
    health.className = 'metric-health warning';
  } else {
    health.textContent = 'Crítico';
    health.className = 'metric-health critical';
  }

  document.getElementById('timelineCCC').innerHTML = `
    <div class="timeline-phase pme">PME<br>${state.pme}d</div>
    <span class="timeline-arrow">→</span>
    <div class="timeline-phase pmr">PMR<br>${state.pmr}d</div>
    <span class="timeline-arrow">→</span>
    <div class="timeline-phase pmp">− PMP<br>${state.pmp}d</div>
    <span class="timeline-arrow">=</span>
    <div class="timeline-phase" style="background:#f8fafc;color:var(--accent);border:1px solid var(--border)">CCC<br>${g.ccc}d</div>
  `;

  const monthly = projectCash();
  const maxAbs = Math.max(...monthly.map((m) => Math.abs(m.caixa)), 1);
  document.getElementById('cashChart').innerHTML = monthly
    .map((m) => {
      const height = Math.max(4, (Math.abs(m.caixa) / maxAbs) * 180);
      const color = m.caixa >= 0 ? 'pos' : 'neg';
      return `
        <div class="chart-bar ${color}" style="height:${height}px">
          <span class="chart-bar-label">M${m.month}</span>
        </div>`;
    })
    .join('');

  // Memória de cálculo
  document.getElementById('memoCCC').innerHTML = `
    <span>${state.pme} + ${state.pmr} − ${state.pmp} = <strong>${g.ccc} dias</strong></span>
  `;
  document.getElementById('memoNCG').innerHTML = `
    <span>ACO (${formatCurrency(b.contasReceber)} + ${formatCurrency(b.estoque)}) − PCO (${formatCurrency(b.contasPagar)}) = <strong>${formatCurrency(g.ncg)}</strong></span>
  `;
  document.getElementById('memoCDG').innerHTML = `
    <span>Caixa (${formatCurrency(b.caixa)}) + Outras Obrigações (${formatCurrency(b.outrasObrigacoes)}) = <strong>${formatCurrency(g.cdg)}</strong></span>
  `;
  document.getElementById('memoTesouraria').innerHTML = `
    <span>CDG (${formatCurrency(g.cdg)}) − NCG (${formatCurrency(g.ncg)}) = <strong style="color:${g.tesouraria >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(g.tesouraria)}</strong></span>
  `;

  // Régua visual CCC
  const maxDias = Math.max(180, state.pme + state.pmr, state.pmp, g.ccc);
  const pct = (v) => Math.min(100, Math.max(0, (v / maxDias) * 100));
  document.getElementById('rulerPme').style.left = `${pct(state.pme)}%`;
  document.getElementById('rulerPmr').style.left = `${pct(state.pme + state.pmr)}%`;
  document.getElementById('rulerPmp').style.left = `${pct(state.pmp)}%`;
  document.querySelector('.ruler-label.pme').style.left = `${pct(state.pme)}%`;
  document.querySelector('.ruler-label.pmr').style.left = `${pct(state.pme + state.pmr)}%`;
  document.querySelector('.ruler-label.pmp').style.left = `${pct(state.pmp)}%`;
  document.querySelector('.ruler-label.pme').textContent = `PME ${state.pme}d`;
  document.querySelector('.ruler-label.pmr').textContent = `PMR ${state.pmr}d`;
  document.querySelector('.ruler-label.pmp').textContent = `PMP ${state.pmp}d`;
}

function updateAllFeedbacks() {
  const ccc = state.pme + state.pmr - state.pmp;
  const dre = calculateDRE();
  const b = calculateBalanco(dre);
  const g = calculateGiro(b);

  // Premissas
  const elPrem = document.querySelector('#feedbackPremissas');
  const spanPrem = elPrem.querySelector('span');
  const msgsPrem = [];
  if (state.pmp > state.pme + state.pmr) {
    msgsPrem.push('Seu PMP é maior que PME + PMR: os fornecedores financiam todo o ciclo operacional.');
    elPrem.className = 'card feedback info';
  } else if (ccc > 60) {
    msgsPrem.push(`Ciclo de Conversão de Caixa de ${ccc} dias. Considere negociar prazos ou reduzir estoque.`);
    elPrem.className = 'card feedback warning';
  } else {
    msgsPrem.push(`Ciclo de Conversão de Caixa de ${ccc} dias. Nível operacional razoável para muitos negócios.`);
    elPrem.className = 'card feedback';
  }
  if (state.cmvPercent > 60) {
    msgsPrem.push('CMV elevado. Analise preço de compra/venda e mix de produtos.');
    elPrem.className = 'card feedback warning';
  }
  spanPrem.textContent = msgsPrem.join(' ');

  // DRE
  const elDre = document.querySelector('#feedbackDre');
  const spanDre = elDre.querySelector('span');
  const margemBruta = (dre.lucroBruto / dre.receitaLiquida) * 100;
  const margemLiquida = (dre.lucroLiquido / dre.receitaLiquida) * 100;
  if (margemBruta < 20) {
    spanDre.textContent = 'Margem bruta abaixo de 20%. Reveja preços ou estrutura de custos.';
    elDre.className = 'card feedback warning';
  } else if (margemLiquida < 5) {
    spanDre.textContent = 'Margem líquida apertada. Pequenas variações de custo ou prazo podem zerar o lucro.';
    elDre.className = 'card feedback warning';
  } else {
    spanDre.textContent = `DRE saudável: margem bruta de ${margemBruta.toFixed(1).replace('.', ',')}% e margem líquida de ${margemLiquida.toFixed(1).replace('.', ',')}%.`;
    elDre.className = 'card feedback';
  }

  // Balanço
  const elBal = document.querySelector('#feedbackBalanco');
  const spanBal = elBal.querySelector('span');
  const aco = b.contasReceber + b.estoque;
  const pco = b.contasPagar;
  if (aco > pco * 2) {
    spanBal.textContent = 'Seu Ativo Circulante Operacional é bem maior que o Passivo Circulante Operacional. Isso geralmente aumenta a NCG e exige mais capital.';
    elBal.className = 'card feedback warning';
  } else if (b.caixa < 0) {
    spanBal.textContent = 'O caixa calculado como fechamento ficou negativo. O passivo+PL não cobre os investimentos e o giro sem geração de caixa extra.';
    elBal.className = 'card feedback critical';
  } else {
    spanBal.textContent = 'Estrutura de balanço equilibrada: Ativo = Passivo + PL. Acompanhe o crescimento do AC em relação ao PC.';
    elBal.className = 'card feedback';
  }

  // Capital de Giro
  const elGiro = document.querySelector('#feedbackGiro');
  const spanGiro = elGiro.querySelector('span');
  if (g.tesouraria < 0) {
    spanGiro.textContent = 'Tesouraria negativa: a NCG supera o CDG. Você precisa de mais fontes de financiamento ou reduzir o ciclo de caixa.';
    elGiro.className = 'card feedback critical';
  } else if (g.tesouraria < g.ncg * 0.1) {
    spanGiro.textContent = 'Tesouraria positiva, mas baixa em relação à NCG. Situação apertada.';
    elGiro.className = 'card feedback warning';
  } else {
    spanGiro.textContent = 'Tesouraria confortável. O CDG cobre a NCG e ainda sobra folga para imprevistos.';
    elGiro.className = 'card feedback';
  }
}

function updateAll() {
  updateDRE();
  updateBalanco();
  updateGiro();
  updateAllFeedbacks();

  const dre = calculateDRE();
  const b = calculateBalanco(dre);
  const g = calculateGiro(b);
  const kpiGroups = calculateKPIs(dre, b, g);
  renderKPIs(kpiGroups);
  renderMonthlyKPIs();
  updateKPIsFeedback(kpiGroups);

  checkChallenges();
  updateProgress();
}

function initTabs() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'premissas-balanco') {
        renderBalancePremissas();
      }
    });
  });
}

function safeAddListener(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function initActions() {
  safeAddListener('btnPadrao', 'click', () => {
    state = { ...defaultState };
    balanceAccounts = cloneBalanceAccounts(defaultBalanceAccounts);
    updateInputDisplays();
    renderBalancePremissas();
    updateAll();
  });

  safeAddListener('btnSalvar', 'click', () => {
    savedScenario = { ...state, balanceAccounts: cloneBalanceAccounts(balanceAccounts) };
    renderCompareDRE(calculateDRE());
    alert('Cenário salvo! Vá até o módulo DRE para ver o comparativo.');
  });

  safeAddListener('btnExportar', 'click', () => {
    const dre = calculateDRE();
    const b = calculateBalanco(dre);
    const g = calculateGiro(b);

    const balanceAccountsHtml = Object.entries(balanceAccounts)
      .map(([group, accounts]) => {
        const groupLabel = {
          ativoCirculante: 'Ativo Circulante',
          ativoNaoCirculante: 'Ativo Não Circulante',
          passivoCirculante: 'Passivo Circulante',
          passivoNaoCirculante: 'Passivo Não Circulante',
          patrimonioLiquido: 'Patrimônio Líquido',
        }[group];
        return `
          <h4>${groupLabel}</h4>
          <ul>
            ${accounts.map((a) => `<li>${a.name}: ${formatCurrency(a.value)}</li>`).join('')}
          </ul>`;
      })
      .join('');

    const content = `
      <h1>FinSim - Cenário</h1>
      <h2>Premissas DRE</h2>
      <ul>
        <li>Receita Bruta: ${formatCurrency(state.receitaBruta)}</li>
        <li>Deduções: ${formatPercent(state.deducoes)}</li>
        <li>CMV: ${formatPercent(state.cmvPercent)}</li>
        <li>Despesas Fixas: ${formatCurrency(state.despesasFixas)}</li>
        <li>Despesas Variáveis: ${formatPercent(state.despesasVariaveis)}</li>
        <li>PMR: ${state.pmr} dias</li>
        <li>PME: ${state.pme} dias</li>
        <li>PMP: ${state.pmp} dias</li>
      </ul>
      <h2>Premissas do Balanço</h2>
      ${balanceAccountsHtml}
      <h2>DRE</h2>
      <ul>
        <li>Receita Líquida: ${formatCurrency(dre.receitaLiquida)}</li>
        <li>Lucro Bruto: ${formatCurrency(dre.lucroBruto)}</li>
        <li>EBITDA: ${formatCurrency(dre.ebitda)}</li>
        <li>Lucro Líquido: ${formatCurrency(dre.lucroLiquido)}</li>
      </ul>
      <h2>Balanço</h2>
      <ul>
        <li>Total Ativo: ${formatCurrency(b.ativoTotal)}</li>
        <li>Total Passivo + PL: ${formatCurrency(b.totalPassivoPL)}</li>
        <li>Caixa: ${formatCurrency(b.caixa)}</li>
      </ul>
      <h2>Capital de Giro</h2>
      <ul>
        <li>CCC: ${g.ccc} dias</li>
        <li>NCG: ${formatCurrency(g.ncg)}</li>
        <li>CDG: ${formatCurrency(g.cdg)}</li>
        <li>Tesouraria: ${formatCurrency(g.tesouraria)}</li>
      </ul>
    `;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>FinSim - Cenário</title>
      <style>body{font-family:Segoe UI,Roboto,sans-serif;padding:40px;background:#fff;color:#111} h1,h2{color:#0f172a} ul{line-height:1.8}</style>
      </head><body>${content}<button onclick="window.print()">Imprimir / Salvar PDF</button></body></html>
    `);
    win.document.close();
  });

  safeAddListener('btnComparar', 'click', () => {
    document.querySelector('[data-tab="dre"]').click();
  });

  safeAddListener('btnSimPmp', 'click', () => simulateScenario('pmp', -10));
  safeAddListener('btnSimPmr', 'click', () => simulateScenario('pmr', -10));
  safeAddListener('btnSimPme', 'click', () => simulateScenario('pme', 10));

  document.querySelectorAll('.next-btn').forEach((btn) => {
    btn.addEventListener('click', () => document.querySelector(`[data-tab="${btn.dataset.next}"]`).click());
  });
  document.querySelectorAll('.prev-btn').forEach((btn) => {
    btn.addEventListener('click', () => document.querySelector(`[data-tab="${btn.dataset.prev}"]`).click());
  });
}

function simulateScenario(key, delta) {
  const newState = { ...state, [key]: Math.max(0, state[key] + delta) };
  const dre = calculateDRE(newState);
  const b = calculateBalanco(dre, newState);
  const g = calculateGiro(b, newState);
  const oldG = calculateGiro(calculateBalanco(calculateDRE(state), state), state);
  const diff = g.tesouraria - oldG.tesouraria;
  const labels = { pmp: 'PMP', pmr: 'PMR', pme: 'PME' };
  document.getElementById('scenarioResult').innerHTML = `
    <strong>Se ${labels[key]} ${delta >= 0 ? 'aumentar' : 'diminuir'} ${Math.abs(delta)} dias:</strong><br>
    CCC passa para <strong>${g.ccc} dias</strong>.<br>
    NCG passa para <strong>${formatCurrency(g.ncg)}</strong>.<br>
    Saldo de Tesouraria passa para <strong>${formatCurrency(g.tesouraria)}</strong>
    (<span style="color:${diff >= 0 ? 'var(--success)' : 'var(--danger)'}">${diff >= 0 ? '+' : ''}${formatCurrency(diff)}</span>).
  `;
}

/* Aprender */
const glossaryTerms = {
  'Receita Líquida': 'Receita Bruta menos deduções, impostos e devoluções. É o valor efetivo que a empresa tem para pagar custos e despesas.',
  'CMV': 'Custo da Mercadoria Vendida. Representa o custo dos produtos/serviços vendidos no período.',
  'EBITDA': 'Lucro antes de juros, impostos, depreciação e amortização. Indica a geração de caixa operacional.',
  'EBIT': 'Lucro operacional antes de juros e impostos. Mostra a rentabilidade do negócio sem efeito financeiro.',
  'Despesas com Empréstimos': 'Juros e encargos financeiros pagos sobre empréstimos e financiamentos. Reduzem o lucro antes do IR.',
  'LAIR': 'Lucro antes do Imposto de Renda. Resultado obtido após subtrair as despesas financeiras do EBIT.',
  'Lucro Líquido': 'Resultado final da empresa após todos os custos, despesas e tributos.',
  'PMR': 'Prazo Médio de Recebimento: quantos dias, em média, a empresa demora para receber de clientes.',
  'PME': 'Prazo Médio de Estoque: quantos dias, em média, a mercadoria fica parada antes de ser vendida.',
  'PMP': 'Prazo Médio de Pagamento: quantos dias, em média, a empresa demora para pagar fornecedores.',
  'CCC': 'Ciclo de Conversão de Caixa: PME + PMR − PMP. Quanto menor, menos recurso fica preso no giro.',
  'NCG': 'Necessidade de Capital de Giro: Ativo Circulante Operacional − Passivo Circulante Operacional.',
  'CDG': 'Capital de Giro Líquido: recursos disponíveis para financiar o giro (caixa + recursos de curto prazo).',
  'Tesouraria': 'Saldo de Tesouraria = CDG − NCG. Positivo indica folga; negativo, necessidade de financiamento.',
  'Ativo Circulante': 'Bens e direitos de curto prazo (até 1 ano): caixa, contas a receber e estoque.',
  'Ativo Não Circulante': 'Bens e direitos de longo prazo: imobilizado, investimentos e intangível.',
  'Passivo Circulante': 'Obrigações de curto prazo: contas a pagar, empréstimos de curto prazo, salários etc.',
  'Passivo Não Circulante': 'Obrigações de longo prazo: empréstimos e financiamentos a pagar após 1 ano.',
  'Patrimônio Líquido': 'Recursos próprios da empresa: capital social, reservas e lucros acumulados.',
  'Resultado do Exercício': 'Lucro Líquido acumulado no exercício, que aumenta o Patrimônio Líquido.',
  'Margem Bruta': 'Percentual do lucro bruto em relação à receita líquida. Mede a rentabilidade do produto/serviço.',
  'Margem EBITDA': 'Percentual do EBITDA em relação à receita líquida. Mede a geração de caixa operacional.',
  'Margem Líquida': 'Percentual do lucro líquido em relação à receita líquida. Resultado final da venda.',
  'ROE': 'Retorno sobre o Patrimônio Líquido: lucro líquido dividido pelo PL. Mede o retorno para os sócios.',
  'ROA': 'Retorno sobre os Ativos: lucro líquido dividido pelo ativo total. Mede a eficiência total dos recursos.',
  'Liquidez Corrente': 'Ativo circulante dividido pelo passivo circulante. Mede a capacidade de pagar dívidas de curto prazo.',
  'Liquidez Seca': '(Ativo circulante − estoque) dividido pelo passivo circulante. Mede a liquidez sem estoque.',
  'Liquidez Imediata': 'Caixa dividido pelo passivo circulante. Mede o pagamento imediato de obrigações.',
  'Endividamento Geral': 'Dívida total (curto + longo prazo) dividida pelo PL. Mede o grau de alavancagem.',
  'Cobertura de Juros': 'EBIT dividido pelas despesas financeiras. Mede a capacidade de pagar juros.',
  'Giro do Ativo': 'Receita líquida dividida pelo ativo total. Mede quanto o ativo gera de vendas.',
  'Rotatividade de Estoque': 'CMV dividido pelo estoque médio. Mede quantas vezes o estoque gira no período.',
};

function initAprender() {
  const dl = document.getElementById('glossary');
  dl.innerHTML = Object.entries(glossaryTerms)
    .map(([term, def]) => `<dt class="term" data-term="${term}">${term}</dt><dd>${def}</dd>`)
    .join('');
  dl.querySelectorAll('dt').forEach((dt) => {
    dt.addEventListener('click', () => {
      dt.nextElementSibling.classList.toggle('open');
      trackProgress('glossary', dt.textContent);
    });
  });
  initInlineTooltips();

  const questions = [
    {
      q: 'O que acontece com o caixa se o PMP aumenta (e tudo o mais constante)?',
      options: ['Melhora', 'Piora', 'Não muda'],
      correct: 0,
    },
    {
      q: 'Qual fórmula correta do Ciclo de Conversão de Caixa?',
      options: ['PME + PMR − PMP', 'PME − PMR + PMP', 'PMR + PMP − PME'],
      correct: 0,
    },
    {
      q: 'No balanço, o Lucro Líquido vai parar onde?',
      options: ['Ativo Circulante', 'Passivo Circulante', 'Patrimônio Líquido'],
      correct: 2,
    },
  ];

  const quizContainer = document.getElementById('quizContainer');
  quizContainer.innerHTML = questions
    .map((q, qi) => {
      const opts = q.options
        .map((opt, oi) => `<div class="quiz-option" data-q="${qi}" data-o="${oi}">${opt}</div>`)
        .join('');
      return `<div class="quiz-question"><strong>${q.q}</strong><div class="quiz-options">${opts}</div></div>`;
    })
    .join('');

  quizContainer.querySelectorAll('.quiz-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const qi = parseInt(opt.dataset.q);
      const oi = parseInt(opt.dataset.o);
      const question = quizContainer.querySelectorAll('.quiz-question')[qi];
      question.querySelectorAll('.quiz-option').forEach((o) => o.classList.remove('correct', 'wrong'));
      if (oi === questions[qi].correct) {
        opt.classList.add('correct');
        trackProgress('quiz', qi);
      } else {
        opt.classList.add('wrong');
        question.querySelectorAll('.quiz-option')[questions[qi].correct].classList.add('correct');
      }
    });
  });

  initChallenges();
  updateProgress();
}

function trackProgress(type, id) {
  const key = `finsim_progress_${type}`;
  const seen = JSON.parse(localStorage.getItem(key) || '[]');
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem(key, JSON.stringify(seen));
    updateProgress();
  }
}

function updateProgress() {
  const glossarySeen = JSON.parse(localStorage.getItem('finsim_progress_glossary') || '[]');
  const quizSeen = JSON.parse(localStorage.getItem('finsim_progress_quiz') || '[]');
  const totalTerms = Object.keys(glossaryTerms).length;
  const totalQuiz = 3;
  const challengeDone = challenges.filter((c) => c.check()).length;
  const total = totalTerms + totalQuiz + challenges.length;
  const done = glossarySeen.length + quizSeen.length + challengeDone;
  const pct = total ? (done / total) * 100 : 0;
  const fill = document.getElementById('progressFill');
  const stats = document.getElementById('progressStats');
  if (fill && stats) {
    fill.style.width = `${pct}%`;
    stats.innerHTML = `
      <span><strong>${glossarySeen.length}/${totalTerms}</strong> termos do glossário</span>
      <span><strong>${quizSeen.length}/${totalQuiz}</strong> quiz</span>
      <span><strong>${challengeDone}/${challenges.length}</strong> desafios</span>
    `;
  }
}

const challenges = [
  {
    id: 'c1',
    title: 'Reduza o CCC em 15 dias sem perder margem',
    desc: 'Mantenha receita e CMV estáveis. Altere PMR, PME ou PMP para reduzir o CCC em pelo menos 15 dias.',
    check: () => {
      const current = state.pme + state.pmr - state.pmp;
      return (defaultState.pme + defaultState.pmr - defaultState.pmp) - current >= 15;
    },
  },
  {
    id: 'c2',
    title: 'Alcance saldo de tesouraria positivo',
    desc: 'Ajuste prazos e custos para que CDG − NCG seja maior que zero.',
    check: () => {
      const g = calculateGiro(calculateBalanco(calculateDRE()), state);
      return g.tesouraria > 0;
    },
  },
  {
    id: 'c3',
    title: 'Margem EBITDA acima de 30%',
    desc: 'Ajuste CMV e despesas para obter margem EBITDA superior a 30%.',
    check: () => {
      const dre = calculateDRE();
      return (dre.ebitda / dre.receitaLiquida) * 100 > 30;
    },
  },
];

function initChallenges() {
  const container = document.getElementById('challenges');
  container.innerHTML = challenges
    .map((c) => `<div class="challenge" data-id="${c.id}">
      <strong>${c.title}</strong>
      <p>${c.desc}</p>
      <span class="challenge-status pending">Pendente</span>
    </div>`)
    .join('');
  checkChallenges();
}

function checkChallenges() {
  document.querySelectorAll('.challenge').forEach((el) => {
    const id = el.dataset.id;
    const challenge = challenges.find((c) => c.id === id);
    const done = challenge.check();
    const status = el.querySelector('.challenge-status');
    status.textContent = done ? 'Concluído!' : 'Pendente';
    status.className = `challenge-status ${done ? 'done' : 'pending'}`;
  });
}

function initOnboarding() {
  const overlay = document.getElementById('onboarding');
  if (localStorage.getItem('finsim_onboarding_done') === '1') {
    overlay.classList.add('hidden');
    return;
  }
  const slides = document.querySelectorAll('.onboarding-slide');
  const dots = document.querySelectorAll('.dot');
  const btnPrev = document.getElementById('btnOnboardingPrev');
  const btnNext = document.getElementById('btnOnboardingNext');
  const btnSkip = document.getElementById('btnOnboardingSkip');
  let current = 0;

  function show(i) {
    slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    btnPrev.style.visibility = i === 0 ? 'hidden' : 'visible';
    btnNext.textContent = i === slides.length - 1 ? 'Começar' : 'Próximo';
  }

  btnNext.addEventListener('click', () => {
    if (current < slides.length - 1) {
      current++;
      show(current);
    } else {
      localStorage.setItem('finsim_onboarding_done', '1');
      overlay.classList.add('hidden');
    }
  });

  btnPrev.addEventListener('click', () => {
    if (current > 0) { current--; show(current); }
  });

  btnSkip.addEventListener('click', () => {
    localStorage.setItem('finsim_onboarding_done', '1');
    overlay.classList.add('hidden');
  });

  show(0);
}

function initInlineTooltips() {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  document.body.appendChild(tooltip);

  document.querySelectorAll('.term').forEach((el) => {
    const term = el.dataset.term;
    const def = glossaryTerms[term] || 'Termo técnico';
    el.addEventListener('mouseenter', (e) => {
      tooltip.innerHTML = `<strong>${term}</strong><br>${def}<br><a class="goto-glossary">Ver no glossário</a>`;
      tooltip.classList.add('visible');
      const rect = el.getBoundingClientRect();
      const ttRect = tooltip.getBoundingClientRect();
      let left = rect.left + (rect.width - ttRect.width) / 2 + window.scrollX;
      let top = rect.bottom + 8 + window.scrollY;
      if (left < 10) left = 10;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });
    el.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
  });

  tooltip.addEventListener('click', (e) => {
    if (e.target.classList.contains('goto-glossary')) {
      document.querySelector('[data-tab="aprender"]').click();
      tooltip.classList.remove('visible');
    }
  });
}

function renderMonthlyBalanco() {
  const monthly = calculateBalancoMonthly();
  const head = document.querySelector('#monthlyBalancoTable thead');
  const tbody = document.querySelector('#monthlyBalancoTable tbody');

  head.innerHTML = `<tr><th>Descrição</th>${monthly.map((m) => `<th>${m.month}</th>`).join('')}</tr>`;

  const passivoCirculanteDinamicas = balanceAccounts.passivoCirculante.filter((a) => accountIsDynamic(a.name, 'passivoCirculante'));
  const passivoCirculanteNaoDinamicas = balanceAccounts.passivoCirculante.filter((a) => !accountIsDynamic(a.name, 'passivoCirculante'));
  const ativoNaoCirculanteContas = balanceAccounts.ativoNaoCirculante;

  const rowDefs = [
    { label: 'Ativo Circulante', cls: 'total', key: 'ativoCirculante' },
    { label: 'Caixa', cls: 'sub', key: 'caixa' },
    { label: 'Contas a Receber', cls: 'sub', key: 'contasReceber' },
    { label: 'Estoque', cls: 'sub', key: 'estoque' },
    { label: 'Ativo Não Circulante', cls: 'total', key: 'ativoNaoCirculante' },
    ...ativoNaoCirculanteContas.map((a) => ({ label: a.name, cls: 'sub', get: (m, i) => m.ativoNaoCirculanteContas[a.id][i] })),
    { label: 'Outros Ativos', cls: 'sub', key: 'outrosAtivos' },
    { label: 'Total Ativo', cls: 'total', key: 'ativoTotal' },
    { label: 'Passivo Circulante', cls: 'total', key: 'passivoCirculante' },
    ...(passivoCirculanteDinamicas.length > 0
      ? passivoCirculanteDinamicas.map((a) => ({ label: a.name, cls: 'sub', get: (m, i) => m.passivoCirculanteContas[a.id][i] }))
      : [{ label: 'Contas a Pagar', cls: 'sub', key: 'contasPagar' }]),
    ...passivoCirculanteNaoDinamicas.map((a) => ({ label: a.name, cls: 'sub', get: (m, i) => m.passivoCirculanteContas[a.id][i] })),
    { label: 'Passivo Não Circulante', cls: 'total', key: 'passivoNaoCirculante' },
    { label: 'Outros Passivos', cls: 'sub', key: 'outrosPassivos' },
    { label: 'Patrimônio Líquido', cls: 'total', key: 'patrimonioLiquido' },
    { label: 'Capital Social / PL Informado', cls: 'sub', key: 'patrimonioLiquidoInformado' },
    { label: 'Resultado do Exercício', cls: 'sub', key: 'lucrosAcumulados' },
    { label: 'Total Passivo + PL', cls: 'total', key: 'totalPassivoPL' },
  ];

  tbody.innerHTML = rowDefs
    .map((r) => {
      const monthlyValues = monthly.map((m, i) => {
        const v = r.get ? r.get(m, i) : m[r.key];
        return `<td>${formatCurrency(v)}</td>`;
      }).join('');
      return `<tr class="${r.cls}"><td>${r.label}</td>${monthlyValues}</tr>`;
    })
    .join('');
}

function renderMonthlyTable() {
  const monthly = calculateDREMonthly();
  const head = document.querySelector('#monthlyDreTable thead');
  const tbody = document.querySelector('#monthlyDreTable tbody');

  head.innerHTML = `<tr><th>Descrição</th>${monthly.map((m) => `<th>${m.month}</th>`).join('')}</tr>`;

  const rowDefs = [
    { key: 'receitaBruta', label: 'Receita Bruta', cls: 'pos' },
    { key: 'deducoes', label: '(−) Deduções/Impostos', cls: 'neg', get: (m) => m.receitaBruta - m.receitaLiquida },
    { key: 'receitaLiquida', label: 'Receita Líquida', cls: 'total' },
    { key: 'pctCmv', label: 'CMV % da Receita Líquida', cls: 'pct', get: (m) => m.cmv / m.receitaLiquida, format: 'percent' },
    { key: 'cmv', label: '(−) CMV', cls: 'neg', get: (m) => m.cmv },
    { key: 'pctLucroBruto', label: 'Margem Bruta', cls: 'pct', get: (m) => m.lucroBruto / m.receitaLiquida, format: 'percent' },
    { key: 'lucroBruto', label: 'Lucro Bruto', cls: 'sub' },
    { key: 'despesasVariaveis', label: '(−) Despesas Variáveis', cls: 'neg', get: (m) => m.despesasVariaveis },
    { key: 'pctMargemContribuicao', label: 'Margem de Contribuição %', cls: 'pct', get: (m) => m.margemContribuicao / m.receitaLiquida, format: 'percent' },
    { key: 'margemContribuicao', label: 'Margem de Contribuição', cls: 'sub', get: (m) => m.margemContribuicao },
    { key: 'despesasFixas', label: '(−) Despesas Operacionais Fixas', cls: 'neg', get: (m) => m.despesasFixas },
    { key: 'pctEbitda', label: 'Margem EBITDA', cls: 'pct', get: (m) => m.ebitda / m.receitaLiquida, format: 'percent' },
    { key: 'ebitda', label: 'EBITDA', cls: 'sub' },
    { key: 'depreciacao', label: '(−) Depreciação', cls: 'neg', get: (m) => m.depreciacao },
    { key: 'pctEbit', label: 'Margem EBIT', cls: 'pct', get: (m) => m.ebit / m.receitaLiquida, format: 'percent' },
    { key: 'ebit', label: 'EBIT', cls: 'sub' },
    { key: 'despesasEmprestimos', label: '(−) Despesas com Juros', cls: 'neg', get: (m) => m.despesasEmprestimos },
    { key: 'pctLair', label: 'Margem LAIR', cls: 'pct', get: (m) => m.laIR / m.receitaLiquida, format: 'percent' },
    { key: 'laIR', label: 'LAIR', cls: 'sub' },
    { key: 'ir', label: '(−) IR/CSLL', cls: 'neg', get: (m) => m.ir },
    { key: 'pctLucroLiquido', label: 'Margem Líquida', cls: 'pct', get: (m) => m.lucroLiquido / m.receitaLiquida, format: 'percent' },
    { key: 'lucroLiquido', label: 'Lucro Líquido', cls: 'total' },
  ];

  tbody.innerHTML = rowDefs
    .map((r) => {
      const monthlyValues = monthly.map((m) => {
        const v = r.get ? r.get(m) : m[r.key];
        const formatted = r.format === 'percent' ? formatPercentView(v * 100) : formatCurrency(v);
        return `<td>${formatted}</td>`;
      }).join('');
      return `<tr class="${r.cls}"><td>${r.label}</td>${monthlyValues}</tr>`;
    })
    .join('');
}

function initQRCode() {
  const btn = document.getElementById('qrBtn');
  const modal = document.getElementById('qrModal');
  const close = document.getElementById('qrModalClose');
  if (!btn || !modal || !close || typeof QRCode === 'undefined') return;

  let qr;
  const generate = () => {
    const container = document.getElementById('qrcode');
    const urlEl = document.getElementById('qrUrl');
    if (!container || !urlEl) return;
    const isLocal = window.location.protocol === 'file:';
    const url = isLocal
      ? 'https://gabrielgv551.github.io/EducacionalDREBP/'
      : window.location.href.split('?')[0];
    urlEl.textContent = url;
    container.innerHTML = '';
    qr = new QRCode(container, {
      text: url,
      width: 280,
      height: 280,
      colorDark: '#0f172a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  };

  btn.addEventListener('click', () => {
    if (!containerHasQR()) generate();
    modal.classList.add('open');
  });

  close.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  function containerHasQR() {
    const container = document.getElementById('qrcode');
    return container && (container.querySelector('img') || container.querySelector('canvas'));
  }
}

function init() {
  initOnboarding();
  initTabs();
  initViewToggle();
  initInputs();
  initActions();
  renderBalancePremissas();
  initBalanceWizard();
  document.addEventListener('click', closeAllSuggestions);
  renderMonthlyTable();
  initInlineTooltips();
  initAprender();
  initQRCode();
  updateAll();
}

init();
