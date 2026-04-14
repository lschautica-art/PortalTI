
  (function () {
    const body = document.body;
    const menuToggle = document.getElementById('menuToggle');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    function fecharMenu() {
      body.classList.remove('sidebar-open');
    }

    if (menuToggle) {
      menuToggle.addEventListener('click', () => body.classList.toggle('sidebar-open'));
    }

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', fecharMenu);
    }

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) fecharMenu();
    });
  }());

  Chart.register(ChartDataLabels);

  const csvFileInput = document.getElementById('csvFile');
  const cadastroFileInput = document.getElementById('cadastroFile');
  const unidadeFiltro = document.getElementById('unidadeFiltro');
  const supervisorFiltro = document.getElementById('supervisorFiltro');
  const placaFiltro = document.getElementById('placaFiltro');
  const combustivelFiltro = document.getElementById('combustivelFiltro');
  const mesInicio = document.getElementById('mesInicio');
  const mesFim = document.getElementById('mesFim');
  const statusBox = document.getElementById('statusBox');
  const cadastroStatus = document.getElementById('cadastroStatus');
  const salvamentoStatus = document.getElementById('salvamentoStatus');
  const fonteAtual = document.getElementById('fonteAtual');
  const cadastroAtual = document.getElementById('cadastroAtual');
  const cardTotal = document.getElementById('cardTotal');
  const cardSupervisores = document.getElementById('cardSupervisores');
  const cardPlacas = document.getElementById('cardPlacas');
  const cardTicket = document.getElementById('cardTicket');
  const responsavelResumo = document.getElementById('responsavelResumo');
  const combustivelResumo = document.getElementById('combustivelResumo');
  const tabelaContainer = document.getElementById('tabelaContainer');

  let baseDados = [];
  let dadosPrincipais = [];
  let dadosComplementares = [];
  let cadastroResponsaveis = new Map();
  let resumoCadastro = null;
  let ultimoTextoPrincipal = '';
  let ultimaOrigemPrincipal = '';
  let chartMensal = null;
  let chartTipo = null;
  let chartPlaca = null;
  const STORAGE_BUCKET = 'portal-csvs';
  const STORAGE_PATH_MATRIZ = 'combustivel/matriz/latest.csv';
  const STORAGE_PATH_FILIAL = 'combustivel/filial/latest.csv';

  function formatarBRL(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function atualizarStatus(texto, erro = false) {
    statusBox.textContent = texto;
    statusBox.classList.toggle('error', erro);
    statusBox.classList.remove('success');
  }

  function atualizarFonteAtual(texto) {
    fonteAtual.textContent = `Matriz SC: ${texto}`;
  }

  function atualizarFonteCadastro(texto) {
    cadastroAtual.textContent = `Filial: ${texto}`;
  }

  function atualizarStatusCadastro(texto, erro = false) {
    cadastroStatus.textContent = texto;
    cadastroStatus.classList.toggle('error', erro);
    cadastroStatus.classList.remove('success');
  }

  function atualizarStatusSalvamento(texto, tipo = 'neutral') {
    salvamentoStatus.textContent = texto;
    salvamentoStatus.classList.remove('error', 'success');
    if (tipo === 'error') salvamentoStatus.classList.add('error');
    if (tipo === 'success') salvamentoStatus.classList.add('success');
  }

  function obterClienteSupabase() {
    return window.portalAuth?.supabase || null;
  }

  async function uploadArquivoSupabase(path, arquivo) {
    const supabase = obterClienteSupabase();
    if (!supabase) throw new Error('Cliente Supabase nao inicializado');
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, arquivo, {
      upsert: true,
      contentType: arquivo.type || 'text/csv'
    });
    if (error) throw error;
  }

  async function baixarArquivoSupabase(path) {
    const supabase = obterClienteSupabase();
    if (!supabase) throw new Error('Cliente Supabase nao inicializado');
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
    if (error) throw error;
    return data.text();
  }

  function indiceColunaExcel(letra) {
    let total = 0;
    const texto = String(letra || '').toUpperCase();
    for (let i = 0; i < texto.length; i += 1) total = (total * 26) + (texto.charCodeAt(i) - 64);
    return total - 1;
  }

  function converterValor(valorOriginal) {
    const limpo = String(valorOriginal || '').replace(/\s/g, '').replace('R$', '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const numero = parseFloat(limpo);
    return Number.isFinite(numero) ? numero : 0;
  }

  function converterData(valorOriginal) {
    const texto = String(valorOriginal || '').trim();
    if (!texto) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto) || /^\d{4}-\d{2}$/.test(texto)) return texto.slice(0, 7);
    const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}`;
    const data = new Date(texto);
    if (!Number.isNaN(data.getTime())) return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
    return null;
  }

  function normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizarPlaca(valor) {
    return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  }

  function localizarColuna(campos, candidatos) {
    const mapeamento = campos.map((campo) => ({ original: campo, normalizado: normalizarTexto(campo) }));
    for (const candidato of candidatos) {
      const alvo = normalizarTexto(candidato);
      const encontradoExato = mapeamento.find((item) => item.normalizado === alvo);
      if (encontradoExato) return encontradoExato.original;
    }
    for (const candidato of candidatos) {
      const alvo = normalizarTexto(candidato);
      const encontradoParcial = mapeamento.find((item) => item.normalizado.includes(alvo) || alvo.includes(item.normalizado));
      if (encontradoParcial) return encontradoParcial.original;
    }
    return '';
  }

  function extrairCadastroResponsaveis(data, fields) {
    const colunaPlaca = localizarColuna(fields, ['Placa', 'Placa do veiculo', 'Placa Veiculo', 'Placa - Dig.Motorista']);
    const colunaNome = localizarColuna(fields, ['Responsavel', 'Responsavel pelo veiculo', 'Responsavel pela placa', 'Nome do responsavel', 'Nome responsavel', 'Motorista', 'Nome motorista', 'Condutor', 'Vendedor', 'Colaborador']);

    if (!colunaPlaca || !colunaNome) {
      return {
        mapa: new Map(),
        info: {
          linhas: data.length,
          placa: colunaPlaca,
          nome: colunaNome,
          validos: 0
        }
      };
    }

    const mapa = new Map();
    data.forEach((linha) => {
      const placa = normalizarPlaca(linha[colunaPlaca]);
      const nome = String(linha[colunaNome] || '').trim();
      if (placa && nome) mapa.set(placa, nome);
    });

    return {
      mapa,
      info: {
        linhas: data.length,
        placa: colunaPlaca,
        nome: colunaNome,
        validos: mapa.size
      }
    };
  }

  function detectarRelatorioBruto(fields) {
    return fields.length >= indiceColunaExcel('AR') + 1
      && Boolean(fields[indiceColunaExcel('F')])
      && Boolean(fields[indiceColunaExcel('Y')])
      && Boolean(fields[indiceColunaExcel('AN')])
      && Boolean(fields[indiceColunaExcel('AR')]);
  }

  function construirMapaResponsaveisPorPlaca(dados) {
    const mapa = new Map();
    dados.forEach((item) => {
      const placa = normalizarPlaca(item.placa);
      const nome = String(item.supervisor || '').trim();
      if (placa && nome && nome !== 'Sem agrupamento') mapa.set(placa, nome);
    });
    return mapa;
  }

  function consolidarBase(origem = 'arquivo importado', usaRelatorioBruto = true) {
    const mapaComplementar = construirMapaResponsaveisPorPlaca(dadosComplementares);
    const mapaFinal = new Map([...cadastroResponsaveis.entries(), ...mapaComplementar.entries()]);

    baseDados = [...dadosPrincipais, ...dadosComplementares].map((item) => {
      const nomeComplementar = mapaFinal.get(normalizarPlaca(item.placa)) || '';
      return {
        ...item,
        supervisor: nomeComplementar || item.supervisor || 'Sem agrupamento',
        origemResponsavel: nomeComplementar ? 'cadastro' : item.origemResponsavel
      };
    });

    if (!baseDados.length) {
      atualizarStatus('O CSV foi lido, mas nao encontrei linhas validas para montar o dashboard.', true);
      return;
    }

    const temMatriz = dadosPrincipais.length > 0;
    const temFilial = dadosComplementares.length > 0;
    const descricaoOrigem = temMatriz && temFilial
      ? 'matriz e filial'
      : temMatriz
        ? 'matriz'
        : 'filial';

    atualizarFonteAtual(temMatriz ? origem : 'nenhum CSV importado');
    atualizarStatus(`CSV de ${descricaoOrigem} carregado com sucesso. ${baseDados.length} lancamentos encontrados no painel. Limpeza automatica usando ${usaRelatorioBruto ? 'Y, F, G, AN e AR' : 'o modelo padrao'}.${resumirVinculoCadastro(baseDados)}${temFilial && temMatriz ? ` CSV da filial somado com ${dadosComplementares.length} lancamentos.` : ''}`);
    preencherFiltros();
    aplicarFiltros();
  }

  function processarRelatorio(data, colunas, unidadePadrao = '') {
    const usaRelatorioBruto = detectarRelatorioBruto(colunas);
    const colSupervisor = usaRelatorioBruto ? (colunas[indiceColunaExcel('R')] || colunas[indiceColunaExcel('D')] || colunas[indiceColunaExcel('C')]) : (localizarColuna(colunas, ['Supervisor', 'Responsavel', 'Nome motorista', 'Motorista']) || 'Supervisor');
    const colPlaca = usaRelatorioBruto ? colunas[indiceColunaExcel('F')] : (localizarColuna(colunas, ['Placa']) || 'Placa');
    const colVeiculo = usaRelatorioBruto ? colunas[indiceColunaExcel('G')] : (localizarColuna(colunas, ['Veiculo', 'Modelo veiculo', 'Nome Veiculo']) || 'Veiculo');
    const colData = usaRelatorioBruto ? colunas[indiceColunaExcel('Y')] : (localizarColuna(colunas, ['Data', 'Data transacao', 'Data Hora transacao']) || 'Data');
    const colCombustivel = usaRelatorioBruto ? colunas[indiceColunaExcel('AN')] : (localizarColuna(colunas, ['Combustivel', 'Mercadoria']) || 'Combustivel');
    const colValor = usaRelatorioBruto ? colunas[indiceColunaExcel('AR')] : (localizarColuna(colunas, ['Valor', 'Valor total com desconto', 'Valor total']) || 'Valor');
    const colBase = usaRelatorioBruto ? colunas[indiceColunaExcel('D')] : localizarColuna(colunas, ['Base', 'Filial', 'Nome Filial', 'UF']);

    if (!colPlaca || !colVeiculo || !colData || !colCombustivel || !colValor) {
      return { dados: [], usaRelatorioBruto, valido: false };
    }

    const dados = data.map((linha) => ({
      supervisor: String(linha[colSupervisor] || 'Sem agrupamento').trim(),
      placa: String(linha[colPlaca] || '').trim(),
      veiculo: String(linha[colVeiculo] || 'Veiculo nao informado').trim(),
      mes: converterData(linha[colData]),
      combustivel: String(linha[colCombustivel] || 'Nao informado').trim(),
      valor: converterValor(linha[colValor]),
      origemResponsavel: String(linha[colSupervisor] || '').trim() ? 'principal' : 'sem_nome',
      unidade: String(linha[colBase] || unidadePadrao || '').trim() || unidadePadrao || 'Nao identificada'
    })).filter((item) => item.placa && item.veiculo && item.mes && item.combustivel && item.valor >= 0);

    return { dados, usaRelatorioBruto, valido: true };
  }

  function obterSelecionados(select) {
    return Array.from(select.selectedOptions).map((option) => option.value);
  }

  function destruirGrafico(instancia) {
    if (instancia) instancia.destroy();
  }

  function opcoesBaseGrafico() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 16, right: 60, bottom: 8, left: 8 } },
      plugins: {
        legend: { display: false },
        datalabels: {
          color: '#163047',
          anchor: 'end',
          align: 'end',
          offset: 4,
          clamp: false,
          clip: false,
          font: { weight: 'bold', size: 11 },
          formatter: (valor) => valor > 0 ? formatarBRL(valor) : ''
        },
        tooltip: {
          callbacks: {
            label: (context) => formatarBRL(context.parsed.y ?? context.parsed.x ?? 0)
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (value) => formatarBRL(value) } },
        x: { ticks: { color: '#60758a' } }
      }
    };
  }

  function preencherFiltros() {
    const unidades = [...new Set(baseDados.map((item) => item.unidade))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const supervisores = [...new Set(baseDados.map((item) => item.supervisor))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const placas = [...new Set(baseDados.map((item) => item.placa))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const combustiveis = [...new Set(baseDados.map((item) => item.combustivel))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const meses = [...new Set(baseDados.map((item) => item.mes))].sort();

    unidadeFiltro.innerHTML = '<option value="">Todas as unidades</option>' + unidades.map((item) => `<option value="${item}">${item}</option>`).join('');
    supervisorFiltro.innerHTML = '<option value="">Todos os responsaveis</option>' + supervisores.map((item) => `<option value="${item}">${item}</option>`).join('');
    placaFiltro.innerHTML = placas.map((placa) => {
      const exemplo = baseDados.find((item) => item.placa === placa);
      return `<option value="${placa}">${placa} - ${exemplo ? exemplo.veiculo : ''}</option>`;
    }).join('');
    combustivelFiltro.innerHTML = combustiveis.map((tipo) => {
      const total = baseDados.filter((item) => item.combustivel === tipo).reduce((soma, item) => soma + item.valor, 0);
      return `<option value="${tipo}">${tipo} - ${formatarBRL(total)}</option>`;
    }).join('');

    if (meses.length) {
      mesInicio.value = meses[0];
      mesFim.value = meses[meses.length - 1];
    }
  }

  function atualizarCards(dados) {
    const total = dados.reduce((soma, item) => soma + item.valor, 0);
    cardTotal.textContent = formatarBRL(total);
    cardSupervisores.textContent = String(new Set(dados.map((item) => item.supervisor)).size);
    cardPlacas.textContent = String(new Set(dados.map((item) => item.placa)).size);
    cardTicket.textContent = formatarBRL(dados.length ? total / dados.length : 0);
  }

  function atualizarGraficoMensal(dados) {
    const agrupado = {};
    dados.forEach((item) => { agrupado[item.mes] = (agrupado[item.mes] || 0) + item.valor; });
    const labels = Object.keys(agrupado).sort();
    const valores = labels.map((label) => agrupado[label]);
    const maiorValor = valores.length ? Math.max(...valores) : 0;
    destruirGrafico(chartMensal);
    chartMensal = new Chart(document.getElementById('graficoMensal').getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ data: valores, backgroundColor: '#0a5678', borderRadius: 8 }] },
      options: {
        ...opcoesBaseGrafico(),
        layout: { padding: { top: 28, right: 60, bottom: 8, left: 8 } },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: maiorValor ? maiorValor * 1.15 : undefined,
            ticks: { callback: (value) => formatarBRL(value) }
          },
          x: {
            ticks: { color: '#60758a' }
          }
        }
      }
    });
  }

  function atualizarGraficoTipo(dados) {
    const agrupado = {};
    dados.forEach((item) => { agrupado[item.combustivel] = (agrupado[item.combustivel] || 0) + item.valor; });
    const ranking = Object.entries(agrupado).sort((a, b) => b[1] - a[1]);
    destruirGrafico(chartTipo);
    chartTipo = new Chart(document.getElementById('graficoTipo').getContext('2d'), {
      type: 'bar',
      data: { labels: ranking.map(([nome]) => nome), datasets: [{ data: ranking.map(([, valor]) => valor), backgroundColor: ['#ff6b35', '#fb3f3a', '#0a5678', '#17a673', '#ffc38f'], borderRadius: 8 }] },
      options: { ...opcoesBaseGrafico(), indexAxis: 'y' }
    });
  }

  function atualizarGraficoPlaca(dados) {
    const agrupado = {};
    dados.forEach((item) => {
      const chave = `${item.placa} - ${item.veiculo}`;
      agrupado[chave] = (agrupado[chave] || 0) + item.valor;
    });
    const ranking = Object.entries(agrupado).sort((a, b) => b[1] - a[1]);
    const altura = Math.max(420, ranking.length * 36);
    document.getElementById('graficoPlaca').parentElement.style.height = `${altura}px`;
    destruirGrafico(chartPlaca);
    chartPlaca = new Chart(document.getElementById('graficoPlaca').getContext('2d'), {
      type: 'bar',
      data: { labels: ranking.map(([nome]) => nome), datasets: [{ data: ranking.map(([, valor]) => valor), backgroundColor: '#0a5678', borderRadius: 8 }] },
      options: { ...opcoesBaseGrafico(), indexAxis: 'y' }
    });
  }

  function atualizarResumoCombustivel(dados) {
    if (!dados.length) {
      combustivelResumo.className = 'empty';
      combustivelResumo.textContent = 'Nenhum dado encontrado para o tipo de combustivel selecionado.';
      return;
    }
    const agrupado = {};
    dados.forEach((item) => {
      if (!agrupado[item.combustivel]) agrupado[item.combustivel] = { total: 0, placas: new Set(), lancamentos: 0 };
      agrupado[item.combustivel].total += item.valor;
      agrupado[item.combustivel].placas.add(item.placa);
      agrupado[item.combustivel].lancamentos += 1;
    });
    const linhas = Object.entries(agrupado).sort((a, b) => b[1].total - a[1].total);
    combustivelResumo.className = '';
    combustivelResumo.innerHTML = `<div class="table-scroll"><table class="responsive-table"><thead><tr><th>Combustivel</th><th>Total</th><th>Placas</th><th>Lancamentos</th></tr></thead><tbody>${linhas.map(([tipo, info]) => `<tr><td data-label="Combustivel">${tipo}</td><td data-label="Total">${formatarBRL(info.total)}</td><td data-label="Placas">${info.placas.size}</td><td data-label="Lancamentos">${info.lancamentos}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function atualizarResumoResponsavel(dados) {
    if (!dados.length) {
      responsavelResumo.className = 'empty';
      responsavelResumo.textContent = 'Nenhum dado encontrado para os responsaveis selecionados.';
      return;
    }
    const agrupado = {};
    dados.forEach((item) => {
      const chave = `${item.supervisor}|||${item.unidade}`;
      if (!agrupado[chave]) agrupado[chave] = { responsavel: item.supervisor, unidade: item.unidade, total: 0, placas: new Set(), lancamentos: 0 };
      agrupado[chave].total += item.valor;
      agrupado[chave].placas.add(item.placa);
      agrupado[chave].lancamentos += 1;
    });
    const linhas = Object.values(agrupado).sort((a, b) => b.total - a.total);
    responsavelResumo.className = '';
    responsavelResumo.innerHTML = `<div class="table-scroll"><table class="responsive-table"><thead><tr><th>Responsavel</th><th>Unidade</th><th>Total gasto</th><th>Placas</th><th>Lancamentos</th></tr></thead><tbody>${linhas.map((linha) => `<tr><td data-label="Responsavel">${linha.responsavel}</td><td data-label="Unidade">${linha.unidade}</td><td data-label="Total gasto">${formatarBRL(linha.total)}</td><td data-label="Placas">${linha.placas.size}</td><td data-label="Lancamentos">${linha.lancamentos}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function atualizarTabela(dados) {
    if (!dados.length) {
      tabelaContainer.className = 'empty';
      tabelaContainer.textContent = 'Nenhum dado encontrado com os filtros aplicados.';
      return;
    }
    const resumo = {};
    dados.forEach((item) => {
      const chave = `${item.unidade}|||${item.supervisor}|||${item.placa}|||${item.veiculo}`;
      if (!resumo[chave]) resumo[chave] = { supervisor: item.supervisor, unidade: item.unidade, placa: item.placa, veiculo: item.veiculo, combustivel: item.combustivel, total: 0, lancamentos: 0 };
      if (resumo[chave].combustivel !== item.combustivel) resumo[chave].combustivel = 'Multiplos';
      resumo[chave].total += item.valor;
      resumo[chave].lancamentos += 1;
    });
    const linhas = Object.values(resumo).sort((a, b) => b.total - a.total);
    tabelaContainer.className = '';
    tabelaContainer.innerHTML = `<div class="table-scroll"><table class="responsive-table"><thead><tr><th>Unidade</th><th>Responsavel</th><th>Placa</th><th>Veiculo</th><th>Combustivel</th><th>Total</th><th>Lancamentos</th></tr></thead><tbody>${linhas.map((linha) => `<tr><td data-label="Unidade">${linha.unidade}</td><td data-label="Responsavel">${linha.supervisor}</td><td data-label="Placa">${linha.placa}</td><td data-label="Veiculo">${linha.veiculo}</td><td data-label="Combustivel">${linha.combustivel}</td><td data-label="Total">${formatarBRL(linha.total)}</td><td data-label="Lancamentos">${linha.lancamentos}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function resumirVinculoCadastro(dados) {
    if (!resumoCadastro || !resumoCadastro.validos) return '';
    const vinculados = dados.filter((item) => item.origemResponsavel === 'cadastro').length;
    const placasComNome = new Set(dados.filter((item) => item.origemResponsavel === 'cadastro').map((item) => item.placa)).size;
    return ` Cruzamento com a filial aplicado em ${placasComNome} placas e ${vinculados} lancamentos.`;
  }

  function aplicarFiltros() {
    if (!baseDados.length) return;
    const unidade = unidadeFiltro.value;
    const supervisor = supervisorFiltro.value;
    const placas = obterSelecionados(placaFiltro);
    const combustiveisSelecionados = obterSelecionados(combustivelFiltro);
    const inicio = mesInicio.value || '0000-00';
    const fim = mesFim.value || '9999-12';

    const filtrado = baseDados.filter((item) => {
      const okUnidade = !unidade || item.unidade === unidade;
      const okSupervisor = !supervisor || item.supervisor === supervisor;
      const okPlaca = !placas.length || placas.includes(item.placa);
      const okCombustivel = !combustiveisSelecionados.length || combustiveisSelecionados.includes(item.combustivel);
      const okPeriodo = item.mes >= inicio && item.mes <= fim;
      return okUnidade && okSupervisor && okPlaca && okCombustivel && okPeriodo;
    });

    atualizarCards(filtrado);
    atualizarGraficoMensal(filtrado);
    atualizarGraficoTipo(filtrado);
    atualizarGraficoPlaca(filtrado);
    atualizarResumoResponsavel(filtrado);
    atualizarResumoCombustivel(filtrado);
    atualizarTabela(filtrado);
  }

  function limparTela() {
    baseDados = [];
    dadosPrincipais = [];
    dadosComplementares = [];
    cadastroResponsaveis = new Map();
    resumoCadastro = null;
    ultimoTextoPrincipal = '';
    ultimaOrigemPrincipal = '';

    csvFileInput.value = '';
    cadastroFileInput.value = '';
    unidadeFiltro.innerHTML = '<option value="">Todas as unidades</option>';
    supervisorFiltro.innerHTML = '<option value="">Todos os responsaveis</option>';
    placaFiltro.innerHTML = '';
    combustivelFiltro.innerHTML = '';
    mesInicio.value = '';
    mesFim.value = '';

    atualizarCards([]);
    destruirGrafico(chartMensal);
    destruirGrafico(chartTipo);
    destruirGrafico(chartPlaca);
    chartMensal = null;
    chartTipo = null;
    chartPlaca = null;
    document.getElementById('graficoPlaca').parentElement.style.height = '420px';

    responsavelResumo.className = 'empty';
    responsavelResumo.textContent = 'Importe os CSVs para visualizar o total por responsavel.';
    combustivelResumo.className = 'empty';
    combustivelResumo.textContent = 'Importe um CSV para visualizar o resumo por tipo de combustivel.';
    tabelaContainer.className = 'empty';
    tabelaContainer.textContent = 'Importe um CSV para visualizar o resumo por placa e veiculo.';

    atualizarFonteAtual('aguardando carga');
    atualizarFonteCadastro('aguardando carga');
    atualizarStatus('Pagina limpa. Nenhum CSV carregado na sessao atual.');
    atualizarStatusCadastro('Pagina limpa. Se quiser, importe novamente o CSV da filial ou carregue do Supabase.');
    atualizarStatusSalvamento('Salvamento: nenhum upload enviado nesta sessao.');
  }

  function carregarTextoCSV(texto, origem = 'arquivo importado') {
    ultimoTextoPrincipal = texto;
    ultimaOrigemPrincipal = origem;
    Papa.parse(texto, {
      header: true,
      skipEmptyLines: true,
      delimiter: '',
      complete: ({ data, meta }) => {
        const colunas = meta.fields || [];
        const processado = processarRelatorio(data, colunas, 'Matriz SC');

        if (!processado.valido) {
          atualizarStatus('Nao encontrei as colunas exigidas. Para o relatorio bruto, a limpeza automatica usa Y, F, G, AN e AR.', true);
          return;
        }

        dadosPrincipais = processado.dados;

        if (!dadosPrincipais.length) {
          atualizarStatus('O CSV foi lido, mas nao encontrei linhas validas para montar o dashboard.', true);
          return;
        }

        consolidarBase(origem, processado.usaRelatorioBruto);
      },
      error: () => atualizarStatus('Nao foi possivel ler o CSV selecionado.', true)
    });
  }

  function carregarCadastroTexto(texto, origem = 'arquivo da filial') {
    Papa.parse(texto, {
      header: true,
      skipEmptyLines: true,
      delimiter: '',
      complete: ({ data, meta }) => {
        const campos = meta.fields || [];
        if (detectarRelatorioBruto(campos)) {
          const processado = processarRelatorio(data, campos, 'Filial RS');
          dadosComplementares = processado.dados;
          cadastroResponsaveis = construirMapaResponsaveisPorPlaca(dadosComplementares);
          resumoCadastro = {
            linhas: data.length,
            placa: campos[indiceColunaExcel('F')],
            nome: campos[indiceColunaExcel('R')],
            validos: cadastroResponsaveis.size
          };
          atualizarFonteCadastro(`${origem} (${dadosComplementares.length} lancamentos)`);
          atualizarStatusCadastro(`CSV da filial carregado com sucesso. Foram somados ${dadosComplementares.length} lancamentos e encontrados ${cadastroResponsaveis.size} responsaveis pela placa.`);
          if (!ultimoTextoPrincipal) {
            dadosPrincipais = [];
            consolidarBase(origem, processado.usaRelatorioBruto);
            return;
          }
        } else {
          const extraido = extrairCadastroResponsaveis(data, campos);
          cadastroResponsaveis = extraido.mapa;
          resumoCadastro = extraido.info;
          dadosComplementares = [];

          if (!resumoCadastro.placa || !resumoCadastro.nome) {
            atualizarFonteCadastro(origem);
            atualizarStatusCadastro('Nao foi possivel identificar automaticamente as colunas de placa e nome no CSV da filial. Use um cabecalho parecido com "Placa" e "Responsavel" ou "Nome motorista".', true);
            return;
          }

          atualizarFonteCadastro(`${origem} (${resumoCadastro.validos} placas com nome)`);
          atualizarStatusCadastro(`CSV da filial carregado com sucesso. Colunas usadas: ${resumoCadastro.placa} e ${resumoCadastro.nome}. ${resumoCadastro.validos} placas com responsavel encontradas.`);
        }

        if (ultimoTextoPrincipal) carregarTextoCSV(ultimoTextoPrincipal, ultimaOrigemPrincipal || 'arquivo importado');
      },
      error: () => atualizarStatusCadastro('Nao foi possivel ler o CSV da filial.', true)
    });
  }

  function carregarArquivoPadrao() {
    atualizarStatus('Carregando CSV da matriz salvo no Supabase...');
    atualizarStatusCadastro('Carregando CSV da filial salvo no Supabase...');
    atualizarStatusSalvamento('Consultando os ultimos CSVs salvos no Supabase...');

    baixarArquivoSupabase(STORAGE_PATH_MATRIZ)
      .then((textoPrincipal) => {
        ultimoTextoPrincipal = textoPrincipal;
        ultimaOrigemPrincipal = 'Supabase / Matriz SC';

        return baixarArquivoSupabase(STORAGE_PATH_FILIAL)
          .then((textoComplementar) => {
            carregarCadastroTexto(textoComplementar, 'Supabase / Filial');
            atualizarStatusSalvamento('Ultimos CSVs carregados do Supabase com sucesso.', 'success');
          })
          .catch(() => {
            dadosComplementares = [];
            cadastroResponsaveis = new Map();
            resumoCadastro = null;
            atualizarFonteCadastro('nenhum CSV salvo');
            atualizarStatusCadastro('Nenhum CSV da filial salvo no Supabase. O portal carregou apenas a matriz.');
            atualizarStatusSalvamento('Ultimo CSV da matriz carregado do Supabase. Nenhum CSV da filial salvo.', 'success');
            carregarTextoCSV(textoPrincipal, 'Supabase / Matriz SC');
          });
      })
      .catch(() => {
        atualizarFonteAtual('nenhum CSV salvo');
        atualizarStatus('Nao foi possivel localizar um CSV da matriz no Supabase.', true);

        baixarArquivoSupabase(STORAGE_PATH_FILIAL)
          .then((textoComplementar) => {
            atualizarStatusSalvamento('Ultimo CSV da filial carregado do Supabase. Nenhum CSV da matriz salvo.', 'success');
            carregarCadastroTexto(textoComplementar, 'Supabase / Filial');
          })
          .catch(() => {
            atualizarFonteCadastro('nenhum CSV salvo');
            atualizarStatusCadastro('Nao encontrei CSVs salvos no Supabase para matriz ou filial.', true);
            atualizarStatusSalvamento('Nenhum CSV salvo foi encontrado no Supabase.', 'error');
          });
      });
  }

  csvFileInput.addEventListener('change', (event) => {
    const arquivo = event.target.files[0];
    if (!arquivo) return;
    atualizarStatus(`Enviando ${arquivo.name} para o Supabase...`);
    atualizarStatusSalvamento(`Enviando ${arquivo.name} para o Supabase como CSV atual da matriz...`);
    Promise.all([arquivo.text(), uploadArquivoSupabase(STORAGE_PATH_MATRIZ, arquivo)])
      .then(([texto]) => {
        atualizarStatusSalvamento(`Upload concluido. ${arquivo.name} foi salvo no Supabase como CSV atual da matriz.`, 'success');
        carregarTextoCSV(texto, `${arquivo.name} (enviado ao Supabase)`);
      })
      .catch(() => {
        atualizarStatus('Nao foi possivel importar o arquivo selecionado.', true);
        atualizarStatusSalvamento(`Falha ao salvar ${arquivo.name} no Supabase.`, 'error');
      });
  });

  cadastroFileInput.addEventListener('change', (event) => {
    const arquivo = event.target.files[0];
    if (!arquivo) return;
    atualizarStatusCadastro(`Enviando ${arquivo.name} para o Supabase...`);
    atualizarStatusSalvamento(`Enviando ${arquivo.name} para o Supabase como CSV atual da filial...`);
    Promise.all([arquivo.text(), uploadArquivoSupabase(STORAGE_PATH_FILIAL, arquivo)])
      .then(([texto]) => {
        atualizarStatusSalvamento(`Upload concluido. ${arquivo.name} foi salvo no Supabase como CSV atual da filial.`, 'success');
        carregarCadastroTexto(texto, `${arquivo.name} (enviado ao Supabase)`);
      })
      .catch(() => {
        atualizarStatusCadastro('Nao foi possivel importar o CSV da filial.', true);
        atualizarStatusSalvamento(`Falha ao salvar ${arquivo.name} no Supabase.`, 'error');
      });
  });

  document.getElementById('usarPadrao').addEventListener('click', carregarArquivoPadrao);
  document.getElementById('aplicarFiltros').addEventListener('click', aplicarFiltros);
  document.getElementById('limparFiltros').addEventListener('click', limparTela);
  unidadeFiltro.addEventListener('change', aplicarFiltros);
  supervisorFiltro.addEventListener('change', aplicarFiltros);
  placaFiltro.addEventListener('change', aplicarFiltros);
  combustivelFiltro.addEventListener('change', aplicarFiltros);
  mesInicio.addEventListener('change', aplicarFiltros);
  mesFim.addEventListener('change', aplicarFiltros);

  carregarArquivoPadrao();

