// Verificação do CRP no CFP, lado do painel. A comparação em si fica em
// supabase/functions/_shared/crp.ts (a função do servidor usa a mesma).
export * from '../../supabase/functions/_shared/crp';

/** Página de consulta do Cadastro Nacional de Psicólogas(os). */
export const CFP_SEARCH_URL = 'https://cadastro.cfp.org.br/';
export const CFP_ORIGIN = 'https://cadastro.cfp.org.br';

/** Nome da janela do CFP aberta pelo painel (reaproveitada entre consultas). */
export const CFP_WINDOW_NAME = 'soliv-cfp';

/**
 * Código do atalho do navegador. Roda na página do CFP, depois que o admin
 * resolveu o reCAPTCHA e fez a busca: lê a tabela de resultados, envia para a
 * janela do painel que abriu o CFP (postMessage, só para a origem do painel)
 * e também copia o resultado, para colar no painel se a janela não estiver
 * ligada (CFP aberto por fora do botão do painel).
 *
 * Os índices das colunas vêm dos títulos (Situação, Nome, Região, Nº de
 * registro, Data de Inscrição), então a ordem das colunas pode mudar.
 */
export const buildCfpBookmarkletSource = (appOrigin: string): string => `(function(){
var O=${JSON.stringify(appOrigin)};
function t(e){return (e&&e.textContent||'').replace(/\\s+/g,' ').trim();}
var rows=[],tables=document.querySelectorAll('table');
for(var i=0;i<tables.length;i++){
var tb=tables[i],hc=tb.querySelectorAll('thead th'),trs=[].slice.call(tb.querySelectorAll('tbody tr'));
if(!hc.length){var all=[].slice.call(tb.querySelectorAll('tr'));if(!all.length)continue;hc=all[0].querySelectorAll('th,td');trs=all.slice(1);}
var hs=[].map.call(hc,function(h){return t(h).toLowerCase();});
var ix=function(k){for(var j=0;j<hs.length;j++){if(hs[j].indexOf(k)>=0)return j;}return -1;};
var cS=ix('situa'),cN=ix('nome'),cR=ix('regi'),cG=ix('registro'),cD=ix('inscri');
if(cN<0||cG<0)continue;
trs.forEach(function(tr){var d=tr.querySelectorAll('td');if(d.length<=Math.max(cN,cG))return;
rows.push({situacao:cS<0?'':t(d[cS]),nome:t(d[cN]),regiao:cR<0?'':t(d[cR]),registro:t(d[cG]),inscricao:cD<0?'':t(d[cD])});});
}
if(!rows.length){alert('Soliv: nenhum resultado nesta página. Faça a busca no site do CFP e clique no atalho de novo.');return;}
var q=document.querySelector('input[type=text],input[type=search],input:not([type])');
var p={source:'soliv-cfp',version:1,rows:rows,query:q?q.value:'',capturedAt:new Date().toISOString()};
var sent=false;
try{if(window.opener&&!window.opener.closed){window.opener.postMessage(p,O);sent=true;}}catch(e){}
var s=JSON.stringify(p);
function done(c){alert('Soliv: '+rows.length+' resultado(s) lido(s). '+(sent?'Enviado(s) ao painel: volte para a aba do Soliv.':(c?'Copiado(s): volte ao painel do Soliv e cole em "Colar resultado".':'Não foi possível enviar nem copiar. Abra o CFP pelo botão do painel.')));}
function fb(){try{var a=document.createElement('textarea');a.value=s;document.body.appendChild(a);a.select();var ok=document.execCommand('copy');a.remove();done(ok);}catch(e){done(false);}}
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){done(true);},fb);}else{fb();}
})();`;

/** Link "javascript:" do atalho, para arrastar até a barra de favoritos. */
export const buildCfpBookmarkletHref = (appOrigin: string): string =>
  `javascript:${encodeURIComponent(buildCfpBookmarkletSource(appOrigin))}`;
