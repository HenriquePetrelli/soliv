import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SkeletonChatMessages } from '@/components/skeletons/Skeletons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle,
  Clock,
  Image as ImageIcon,
  MessageCircle,
  RotateCw,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ChatImage from './ChatImage';
import { useMensagens, type Mensagem } from '@/hooks/useMensagens';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import { useConversas } from '@/hooks/useConversas';
import { isTabInBackground, notifyNewMessage } from '@/lib/browserNotifications';
import { FotoInvalidaError, prepararFoto } from '@/lib/chatPhoto';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
  conversaId: string;
  onVoltar: () => void;
}

/** Limite do banco por mensagem. */
const MAX_CARACTERES = 5000;
/** Distância do fim (px) em que ainda se considera "lendo as últimas". */
const PERTO_DO_FIM = 120;

/** Rascunho por conversa: sair e voltar (ou recarregar) não perde o que foi escrito. */
const chaveRascunho = (conversaId: string) => `chat:rascunho:${conversaId}`;
const lerRascunho = (conversaId: string) => {
  try {
    return localStorage.getItem(chaveRascunho(conversaId)) ?? '';
  } catch {
    return '';
  }
};
const salvarRascunho = (conversaId: string, texto: string) => {
  try {
    if (texto.trim()) localStorage.setItem(chaveRascunho(conversaId), texto);
    else localStorage.removeItem(chaveRascunho(conversaId));
  } catch {
    /* armazenamento indisponível: segue só na memória */
  }
};

const getInitials = (name?: string) => {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
};

const StatusEnvio = ({ mensagem }: { mensagem: Mensagem }) => {
  if (mensagem.envio === 'enviando') return <Clock className="h-3.5 w-3.5" aria-label="Enviando" />;
  if (mensagem.envio === 'erro') return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Não enviada" />;
  return mensagem.lida_em ? (
    <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="Lida" />
  ) : (
    <Check className="h-3.5 w-3.5" aria-label="Enviada" />
  );
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ conversaId, onVoltar }) => {
  const [novaMensagem, setNovaMensagem] = useState(() => lerRascunho(conversaId));
  const [imagemSelecionada, setImagemSelecionada] = useState<File | null>(null);
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pertoDoFimRef = useRef(true);
  const totalAnteriorRef = useRef(0);
  const ultimaIdRef = useRef<string | null>(null);
  /** Altura antes de carregar as anteriores: a tela fica onde estava. */
  const alturaAntesRef = useRef<{ altura: number; topo: number } | null>(null);

  const { user, userType } = useAuth();
  // Plano Grátis: o paciente só lê o chat (o psicólogo continua respondendo).
  const { isFree } = usePlanLimits();
  const chatSoLeituraPorPlano = userType === 'patient' && isFree;
  const {
    mensagens,
    loading,
    temAnteriores,
    carregandoAnteriores,
    carregarAnteriores,
    enviarTexto,
    enviarImagem,
    reenviar,
    descartar,
  } = useMensagens(conversaId);
  const { conversas, carregado: conversasCarregadas } = useConversas();
  const knownMessageIdsRef = useRef<Set<string> | null>(null);

  const conversaAtual = conversas.find((c) => c.id === conversaId);
  const nomeOutro = conversaAtual?.outro_usuario?.full_name;

  const irParaOFim = useCallback((suave = true) => {
    fimRef.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'end' });
    setNovasAbaixo(0);
  }, []);

  const aoRolar = () => {
    const el = listaRef.current;
    if (!el) return;
    pertoDoFimRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM;
    if (pertoDoFimRef.current) setNovasAbaixo(0);
  };

  // Rola sozinho só se a pessoa já está no fim ou se a mensagem nova é dela;
  // lendo o histórico, aparece o aviso "novas mensagens" em vez de pular.
  useLayoutEffect(() => {
    const anterior = totalAnteriorRef.current;
    const ultimaAnterior = ultimaIdRef.current;
    totalAnteriorRef.current = mensagens.length;
    ultimaIdRef.current = mensagens[mensagens.length - 1]?.id ?? null;

    // Mensagens anteriores entraram no topo: mantém o que estava na tela.
    const antes = alturaAntesRef.current;
    if (antes && listaRef.current) {
      alturaAntesRef.current = null;
      listaRef.current.scrollTop = listaRef.current.scrollHeight - antes.altura + antes.topo;
    }

    if (mensagens.length === 0) return;
    if (anterior === 0) {
      irParaOFim(false);
      return;
    }
    // Só conta como nova o que entrou depois da última que estava na tela.
    if (mensagens.length <= anterior || ultimaIdRef.current === ultimaAnterior) return;
    const posicao = mensagens.findIndex((m) => m.id === ultimaAnterior);
    const novas = posicao >= 0 ? mensagens.length - 1 - posicao : mensagens.length - anterior;
    const ultima = mensagens[mensagens.length - 1];
    if (pertoDoFimRef.current || ultima.autor_id === user?.id) irParaOFim();
    else setNovasAbaixo((n) => n + novas);
  }, [mensagens, user?.id, irParaOFim]);

  useEffect(() => {
    totalAnteriorRef.current = 0;
    ultimaIdRef.current = null;
    inputRef.current?.focus();
  }, [conversaId]);

  useEffect(() => {
    salvarRascunho(conversaId, novaMensagem);
  }, [conversaId, novaMensagem]);

  const verAnteriores = () => {
    const el = listaRef.current;
    if (el) alturaAntesRef.current = { altura: el.scrollHeight, topo: el.scrollTop };
    void carregarAnteriores();
  };

  // Notifica no navegador quando chega mensagem nova do outro participante
  // e a aba não está em foco. Não dispara para o histórico já carregado.
  useEffect(() => {
    const known = knownMessageIdsRef.current;
    if (known) {
      const novasDeOutro = mensagens.filter((m) => m.autor_id !== user?.id && !known.has(m.id));
      if (novasDeOutro.length > 0 && isTabInBackground()) {
        // Discreto, como o push: a tela bloqueada ou compartilhada não mostra
        // o texto nem com quem a pessoa conversa.
        notifyNewMessage({
          title: 'Nova mensagem no Soliv',
          body: 'Toque para abrir a conversa.',
          onClick: () => irParaOFim(),
        });
      }
    }
    knownMessageIdsRef.current = new Set(mensagens.map((m) => m.id));
  }, [mensagens, user?.id, irParaOFim]);

  // A caixa cresce com o texto (até ~5 linhas), como nos apps de mensagem.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
  }, [novaMensagem]);

  const handleEnviar = () => {
    const texto = novaMensagem.trim();
    if (!texto && !imagemSelecionada) return;
    // A mensagem já aparece na conversa; envio e reenvio ficam com o hook.
    if (imagemSelecionada) {
      enviarImagem(imagemSelecionada);
      setImagemSelecionada(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    if (texto) enviarTexto(texto);
    setNovaMensagem('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra a linha. Durante a composição de acentos
    // (teclados de celular), o Enter é do teclado, não do envio.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleEnviar();
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    // Foto grande de celular é reduzida antes de subir (antes era recusada acima de 5 MB).
    setPreparandoFoto(true);
    try {
      setImagemSelecionada(await prepararFoto(file));
    } catch (error) {
      toast.error(error instanceof FotoInvalidaError ? error.message : 'Não foi possível usar esta foto.');
      input.value = '';
    } finally {
      setPreparandoFoto(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'ativa':
        return {
          icon: <CheckCircle className="h-3.5 w-3.5 text-success" />,
          text: 'Ativa',
          description: 'Você pode enviar mensagens',
        };
      case 'somente_leitura':
        return {
          icon: <Clock className="h-3.5 w-3.5 text-warning" />,
          text: 'Somente leitura',
          description: 'Mensagens pausadas: o chat abre por 30 dias depois de cada consulta e volta na próxima.',
        };
      case 'expirada':
        return {
          icon: <XCircle className="h-3.5 w-3.5 text-destructive" />,
          text: 'Expirada',
          description: 'Esta conversa foi arquivada',
        };
      default:
        return { icon: null, text: status, description: '' };
    }
  };

  // Link de uma conversa que não existe mais (apagada após 3 meses) ou que não é da pessoa.
  if (conversasCarregadas && !conversaAtual) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MessageCircle className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Conversa não encontrada</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Ela pode ter sido apagada (as conversas ficam guardadas por 3 meses) ou não está mais na sua lista.
        </p>
        <Button variant="outline" className="mt-4" onClick={onVoltar}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Ver minhas conversas
        </Button>
      </div>
    );
  }

  const statusInfo = getStatusInfo(conversaAtual?.status || 'ativa');
  const podeEnviarMensagens = conversaAtual?.status === 'ativa' && !chatSoLeituraPorPlano;
  const restante = MAX_CARACTERES - novaMensagem.length;

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card md:h-[calc(100dvh-10rem)]">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onVoltar} className="h-9 w-9 shrink-0" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {getInitials(nomeOutro)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">{nomeOutro}</h3>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-xs">
              {statusInfo.icon}
              {statusInfo.text}
            </Badge>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{statusInfo.description}</span>
          </div>
        </div>
      </div>

      {/* Mensagens */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listaRef}
          onScroll={aoRolar}
          className="h-full space-y-3 overflow-y-auto bg-muted/20 p-4"
          role="log"
          aria-live="polite"
          aria-label="Mensagens da conversa"
        >
          {temAnteriores && mensagens.length > 0 && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={verAnteriores} disabled={carregandoAnteriores}>
                {carregandoAnteriores ? 'Carregando...' : 'Ver mensagens anteriores'}
              </Button>
            </div>
          )}
          {loading && mensagens.length === 0 ? (
            <SkeletonChatMessages count={5} />
          ) : mensagens.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MessageCircle className="h-6 w-6 text-primary" />
              </div>
              <h4 className="text-base font-semibold text-foreground">Nenhuma mensagem ainda</h4>
              <p className="mt-1 text-sm text-muted-foreground">Envie a primeira mensagem.</p>
            </div>
          ) : (
            mensagens.map((mensagem, index) => {
              const isMinhaMsg = mensagem.autor_id === user?.id;
              const previa = mensagens[index - 1];
              const dataMsg = new Date(mensagem.created_at);
              const mostrarDivisor = !previa || !isSameDay(new Date(previa.created_at), dataMsg);
              const falhou = mensagem.envio === 'erro';

              return (
                <React.Fragment key={mensagem.id}>
                  {mostrarDivisor && (
                    <div className="my-2 flex items-center justify-center">
                      <span className="rounded-full border bg-background px-3 py-0.5 text-xs text-muted-foreground">
                        {format(dataMsg, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  )}
                  <div className={cn('flex gap-2', isMinhaMsg ? 'justify-end' : 'justify-start')}>
                    {!isMinhaMsg && (
                      <div className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {getInitials(nomeOutro)}
                      </div>
                    )}
                    <div className={cn('flex max-w-[75%] flex-col', isMinhaMsg ? 'items-end' : 'items-start')}>
                      <div
                        className={cn(
                          'rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                          isMinhaMsg ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border bg-card text-foreground',
                          mensagem.envio === 'enviando' && 'opacity-80',
                          falhou && 'opacity-70',
                        )}
                      >
                        {mensagem.tipo === 'imagem' ? (
                          mensagem.previa ? (
                            <img src={mensagem.previa} alt="Foto sendo enviada" className="h-auto max-h-[280px] max-w-full rounded-lg" />
                          ) : mensagem.imagem_url ? (
                            <ChatImage value={mensagem.imagem_url} alt="Imagem da conversa" className="h-auto max-h-[280px] max-w-full rounded-lg" />
                          ) : (
                            <span className="text-xs">Foto</span>
                          )
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
                        )}
                      </div>
                      <span className="mt-1 flex items-center gap-1 px-1 text-xs text-muted-foreground">
                        {mensagem.envio === 'enviando' ? 'Enviando...' : falhou ? <span className="text-destructive">Não enviada</span> : format(dataMsg, 'HH:mm')}
                        {isMinhaMsg && <StatusEnvio mensagem={mensagem} />}
                      </span>
                      {falhou && isMinhaMsg && (
                        <div className="mt-1 flex items-center gap-1">
                          {mensagem.erro && <span className="max-w-[16rem] px-1 text-xs text-muted-foreground">{mensagem.erro}</span>}
                          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => reenviar(mensagem.id)}>
                            <RotateCw className="h-3 w-3" /> Tentar de novo
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                            onClick={() => descartar(mensagem.id)}
                          >
                            <Trash2 className="h-3 w-3" /> Apagar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
          <div ref={fimRef} />
        </div>

        {novasAbaixo > 0 && (
          <Button
            size="sm"
            onClick={() => irParaOFim()}
            className="absolute bottom-3 left-1/2 h-8 -translate-x-1/2 gap-1.5 rounded-full shadow-md"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {novasAbaixo === 1 ? '1 nova mensagem' : `${novasAbaixo} novas mensagens`}
          </Button>
        )}
      </div>

      {/* Caixa de mensagem */}
      {podeEnviarMensagens ? (
        <div className="border-t border-border bg-card p-3">
          {imagemSelecionada && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted p-2">
              <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-sm">{imagemSelecionada.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Remover foto"
                onClick={() => {
                  setImagemSelecionada(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
            <Button
              variant="ghost"
              size="icon"
              disabled={preparandoFoto}
              onClick={() => fileInputRef.current?.click()}
              className="h-10 w-10 shrink-0 text-muted-foreground hover:text-primary"
              aria-label="Anexar imagem"
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Textarea
              ref={inputRef}
              rows={1}
              value={novaMensagem}
              maxLength={MAX_CARACTERES}
              onChange={(e) => setNovaMensagem(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              aria-label="Mensagem"
              className="max-h-[136px] min-h-10 flex-1 resize-none rounded-2xl border-transparent bg-muted/50 py-2.5 focus-visible:bg-background"
            />
            <Button
              onClick={handleEnviar}
              disabled={preparandoFoto || (!novaMensagem.trim() && !imagemSelecionada)}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full text-primary-foreground"
              aria-label="Enviar mensagem"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {restante < 200 && <p className="mt-1 text-right text-xs text-muted-foreground">{restante} caracteres restantes</p>}
        </div>
      ) : (
        <div className="border-t border-border bg-muted/40 p-3">
          {chatSoLeituraPorPlano && conversaAtual?.status === 'ativa' ? (
            <p className="text-center text-xs text-muted-foreground">
              No Plano Grátis o chat é só para leitura.{' '}
              <a href="/subscription-plans" className="font-medium text-primary underline underline-offset-2">
                Ver planos
              </a>
            </p>
          ) : (
            <p className="text-center text-xs text-muted-foreground">{statusInfo.description}</p>
          )}
        </div>
      )}
    </div>
  );
};
