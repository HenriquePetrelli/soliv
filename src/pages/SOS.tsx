import { useState, useEffect, useRef } from "react";
import { Phone, ShieldCheck, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import SosBreathingDialog from "@/components/sos/SosBreathingDialog";
import SosSafetyPlanDialog from "@/components/sos/SosSafetyPlanDialog";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/PageHeader";
import { useNavigate, useLocation } from "react-router-dom";
import CancelConfirmationModal from "@/components/sos/CancelConfirmationModal";
import { hasDangerRisk, hasSelfHarmRisk, saveSosTriage, takeSosTriage, type SosTriageKey } from "@/lib/sosTriage";
import { sanitizeSosChannel, saveSosChannel, takeSosChannel, type SosChannel } from "@/lib/sosChannel";
import SupportiveMessages from "@/components/sos/SupportiveMessages";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from '@/lib/currentUser';
import { useEmergencySOS, type SosDenial } from "@/hooks/useEmergencySOS";
import SosUnavailable from "@/components/sos/SosUnavailable";
import ExtraPurchaseDialog from "@/components/ExtraPurchaseDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { formatCents } from "@/lib/plans";
import { notifySosQueueChanged, subscribeSosQueue } from "@/lib/sosQueueChannel";


/** Server-side TTL for pending SOS requests (finalize_stale_emergency_sessions). */
const QUEUE_TTL_MS = 10 * 60 * 1000;

const formatCountdown = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const SOS = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [availableProfessionals, setAvailableProfessionals] = useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [breathingOpen, setBreathingOpen] = useState(false);
  const [safetyPlanOpen, setSafetyPlanOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(QUEUE_TTL_MS / 1000);
  const [expired, setExpired] = useState(false);
  // SOS recusado (cota do mês, sem plano, conta bloqueada): tela própria, sem busca.
  const [denial, setDenial] = useState<SosDenial | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const { extraPrices } = useSubscription();
  const { cancelRequest, createEmergencyRequest } = useEmergencySOS();
  // Triagem marcada na confirmação: mantém os números certos em destaque na espera.
  const [triage, setTriage] = useState<SosTriageKey[]>([]);
  const [channel, setChannel] = useState<SosChannel>('video');

  
  // Get requestId from navigation state (passed from SOSButton)
  const expectedRequestId = location.state?.requestId;
  
  // Use ref to store requestId for cleanup without causing re-renders
  const requestIdRef = useRef<string | null>(null);
  const acceptedRef = useRef<boolean>(false);
  
  // Update ref when requestId changes
  useEffect(() => {
    requestIdRef.current = requestId;
  }, [requestId]);

  // Cleanup function that runs only when component unmounts (user leaves the page)
  useEffect(() => {
    return () => {
      // Only cleanup if we have a requestId, the request was NOT accepted, and we're leaving the page
      if (requestIdRef.current && !acceptedRef.current) {
        console.log(`User left SOS page without acceptance, cleaning up pending request: ${requestIdRef.current}`);
        cancelRequest(requestIdRef.current, 'abandoned')
          .catch(console.error)
          .finally(() => notifySosQueueChanged({ requestId: requestIdRef.current }));
      } else if (acceptedRef.current) {
        console.log('Skipping cleanup: emergency was accepted, preserving request and session.');
      }
    };
  }, []); // Empty dependency array - only runs on unmount

  // O beacon não manda cabeçalho de login: vai o token no corpo, para o
  // servidor confirmar que é o próprio paciente cancelando o pedido.
  const accessTokenRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      accessTokenRef.current = data.session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Closing the tab / app must also drop the request from the psychologist queue.
  useEffect(() => {
    const handleUnload = () => {
      const id = requestIdRef.current;
      if (!id || acceptedRef.current || !userId || !accessTokenRef.current) return;

      const payload = JSON.stringify({ request_id: id, patient_id: userId, access_token: accessTokenRef.current });
      try {
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emergency-cleanup`,
          new Blob([payload], { type: 'application/json' })
        );
      } catch (error) {
        console.error('[SOS] failed to cleanup on unload', error);
      }
      notifySosQueueChanged({ requestId: id });
    };

    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [userId]);


  // Fetch latest emergency request for current user and subscribe for acceptance
  useEffect(() => {
    let reqChannel: any = null;
    
    // Listen for emergency acceptance events
    const handleEmergencyAccepted = (event: CustomEvent) => {
      const { sessionId, requestId } = event.detail;
      console.log('Emergency accepted, redirecting to call:', { sessionId, requestId });
      acceptedRef.current = true;
      navigate(`/emergency-call/${sessionId}?userType=patient&requestId=${requestId}`);
    };
    
    window.addEventListener('emergencyAccepted', handleEmergencyAccepted as EventListener);
    
    const init = async () => {
      const { data: auth } = await getSessionUser();
      const currentUserId = auth.user?.id;
      if (!currentUserId) {
        navigate('/home');
        return;
      }
      
      setUserId(currentUserId);

      // If we have an expected requestId from navigation, use it
      // Otherwise, get the most recent pending request
      let data: any = null;
      
      if (expectedRequestId) {
        // Fetch the specific request we just created
        const { data: specificRequest } = await supabase
          .from('emergency_requests')
          .select('id, status, room_url, video_room_id, created_at, channel')
          .eq('id', expectedRequestId)
          .eq('patient_id', currentUserId)
          .maybeSingle();
        data = specificRequest;
      } else {
        // Fallback: Get the most recent pending request
        const { data: latestRequest } = await supabase
          .from('emergency_requests')
          .select('id, status, room_url, video_room_id, created_at, channel')
          .eq('patient_id', currentUserId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        data = latestRequest;
      }

      // If no existing request, create one now
      if (!data) {
        try {
          console.log('🆘 No existing request found, creating one from SOS page...');
          let denied = false;
          const chosenTriage = takeSosTriage();
          setTriage(chosenTriage);
          const chosenChannel = takeSosChannel();
          setChannel(chosenChannel);
          const newId = await createEmergencyRequest({
            triage: chosenTriage,
            channel: chosenChannel,
            onDenied: (info) => {
              denied = true;
              setDenial(info);
            },
          });
          if (denied) {
            setLoading(false);
            return;
          }
          if (newId) {
            const { data: created } = await supabase
              .from('emergency_requests')
              .select('id, status, room_url, video_room_id, created_at, channel')
              .eq('id', newId)
              .maybeSingle();
            data = created;
          }
        } catch (err) {
          console.error('❌ Failed to create emergency request from SOS page:', err);
          setLoading(false);
          navigate('/home');
          return;
        }
      }

      if (data) {
        const id = (data as any).id as string;
        setRequestId(id);
        setChannel(sanitizeSosChannel((data as { channel?: unknown }).channel));
        setCreatedAt((data as any).created_at ?? new Date().toISOString());
        // Wake up every psychologist dashboard immediately.
        notifySosQueueChanged({ requestId: id });


        // Only navigate to call if this specific request is accepted
        const sessionId = (data as any).video_room_id || (data as any).room_url;
        if (['accepted', 'in_progress'].includes((data as any).status) && sessionId) {
          acceptedRef.current = true;
          navigate(`/emergency-call/${sessionId}?userType=patient&requestId=${id}`);
          return;
        }

        // Subscribe to updates for this request
        reqChannel = supabase
          .channel(`emergency_watch_${id}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'emergency_requests', filter: `id=eq.${id}` }, (payload) => {
            const n = payload.new as any;
            const sessionId = n.video_room_id || n.room_url;
            if (['accepted', 'in_progress'].includes(n.status) && sessionId) {
              console.log('✅ Realtime acceptance received. Redirecting to call.', { sessionId, id });
              acceptedRef.current = true;
              navigate(`/emergency-call/${sessionId}?userType=patient&requestId=${id}`);
              if (reqChannel) supabase.removeChannel(reqChannel);
            } else if (['cancelled', 'completed'].includes(n.status)) {
              // The server finalized the wait (10 min TTL) — say it explicitly.
              acceptedRef.current = true;
              setExpired(true);
            }
          })
          .subscribe();
      }
      setLoading(false);
    };

    init();

    return () => {
      if (reqChannel) supabase.removeChannel(reqChannel);
      window.removeEventListener('emergencyAccepted', handleEmergencyAccepted as EventListener);
    };
  }, [navigate]);

  // Rede alternativa ao realtime: se o socket cair (tela apagada, troca de
  // Wi-Fi para 4G), o aceite do psicólogo não chegava e o paciente ficava na
  // fila enquanto o psicólogo esperava na sala. Confere o pedido a cada 5s e
  // assim que a internet ou a tela voltam.
  useEffect(() => {
    if (!requestId) return;
    let active = true;
    const checkRequest = async () => {
      if (!active || acceptedRef.current) return;
      const { data } = await supabase
        .from('emergency_requests')
        .select('status, room_url, video_room_id')
        .eq('id', requestId)
        .maybeSingle();
      if (!active || !data || acceptedRef.current) return;
      const sessionId = data.video_room_id || data.room_url;
      if (['accepted', 'in_progress'].includes(data.status) && sessionId) {
        acceptedRef.current = true;
        navigate(`/emergency-call/${sessionId}?userType=patient&requestId=${requestId}`);
      } else if (['cancelled', 'completed', 'expired'].includes(data.status)) {
        acceptedRef.current = true;
        setExpired(true);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkRequest();
    };
    const interval = window.setInterval(checkRequest, 5000);
    window.addEventListener('online', checkRequest);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', checkRequest);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [requestId, navigate]);

  // Track professionals that are really available (fresh heartbeat + free)
  useEffect(() => {
    let active = true;
    const fetchOnline = async () => {
      const { data, error } = await supabase.rpc('count_available_psychologists');
      if (active && !error) setAvailableProfessionals(Number(data ?? 0));
    };
    fetchOnline();

    const channel = supabase
      .channel(`presence_watch_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'psychologist_presence' }, () => {
        fetchOnline();
      })
      .subscribe();

    // A psychologist accepting/declining also changes availability.
    const unsubscribeQueue = subscribeSosQueue(fetchOnline);

    // Fallback polling in case the realtime socket drops
    const interval = window.setInterval(fetchOnline, 8000);

    return () => {
      active = false;
      window.clearInterval(interval);
      unsubscribeQueue();
      supabase.removeChannel(channel);
    };
  }, []);


  // Countdown mirroring the server-side 10 minute TTL for pending requests.
  useEffect(() => {
    if (!createdAt || expired) return;
    const deadline = new Date(createdAt).getTime() + QUEUE_TTL_MS;

    const tick = () => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setExpired(true);
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [createdAt, expired]);



  const handleCancelConfirm = async () => {
    setShowCancelModal(false);
    if (requestId) {
      try {
        console.log(`User manually cancelled request: ${requestId}`);
        await cancelRequest(requestId, 'cancelled_by_patient');
        notifySosQueueChanged({ requestId });

      } catch (error) {
        console.error('Error cancelling request:', error);
      }
    }
    navigate('/home');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Preparando sua solicitação...
      </div>
    );
  }

  const someoneOnline = availableProfessionals > 0;

  if (denial) {
    return (
      <div className="min-h-screen bg-calm flex flex-col">
        <PageHeader title="Solicitar ajuda" onBack={() => navigate('/home')} />
        <SosUnavailable
          denial={denial}
          onBreathe={() => setBreathingOpen(true)}
          onSafetyPlan={() => setSafetyPlanOpen(true)}
          onNavigate={navigate}
          onBuyExtra={() => setBuyOpen(true)}
          extraPriceLabel={formatCents(extraPrices.sos)}
        />
        <ExtraPurchaseDialog
          kind="sos"
          open={buyOpen}
          onOpenChange={setBuyOpen}
          reason={/limite mensal|atendimento do mês/i.test(denial.message) ? denial.message : null}
          // Crédito liberado: recomeça o pedido de SOS do zero.
          onPurchased={() => window.location.assign('/sos')}
        />
        <SosBreathingDialog open={breathingOpen} onOpenChange={setBreathingOpen} inQueue={false} />
        <SosSafetyPlanDialog open={safetyPlanOpen} onOpenChange={setSafetyPlanOpen} inQueue={false} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-calm flex flex-col">
      <PageHeader title="Solicitar ajuda" onBack={() => setShowCancelModal(true)} />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
        {/* Situação do pedido: uma informação de cada vez. */}
        <Card>
          <CardContent className="space-y-5 p-6 text-center">
            {expired ? (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
                  <Phone className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold text-foreground">Ainda não encontramos um psicólogo livre</h2>
                  <p className="text-sm text-muted-foreground">
                    Você não está sozinho. O CVV atende agora, de graça, 24 horas.
                  </p>
                </div>
                {/* Quando ninguém aceita, a pessoa não pode ficar só com "tente de novo". */}
                <div className="grid gap-2">
                  <Button asChild className="min-h-12 w-full">
                    <a href="tel:188">
                      <Phone className="h-4 w-4" />
                      Ligar para o CVV (188)
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Tenta de novo do mesmo jeito que a pessoa escolheu.
                      saveSosChannel(channel);
                      saveSosTriage(triage);
                      window.location.reload();
                    }}
                    className="min-h-12 w-full"
                  >
                    Tentar de novo com um psicólogo
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Este pedido não conta no seu SOS do mês: ele só é usado quando um atendimento começa.
                </p>
              </>
            ) : (
              <>
                <div className="relative mx-auto h-16 w-16" aria-hidden="true">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
                  <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
                <div className="space-y-1.5" aria-live="polite">
                  <h2 className="text-lg font-semibold text-foreground">Buscando um psicólogo</h2>
                  <p className="text-sm text-muted-foreground">
                    {someoneOnline
                      ? `${availableProfessionals} ${availableProfessionals === 1 ? 'psicólogo online' : 'psicólogos online'} agora. Quando alguém aceitar, ${channel === 'text' ? 'a conversa' : 'a chamada'} abre sozinha.`
                      : `Nenhum psicólogo online agora. Avisamos todos eles e seu pedido continua na fila: quando alguém aceitar, ${channel === 'text' ? 'a conversa' : 'a chamada'} abre sozinha.`}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  Tempo de espera
                  <span className="font-semibold tabular-nums text-foreground">{formatCountdown(secondsLeft)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Marcou risco na triagem: os números certos ficam no topo da espera. */}
        {!expired && (hasSelfHarmRisk(triage) || hasDangerRisk(triage)) && (
          <Card className="border-destructive/30">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm text-foreground">
                {hasDangerRisk(triage)
                  ? 'Se alguém está colocando você em perigo, chame a polícia. Mulheres também podem ligar para o 180.'
                  : 'Se você corre perigo agora, ligue. Seu pedido continua na fila.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {hasSelfHarmRisk(triage) && (
                  <>
                    <Button asChild className="min-h-11">
                      <a href="tel:192"><Phone className="h-4 w-4" /> SAMU 192</a>
                    </Button>
                    <Button asChild className="min-h-11">
                      <a href="tel:188"><Phone className="h-4 w-4" /> CVV 188</a>
                    </Button>
                  </>
                )}
                {hasDangerRisk(triage) && (
                  <>
                    <Button asChild className="min-h-11">
                      <a href="tel:190"><Phone className="h-4 w-4" /> Polícia 190</a>
                    </Button>
                    <Button asChild className="min-h-11">
                      <a href="tel:180"><Phone className="h-4 w-4" /> Ligue 180</a>
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enquanto espera, sem sair da tela (sair cancela o pedido). */}
        {!expired && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-12" onClick={() => setSafetyPlanOpen(true)}>
              <ShieldCheck className="h-4 w-4" />
              Meu plano
            </Button>
            <Button variant="outline" className="min-h-12" onClick={() => setBreathingOpen(true)}>
              <Wind className="h-4 w-4" />
              Respirar
            </Button>
          </div>
        )}

        {/* Ligações sempre à mão, com o mesmo visual (com ou sem psicólogo online). */}
        {!expired && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Precisa conversar agora?</p>
                <p className="text-xs text-muted-foreground">
                  Ligações gratuitas, a qualquer hora. Em risco imediato de vida, ligue para o 192.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="min-h-11">
                  <a href="tel:188">
                    <Phone className="h-4 w-4" />
                    CVV 188
                  </a>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <a href="tel:192">
                    <Phone className="h-4 w-4" />
                    SAMU 192
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!expired && <SupportiveMessages />}

        <Button
          variant="ghost"
          onClick={() => (expired ? navigate('/home') : setShowCancelModal(true))}
          className="mt-auto text-muted-foreground"
        >
          {expired ? 'Voltar para o início' : 'Cancelar pedido'}
        </Button>
      </div>

      <SosBreathingDialog open={breathingOpen} onOpenChange={setBreathingOpen} />
      <SosSafetyPlanDialog open={safetyPlanOpen} onOpenChange={setSafetyPlanOpen} />

      <CancelConfirmationModal
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        onConfirm={handleCancelConfirm}
      />
    </div>
  );
};

export default SOS;