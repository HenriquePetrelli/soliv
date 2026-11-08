import { useState, useEffect } from 'react';
import { useAppointmentUpdates } from '@/hooks/useAppointmentUpdates';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, ChevronRight, Clock, Inbox, Video } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import LifeRingIcon from '@/components/icons/LifeRingIcon';
import PageTitle from '@/components/PageTitle';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { usePsychologistSchedule } from '@/hooks/usePsychologistSchedule';
import { usePsychologistPresence } from '@/hooks/usePsychologistPresence';
import { usePsychologistVacation } from '@/hooks/usePsychologistVacation';
import { usePsychologistAvailability } from '@/hooks/usePsychologistAvailability';
import EmergencyNotifications from '@/components/psychologist/EmergencyNotifications';
import { PixModal } from '@/components/psychologist/PixModal';
import { WeeklyScheduleModal } from '@/components/psychologist/WeeklyScheduleModal';
import { FirstTimeAvailabilityModal } from '@/components/psychologist/FirstTimeAvailabilityModal';
import ActiveCallBanner from '@/components/sos/ActiveCallBanner';
import { getWeekStartISO } from '@/lib/psychologistAvailability';
import RouteSkeleton from "@/components/skeletons/RouteSkeleton";
import type { Tables } from '@/integrations/supabase/types';

const weeklyConfirmStorageKey = (userId: string) => `soliv:availability-week-confirmed:${userId}`;


const PsychologistDashboard = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPixModal, setShowPixModal] = useState(false);
  const [showWeeklyScheduleModal, setShowWeeklyScheduleModal] = useState(false);
  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const [psychologistData, setPsychologistData] = useState<{ pix_key: string | null; pix_type: string | null } | null>(null);

  const { todayAppointments, upcomingAppointments, fetchPendingAppointments, fetchTodayAppointments, fetchUpcomingAppointments } = usePsychologistSchedule();
  const { isOnline, loading: presenceLoading, toggle: togglePresence } = usePsychologistPresence();
  const [pendingRequests, setPendingRequests] = useState(0);
  const { activeVacation, loading: loadingVacation } = usePsychologistVacation();
  const { blocks: baseBlocks, loading: loadingBase, refetch: refetchBase } = usePsychologistAvailability();

  useEffect(() => {
    checkUserProfile();
    // Pedidos de consulta esperando resposta (o detalhe fica em Consultas).
    void fetchPendingAppointments().then((list) => setPendingRequests(list.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useAppointmentUpdates(() =>
    Promise.all([
      fetchPendingAppointments().then((list) => setPendingRequests(list.length)),
      fetchTodayAppointments(),
      fetchUpcomingAppointments(),
    ]),
  );

  // Só depois que o cadastro básico (PIX) está completo: primeiro pede o
  // horário-padrão (uma vez, se ainda não configurado) e, com ele já
  // configurado, oferece a confirmação semanal — nunca durante férias, já
  // que nesse período a agenda fica marcada como indisponível.
  useEffect(() => {
    if (!profile || loadingVacation || loadingBase) return;
    if (!psychologistData?.pix_key || !psychologistData?.pix_type) return;
    if (activeVacation) return;
    if (baseBlocks.length === 0) {
      setShowFirstTimeModal(true);
      return;
    }
    try {
      const lastConfirmed = localStorage.getItem(weeklyConfirmStorageKey(profile.user_id));
      if (lastConfirmed !== getWeekStartISO(new Date())) {
        setShowWeeklyScheduleModal(true);
      }
    } catch {
      // localStorage indisponível (modo privado, etc.) — não bloqueia o app
    }
  }, [profile, psychologistData, activeVacation, loadingVacation, baseBlocks, loadingBase]);

  const checkUserProfile = async () => {
    try {
      const { data: { user } } = await getSessionUser();
      
      if (!user) {
        navigate('/');
        return;
      }

      // Verify user is psychologist and not admin
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error || !profile) {
        navigate('/');
        return;
      }

      // Check if psychologist is approved
      if (profile.user_type === 'psychologist') {
        const { data: registrationData } = await supabase
          .from('psychologist_registrations')
          .select('status')
          .eq('user_id', user.id)
          .single();

        // Aprovação só pelo banco (user_metadata é editável pelo próprio usuário).
        if (!registrationData || registrationData.status !== 'approved') {
          navigate('/?error=not_approved');
          return;
        }
      }

      // Only allow psychologists
      if (profile.user_type !== 'psychologist') {
        if (profile.user_type === 'patient') {
          navigate('/');
        } else {
          navigate('/');
        }
        return;
      }

      setProfile(profile);

      // Check PIX information
      // CPF/Pix não são lidos direto da tabela (outros usuários também leem
      // a linha do psicólogo); vêm por uma função que só devolve os do próprio.
      const { data: privateRows } = await supabase.rpc('get_my_psychologist_private');
      const psychData = privateRows?.[0] ?? null;

      setPsychologistData(psychData);

      // If PIX is not configured, show modal
      if (!psychData?.pix_key || !psychData?.pix_type) {
        setShowPixModal(true);
      }
    } catch (error) {
      console.error('Error checking profile:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <RouteSkeleton />;
  }

  const todayConsultations = todayAppointments.length;
  const upcomingConsultations = upcomingAppointments.length;
  const todayLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const nextToday = todayAppointments
    .filter((a) => new Date(a.scheduled_at).getTime() > Date.now() - 60 * 60 * 1000)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];

  const summary = [
    { label: 'Hoje', hint: 'consultas', value: todayConsultations, icon: Calendar },
    { label: 'Próximos dias', hint: 'agendadas', value: upcomingConsultations, icon: Clock },
    { label: 'Pedidos', hint: 'para responder', value: pendingRequests, icon: Inbox },
  ];

  return (
    <div className="space-y-5 md:space-y-6">
      <PageTitle
        title={`Olá, Dr.(a) ${profile?.full_name?.split(' ')[0] ?? ''}`}
        description={<span className="first-letter:uppercase">{todayLabel}</span>}
      />

      <ActiveCallBanner />

      {/* Disponibilidade para o SOS: a decisão mais importante do dia. */}
      <Card className={isOnline ? 'border-emerald-500/40' : 'border-border/60'}>
        <CardContent className="flex items-center gap-4 p-4 sm:p-5">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${isOnline ? 'bg-emerald-500/10' : 'bg-muted'}`}
            aria-hidden="true"
          >
            <LifeRingIcon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{isOnline ? 'Você está online para o SOS' : 'Você está offline para o SOS'}</p>
            <p className="text-sm text-muted-foreground">
              {isOnline
                ? 'Pedidos de ajuda emergencial chegam aqui e no seu celular.'
                : 'Fique online quando puder atender uma chamada de ajuda emergencial.'}
            </p>
          </div>
          <Switch
            checked={isOnline}
            onCheckedChange={togglePresence}
            disabled={presenceLoading}
            aria-label="Alternar disponibilidade para o SOS"
          />
        </CardContent>
      </Card>

      {/* Fila do SOS só com o psicólogo online (offline, o cartão acima já diz). */}
      {isOnline && <EmergencyNotifications />}

      {/* Resumo das consultas: leva para Consultas. */}
      <section className="space-y-2" aria-label="Consultas">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consultas</h2>
          <Button variant="link" className="h-auto p-0 text-sm" onClick={() => navigate('/psicologo/consultas')}>
            Ver todas
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
          {summary.map(({ label, hint, value, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate('/psicologo/consultas')}
              className="rounded-lg border border-border/60 bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/40 sm:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
                  <p className={`mt-1 text-2xl font-bold sm:text-3xl ${label === 'Pedidos' && value > 0 ? 'text-primary' : 'text-foreground'}`}>{value}</p>
                  <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{hint}</p>
                </div>
                <div className="hidden shrink-0 rounded-xl bg-primary/10 p-2.5 sm:block" aria-hidden="true">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </button>
          ))}
        </div>

        {nextToday && (
          <button
            type="button"
            onClick={() => navigate('/psicologo/consultas')}
            className="flex w-full items-center gap-4 rounded-lg border border-border/60 bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <Video className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Próxima hoje às {new Date(nextToday.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="truncate text-xs text-muted-foreground">{nextToday.patient?.full_name ?? 'Paciente'}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        )}
      </section>

      {/* PIX Modal */}
      {profile && (
        <PixModal
          isOpen={showPixModal}
          onClose={() => {
            setShowPixModal(false);
            // Refresh psychologist data
            checkUserProfile();
          }}
          userId={profile.user_id}
        />
      )}

      {/* Configuração inicial do horário-padrão (só uma vez) */}
      {profile && (
        <FirstTimeAvailabilityModal
          open={showFirstTimeModal}
          onClose={() => setShowFirstTimeModal(false)}
          onSaved={() => {
            setShowFirstTimeModal(false);
            try {
              // Já conta como a semana confirmada — evita mostrar a modal
              // semanal logo em seguida da configuração inicial.
              localStorage.setItem(weeklyConfirmStorageKey(profile.user_id), getWeekStartISO(new Date()));
            } catch {
              // localStorage indisponível — segue sem lembrar pra próxima
            }
            void refetchBase();
          }}
        />
      )}

      {/* Confirmação semanal da agenda */}
      {profile && (
        <WeeklyScheduleModal
          open={showWeeklyScheduleModal}
          onClose={() => setShowWeeklyScheduleModal(false)}
          onConfirmed={(weekStartISO) => {
            try {
              localStorage.setItem(weeklyConfirmStorageKey(profile.user_id), weekStartISO);
            } catch {
              // localStorage indisponível — fecha mesmo assim, só não lembra pra próxima
            }
            setShowWeeklyScheduleModal(false);
          }}
        />
      )}
    </div>
  );
};

export default PsychologistDashboard;