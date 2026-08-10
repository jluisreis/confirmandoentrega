/**
 * Backend em Google Apps Script para o Painel de Entregas - Nobre Lar
 *
 * Rota registrada no Roteador.gs como: ?acao=entregas
 *
 * Sub-operações internas via o parâmetro "action" (mantido como estava,
 * separado do "acao" do roteador para não quebrar o front existente):
 *
 *   Listar pedidos:
 *     ?acao=entregas&action=listar&secret=...&nivel=NORMAL
 *
 *   Confirmar entrega:
 *     ?acao=entregas&action=confirmar&secret=...&row=5&data=03/07/26&hora=14:30
 *     (data e hora são opcionais — se omitidos usa o momento atual)
 *
 * ⚠️  IMPORTANTE: sempre que alterar o código, crie uma NOVA implantação
 *    (não edite a existente) para que as mudanças entrem em vigor.
 *
 * Por que tudo via GET?
 * O browser bloqueia POST com JSON para domínios externos (CORS preflight).
 * O Apps Script não retorna os cabeçalhos CORS necessários para o preflight,
 * então o POST nunca chega ao doPost(). A solução é enviar tudo via GET
 * com query params — o Apps Script responde com CORS correto em doGet().
 *
 * ⚡ CACHE (NOVO): _listarEntregas agora guarda o resultado já processado no
 * CacheService por CACHE_TTL_SEGUNDOS segundos. Chamadas repetidas dentro da
 * janela de TTL respondem quase instantaneamente, sem tocar a planilha. O
 * cache é invalidado automaticamente sempre que uma entrega é confirmada.
 *
 * ⚡ JANELA DE 2 MESES + ARQUIVAMENTO (NOVO): o sistema só considera pedidos
 * dos últimos JANELA_MESES_SISTEMA meses (rolante). Pedidos mais antigos
 * devem ser fisicamente movidos para a aba "Histórico" pela função
 * arquivarPedidosAntigos() — isso é o que resolve lentidão em planilhas
 * grandes, já que getDataRange().getValues() sempre lê a aba inteira,
 * independente de quantas linhas passam pelo filtro depois. Configure um
 * gatilho (Trigger) de horário para rodar arquivarPedidosAntigos() uma vez
 * por dia, de madrugada (ver instruções detalhadas junto com este arquivo).
 */

const SHEET_NAME_ENTREGAS = 'Vendas/Faturamento/Entregas'; // nome da aba na planilha
const SHEET_NAME_LOGIN    = 'LOGIN';                        // 🔥 NOVO: aba com USER/SENHA
const SHARED_SECRET       = 'CONFIRM_ENTREGA';              // igual ao VITE_APPS_SCRIPT_SECRET
const TIMEZONE_ENTREGAS   = 'America/Fortaleza';

// ⚡ NOVO: chave e TTL do cache de listagem (ver comentário no topo do arquivo)
const CACHE_KEY_PEDIDOS   = 'pedidos_visiveis_v1';
const CACHE_TTL_SEGUNDOS  = 25; // ajuste conforme a tolerância de "atraso" aceitável

// 🔥 NOVO: mapeia cada USER da aba LOGIN para o nome usado na coluna
// RESPONSAVEL da planilha de entregas. ADMINISTRACAO é um caso especial:
// loga como "JULIO CEZAR", mas pode escolher outro responsável na hora de
// confirmar a entrega (ver RESPONSAVEIS_DISPONIVEIS).
const RESPONSAVEL_POR_USUARIO = {
  'ADMINISTRACAO': 'JULIO CEZAR',
  'JULIO':         'JULIO',
  'VICTOR':        'VICTOR',
  'FELIPE':        'FELIPE',
  'PAULO FELIPE':  'PAULO FELIPE',
  'DADA':          'DADA',
};

// Lista de responsáveis que o login ADMINISTRACAO pode escolher manualmente
// ao confirmar uma entrega.
const RESPONSAVEIS_DISPONIVEIS = ['JULIO CEZAR', 'JULIO', 'VICTOR', 'FELIPE', 'PAULO FELIPE', 'DADA'];
const LOGISTICA_ENTREGA    = 'ENTREGA';     // valor para pedidos pendentes
const LOGISTICA_VAI_HOJE   = 'VAI HOJE';    // valor para pedidos que vão sair hoje (também pendentes)
const LOGISTICA_VAI_AMANHA = 'VAI AMANHÃ';  // 🔥 NOVO: pedidos que vão sair amanhã (também pendentes)
const LOGISTICA_AGENDADA   = 'AGENDADA';    // 🔥 NOVO: pedidos com entrega agendada (também pendentes)
const LOGISTICA_ENTREGUE   = 'ENTREGUE';    // valor para pedidos já entregues
const LOGISTICA_RETIRADA   = 'RETIRADA';    // 🔥 NOVO: tratado como equivalente a ENTREGUE
const COLUNA_DATA_PEDIDO   = 'DATA';        // coluna com a data do pedido

// ⚡ NOVO: o sistema só trabalha com pedidos dos últimos JANELA_MESES_SISTEMA
// meses (janela ROLANTE — sempre "hoje menos 2 meses", não uma data fixa).
// Pedidos mais antigos que isso são movidos para a aba SHEET_NAME_HISTORICO
// por arquivarPedidosAntigos() (ver mais abaixo), o que mantém a aba
// principal pequena — é isso que de fato acelera o painel, já que o tempo
// gasto pelo Apps Script cresce com o TAMANHO da planilha lida, não só com
// quantos pedidos aparecem depois de filtrados.
const JANELA_MESES_SISTEMA = 2;
const SHEET_NAME_HISTORICO = 'Histórico';

function _dataCorteRolante() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() - JANELA_MESES_SISTEMA, hoje.getDate());
}

// Status de LOGISTICA que o painel deve exibir/considerar.
// "VAI HOJE" e "RETIRADA" foram adicionados — antes só ENTREGA e ENTREGUE
// apareciam. "VAI AMANHÃ" e "AGENDADA" também foram adicionados como
// pendentes. Isso também alimenta os cards de quantidade (Pendentes/
// Entregues) no front, já que eles são calculados a partir de TUDO que essa
// função devolve: "ENTREGA", "VAI HOJE", "VAI AMANHÃ" e "AGENDADA" entram
// como pendentes (não têm ENTREGUE DATA/HORA); "ENTREGUE" e "RETIRADA"
// entram como entregues (o front trata os dois como a mesma coisa).
const STATUS_LOGISTICA_VISIVEIS = [
  LOGISTICA_ENTREGA,
  LOGISTICA_VAI_HOJE,
  LOGISTICA_VAI_AMANHA,
  LOGISTICA_AGENDADA,
  LOGISTICA_ENTREGUE,
  LOGISTICA_RETIRADA,
];

// ─── helpers internos ────────────────────────────────────────────────────────

function _sheetEntregas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME_ENTREGAS) || ss.getSheets()[0];
}

function _headersEntregas(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn())
           .getValues()[0]
           .map(String);
}

function _colIndexEntregas(headers, name) {
  const idx = headers.indexOf(name);
  if (idx === -1) throw new Error('Coluna não encontrada: ' + name);
  return idx + 1; // 1-based para getRange
}

function _jsonEntregas(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _formatValueEntregas(value, headerName) {
  if (value instanceof Date) {
    const fmt = headerName.indexOf('HORA') >= 0 ? 'HH:mm' : 'dd/MM/yy';
    return Utilities.formatDate(value, TIMEZONE_ENTREGAS, fmt);
  }
  return value;
}

// Converte o valor bruto da coluna DATA (Date do Sheets ou texto "dd/MM/yy"
// / "dd/MM/yyyy") em um objeto Date para permitir comparação com a data de
// corte. Retorna null se não for possível interpretar o valor.
function _paraDataEntregas(value) {
  if (value instanceof Date) return value;
  if (!value) return null;

  const str = String(value).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;

  let dia = Number(m[1]);
  let mes = Number(m[2]);
  let ano = Number(m[3]);
  if (ano < 100) ano += 2000;

  return new Date(ano, mes - 1, dia);
}

// ─── doGet_Entregas: chamado pelo Roteador.gs quando acao=entregas ──────────
// Renomeado de doGet -> doGet_Entregas para não colidir com os demais scripts
// do mesmo projeto (cada arquivo .gs compartilha o mesmo escopo global).
function doGet_Entregas(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const secret = params.secret || '';
    const action = params.action || 'listar';

    // ── autenticação ──────────────────────────────────────────────────────
    if (secret !== SHARED_SECRET) {
      return _jsonEntregas({ ok: false, error: 'Não autorizado' });
    }

    // ── roteamento interno ───────────────────────────────────────────────
    if (action === 'listar') {
      return _listarEntregas(params);
    }

    if (action === 'confirmar') {
      return _confirmarEntrega(params);
    }

    // 🔥 NOVO: autenticação de usuários (aba LOGIN)
    if (action === 'login') {
      return _login(params);
    }

    return _jsonEntregas({ ok: false, error: 'Ação desconhecida: ' + action });

  } catch (err) {
    return _jsonEntregas({ ok: false, error: String(err) });
  }
}

// ─── listar pedidos ──────────────────────────────────────────────────────────
//
// ⚡ ALTERADO: a leitura/filtragem pesada da planilha (tudo que NÃO depende do
// parâmetro "nivel") foi extraída para _obterPedidosVisiveis(), que é cacheada.
// O filtro de "nivel" continua sendo aplicado a cada chamada, mas em cima de
// um array já pronto — isso é instantâneo, então uma única entrada de cache
// serve TODOS os valores de "nivel" sem precisar de uma chave por filtro.
function _listarEntregas(params) {
  const nivelFiltro = params.nivel
    ? String(params.nivel).toUpperCase().trim()
    : null;

  const rows = _obterPedidosVisiveis();

  const resultado = nivelFiltro
    ? rows.filter(o => String(o['NIVEL ENTREGA']).toUpperCase().trim() === nivelFiltro)
    : rows;

  return _jsonEntregas({ ok: true, rows: resultado });
}

// ⚡ NOVO: lê a planilha inteira, aplica os filtros de LOGISTICA/DATA (que são
// os mesmos pra qualquer usuário) e guarda o resultado em cache por
// CACHE_TTL_SEGUNDOS. Enquanto o cache estiver válido, chamadas de listar()
// nem tocam na planilha — só desserializam o JSON do cache, o que é ordens
// de magnitude mais rápido que um getDataRange().getValues().
function _obterPedidosVisiveis() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY_PEDIDOS);
  if (cached) {
    return JSON.parse(cached);
  }

  const sh      = _sheetEntregas();
  const values  = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  const idxData = headers.indexOf(COLUNA_DATA_PEDIDO);
  const cutoff  = _dataCorteRolante();

  const rows = values
    .map((r, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, j) => {
        obj[h] = _formatValueEntregas(r[j], h);
      });
      // valor bruto da data, só para o filtro abaixo — removido antes de retornar
      obj._dataRaw = idxData >= 0 ? r[idxData] : null;
      return obj;
    })
    .filter(o => {
      if (!o['PEDIDO']) return false;

      const logistica = String(o['LOGISTICA'] || '').toUpperCase().trim();
      if (STATUS_LOGISTICA_VISIVEIS.indexOf(logistica) === -1) {
        return false; // Ignora qualquer outro status
      }

      // ⚡ ALTERADO: janela rolante de JANELA_MESES_SISTEMA meses, aplicada a
      // TODOS os pedidos (entregues ou não). Pedidos entregues há mais tempo
      // que isso já devem ter sido movidos para SHEET_NAME_HISTORICO por
      // arquivarPedidosAntigos() — esse filtro aqui é só uma rede de
      // segurança pro intervalo entre uma execução do arquivamento e outra.
      const dataPedido = _paraDataEntregas(o._dataRaw);
      if (!dataPedido || dataPedido < cutoff) return false;

      return true;
    })
    .map(o => {
      delete o._dataRaw;
      return o;
    });

  try {
    cache.put(CACHE_KEY_PEDIDOS, JSON.stringify(rows), CACHE_TTL_SEGUNDOS);
  } catch (err) {
    // O CacheService aceita no máximo 100KB por chave. Se a lista de pedidos
    // crescer além disso, o put() falha silenciosamente aqui — não é
    // crítico, o painel só deixa de se beneficiar do cache e volta a ler a
    // planilha a cada chamada.
  }

  return rows;
}

// ─── arquivamento de pedidos antigos ─────────────────────────────────────────
//
// ⚡ NOVO: move para a aba SHEET_NAME_HISTORICO todo pedido cuja DATA seja
// anterior à janela rolante de JANELA_MESES_SISTEMA meses, e reescreve a aba
// principal só com o que sobrou. Isso é o que de fato resolve a lentidão em
// planilhas grandes: getDataRange().getValues() lê a aba inteira sempre, então
// quanto menor a aba principal, mais rápido tudo fica (a listagem, o cache,
// o login — tudo que hoje faz uma leitura completa).
//
// ⚠️  IMPORTANTE — leia antes de agendar:
// Reescrever a aba principal desloca o número de TODAS as linhas abaixo das
// que forem removidas. O front guarda o número da linha (_row) de cada
// pedido na tela para saber qual linha atualizar ao confirmar uma entrega.
// Se alguém estiver com o painel aberto (ou com dados em cache local) no
// exato momento em que o arquivamento roda, uma confirmação feita logo em
// seguida pode acabar gravando na linha ERRADA.
// Por isso: agende esta função para rodar em um horário SEM uso do painel
// (ex.: de madrugada), nunca durante o expediente. Veja as instruções de
// como criar esse agendamento na mensagem que acompanha este arquivo.
function arquivarPedidosAntigos() {
  const sh      = _sheetEntregas();
  const values  = sh.getDataRange().getValues();
  const headers = values.shift();
  const idxData = headers.indexOf(COLUNA_DATA_PEDIDO);
  const cutoff  = _dataCorteRolante();

  const manter   = [];
  const arquivar = [];

  values.forEach((r) => {
    const dataPedido = idxData >= 0 ? _paraDataEntregas(r[idxData]) : null;
    // linhas sem data reconhecível ficam na aba principal por segurança
    // (evita arquivar por engano algo que não conseguimos interpretar)
    if (dataPedido && dataPedido < cutoff) {
      arquivar.push(r);
    } else {
      manter.push(r);
    }
  });

  if (arquivar.length === 0) {
    return; // nada antigo o suficiente pra mover ainda
  }

  // grava os pedidos antigos na aba de histórico, criando-a se necessário
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let histSheet = ss.getSheetByName(SHEET_NAME_HISTORICO);
  if (!histSheet) {
    histSheet = ss.insertSheet(SHEET_NAME_HISTORICO);
    histSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  const proximaLinhaHistorico = histSheet.getLastRow() + 1;
  histSheet
    .getRange(proximaLinhaHistorico, 1, arquivar.length, headers.length)
    .setValues(arquivar);

  // reescreve a aba principal só com quem ficou (isso é o que encolhe a
  // planilha de verdade — sem isso, o getDataRange() continuaria lendo tudo)
  const totalLinhasAtual = sh.getLastRow() - 1; // exclui o cabeçalho
  if (totalLinhasAtual > 0) {
    sh.getRange(2, 1, totalLinhasAtual, headers.length).clearContent();
  }
  if (manter.length > 0) {
    sh.getRange(2, 1, manter.length, headers.length).setValues(manter);
  }

  _invalidarCachePedidos();

  Logger.log(
    'Arquivamento concluído: %s pedido(s) movido(s) para "%s", %s mantido(s) na aba principal.',
    arquivar.length, SHEET_NAME_HISTORICO, manter.length
  );
}

// ⚡ NOVO: força a próxima chamada de listar() a reler a planilha, em vez de
// servir uma versão desatualizada do cache. Chamado sempre que uma entrega é
// confirmada (ver _confirmarEntrega), pra que o pedido já apareça como
// ENTREGUE na próxima listagem, mesmo que ainda esteja dentro da janela de
// CACHE_TTL_SEGUNDOS.
function _invalidarCachePedidos() {
  CacheService.getScriptCache().remove(CACHE_KEY_PEDIDOS);
}

// ─── login ───────────────────────────────────────────────────────────────────
// 🔥 NOVO: valida usuário/senha contra a aba LOGIN (colunas USER e SENHA) e
// devolve o RESPONSAVEL correspondente, usado para preencher automaticamente
// a coluna RESPONSAVEL ao confirmar uma entrega.
function _login(params) {
  const usuario = String(params.usuario || '').toUpperCase().trim();
  const senha   = String(params.senha || '');

  if (!usuario || !senha) {
    return _jsonEntregas({ ok: false, error: 'Informe usuário e senha' });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME_LOGIN);
  if (!sh) {
    return _jsonEntregas({ ok: false, error: 'Aba de login não encontrada' });
  }

  const values  = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  const idxUser  = headers.indexOf('USER');
  const idxSenha = headers.indexOf('SENHA');
  if (idxUser === -1 || idxSenha === -1) {
    return _jsonEntregas({ ok: false, error: 'Aba de login mal configurada (faltam colunas USER/SENHA)' });
  }

  const linha = values.find(
    (r) => String(r[idxUser] || '').toUpperCase().trim() === usuario
  );

  if (!linha || String(linha[idxSenha]) !== senha) {
    return _jsonEntregas({ ok: false, error: 'Usuário ou senha inválidos' });
  }

  const isAdmin     = usuario === 'ADMINISTRACAO';
  const responsavel = RESPONSAVEL_POR_USUARIO[usuario] || usuario;

  return _jsonEntregas({
    ok: true,
    usuario: usuario,
    responsavel: responsavel,
    isAdmin: isAdmin,
    // só manda a lista de opções pro admin — os demais usuários não podem trocar
    responsaveisDisponiveis: isAdmin ? RESPONSAVEIS_DISPONIVEIS : null,
  });
}

// ─── confirmar entrega ───────────────────────────────────────────────────────
function _confirmarEntrega(params) {
  const row = Number(params.row);
  if (!row || row < 2) {
    return _jsonEntregas({ ok: false, error: 'Linha inválida: ' + params.row });
  }

  const sh      = _sheetEntregas();
  const headers = _headersEntregas(sh);
  const colData      = _colIndexEntregas(headers, 'ENTREGUE DATA');
  const colHora      = _colIndexEntregas(headers, 'ENTREGUE HORA');
  const colLogistica = _colIndexEntregas(headers, 'LOGISTICA');

  const now  = new Date();
  const data = (params.data && String(params.data).trim())
    ? String(params.data).trim()
    : Utilities.formatDate(now, TIMEZONE_ENTREGAS, 'dd/MM/yy');
  const hora = (params.hora && String(params.hora).trim())
    ? String(params.hora).trim()
    : Utilities.formatDate(now, TIMEZONE_ENTREGAS, 'HH:mm');

  sh.getRange(row, colData).setValue(data);
  sh.getRange(row, colHora).setValue(hora);
  sh.getRange(row, colLogistica).setValue('ENTREGUE');

  // 🔥 NOVO: grava quem confirmou a entrega (RESPONSAVEL, vindo do login) e
  // qual veículo foi usado (VEÍCULO, escolhido no popup de confirmação).
  // Ambos são opcionais aqui pra não quebrar chamadas antigas sem esses params.
  const responsavel = params.responsavel ? String(params.responsavel).trim() : '';
  if (responsavel) {
    const colResponsavel = _colIndexEntregas(headers, 'RESPONSAVEL');
    sh.getRange(row, colResponsavel).setValue(responsavel);
  }

  const veiculo = params.veiculo ? String(params.veiculo).trim() : '';
  if (veiculo) {
    const colVeiculo = _colIndexEntregas(headers, 'VEÍCULO');
    sh.getRange(row, colVeiculo).setValue(veiculo);
  }

  // ⚡ NOVO: invalida o cache de listagem para que essa confirmação apareça
  // imediatamente na próxima leitura, em vez de esperar o TTL expirar.
  _invalidarCachePedidos();

  return _jsonEntregas({
    ok: true,
    row: row,
    data: data,
    hora: hora,
    responsavel: responsavel,
    veiculo: veiculo,
  });
}
