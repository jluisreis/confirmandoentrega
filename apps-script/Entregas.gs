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
 */

const SHEET_NAME_ENTREGAS = 'Vendas/Faturamento/Entregas'; // nome da aba na planilha
<<<<<<< HEAD
const SHEET_NAME_LOGIN    = 'LOGIN';                        // 🔥 NOVO: aba com USER/SENHA
const SHARED_SECRET       = 'CONFIRM_ENTREGA';              // igual ao VITE_APPS_SCRIPT_SECRET
const TIMEZONE_ENTREGAS   = 'America/Fortaleza';

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
};

// Lista de responsáveis que o login ADMINISTRACAO pode escolher manualmente
// ao confirmar uma entrega.
const RESPONSAVEIS_DISPONIVEIS = ['JULIO CEZAR', 'JULIO', 'VICTOR', 'FELIPE', 'PAULO FELIPE'];
const LOGISTICA_ENTREGA    = 'ENTREGA';     // valor para pedidos pendentes
const LOGISTICA_VAI_HOJE   = 'VAI HOJE';    // valor para pedidos que vão sair hoje (também pendentes)
const LOGISTICA_VAI_AMANHA = 'VAI AMANHÃ';  // 🔥 NOVO: pedidos que vão sair amanhã (também pendentes)
const LOGISTICA_AGENDADA   = 'AGENDADA';    // 🔥 NOVO: pedidos com entrega agendada (também pendentes)
const LOGISTICA_ENTREGUE   = 'ENTREGUE';    // valor para pedidos já entregues
const LOGISTICA_RETIRADA   = 'RETIRADA';    // 🔥 NOVO: tratado como equivalente a ENTREGUE
const COLUNA_DATA_PEDIDO   = 'DATA';        // coluna com a data do pedido
const DATA_CORTE_ENTREGAS  = new Date(2026, 5, 1); // 01/06/2026 (mês é 0-indexado: 5 = junho)

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
=======
const SHARED_SECRET       = 'CONFIRM_ENTREGA';              // igual ao VITE_APPS_SCRIPT_SECRET
const TIMEZONE_ENTREGAS   = 'America/Fortaleza';
const LOGISTICA_ENTREGA   = 'ENTREGA';   // valor para pedidos pendentes
const LOGISTICA_VAI_HOJE  = 'VAI HOJE';  // valor para pedidos que vão sair hoje (também pendentes)
const LOGISTICA_ENTREGUE  = 'ENTREGUE';  // valor para pedidos já entregues
const LOGISTICA_RETIRADA  = 'RETIRADA';  // 🔥 NOVO: tratado como equivalente a ENTREGUE
const COLUNA_DATA_PEDIDO  = 'DATA';      // coluna com a data do pedido
const DATA_CORTE_ENTREGAS = new Date(2026, 5, 1); // 01/06/2026 (mês é 0-indexado: 5 = junho)

// Status de LOGISTICA que o painel deve exibir/considerar.
// "VAI HOJE" e "RETIRADA" foram adicionados — antes só ENTREGA e ENTREGUE
// apareciam. Isso também alimenta os cards de quantidade (Pendentes/
// Entregues) no front, já que eles são calculados a partir de TUDO que essa
// função devolve: "VAI HOJE" entra como pendente (não tem ENTREGUE DATA/
// HORA); "ENTREGUE" e "RETIRADA" entram como entregues (o front trata os
// dois como a mesma coisa).
const STATUS_LOGISTICA_VISIVEIS = [
  LOGISTICA_ENTREGA,
  LOGISTICA_VAI_HOJE,
>>>>>>> 52a6073d71e3acf843ec724f9fd5cb1555860101
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

<<<<<<< HEAD
    // 🔥 NOVO: autenticação de usuários (aba LOGIN)
    if (action === 'login') {
      return _login(params);
    }

=======
>>>>>>> 52a6073d71e3acf843ec724f9fd5cb1555860101
    return _jsonEntregas({ ok: false, error: 'Ação desconhecida: ' + action });

  } catch (err) {
    return _jsonEntregas({ ok: false, error: String(err) });
  }
}

// ─── listar pedidos ──────────────────────────────────────────────────────────
function _listarEntregas(params) {
  const sh      = _sheetEntregas();
  const values  = sh.getDataRange().getValues();
  const headers = values.shift().map(String);

  const nivelFiltro = params.nivel
    ? String(params.nivel).toUpperCase().trim()
    : null;

  const idxData = headers.indexOf(COLUNA_DATA_PEDIDO);

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

      // 🔥 ALTERADO: Aceita pedidos com LOGISTICA = "ENTREGA", "VAI HOJE" ou
      // "ENTREGUE". Isso alimenta tanto a listagem quanto os cards de
      // quantidade (Pendentes/Entregues) calculados no front a partir desses
      // mesmos dados.
      const logistica = String(o['LOGISTICA'] || '').toUpperCase().trim();
      if (STATUS_LOGISTICA_VISIVEIS.indexOf(logistica) === -1) {
        return false; // Ignora qualquer outro status
      }

      // 🔥 ALTERADO: o pedido aparece no painel se ELE JÁ FOI ENTREGUE
      // (ENTREGUE ou RETIRADA, não importa a data) OU se foi feito a partir
      // de 01/06 (inclusive). Antes, mesmo pedidos já entregues sumiam do
      // painel se a DATA do pedido fosse anterior a 01/06.
      const dataPedido  = _paraDataEntregas(o._dataRaw);
      const jaEntregue  = (logistica === LOGISTICA_ENTREGUE || logistica === LOGISTICA_RETIRADA);
      const dataValida  = Boolean(dataPedido) && dataPedido >= DATA_CORTE_ENTREGAS;
      if (!jaEntregue && !dataValida) return false;

      // Filtro opcional por NÍVEL ENTREGA
      if (nivelFiltro &&
          String(o['NIVEL ENTREGA']).toUpperCase().trim() !== nivelFiltro) {
        return false;
      }

      return true;
    })
    .map(o => {
      delete o._dataRaw;
      return o;
    });

  return _jsonEntregas({ ok: true, rows: rows });
}

<<<<<<< HEAD
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

=======
>>>>>>> 52a6073d71e3acf843ec724f9fd5cb1555860101
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

<<<<<<< HEAD
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

  return _jsonEntregas({
    ok: true,
    row: row,
    data: data,
    hora: hora,
    responsavel: responsavel,
    veiculo: veiculo,
  });
}
=======
  return _jsonEntregas({ ok: true, row: row, data: data, hora: hora });
}
>>>>>>> 52a6073d71e3acf843ec724f9fd5cb1555860101
