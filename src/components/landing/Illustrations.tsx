import type { ReactNode } from 'react';
import {
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarCheck,
  Home as HomeIcon,
  Laugh,
  Meh,
  MessageCircle,
  Mic,
  Music,
  PhoneOff,
  Smile,
  Frown,
  Annoyed,
  User,
  Video,
  Wind,
  Flame,
} from 'lucide-react';
import LifeRing from '@/components/icons/LifeRingIcon';
import { cn } from '@/lib/utils';

/*
 * Figuras da página de apresentação: telas do app desenhadas com os próprios
 * tokens do design system (sem imagem baixada, sem cor fixa). Assim ficam
 * nítidas em qualquer tela, acompanham o modo escuro e não pesam no download.
 * São decorativas (aria-hidden): o texto ao lado descreve cada recurso.
 */

export const PhoneFrame = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    aria-hidden="true"
    className={cn(
      'relative mx-auto w-[280px] shrink-0 rounded-[2.75rem] border border-border bg-card p-2.5 shadow-xl',
      'ring-1 ring-primary/10',
      className,
    )}
  >
    <div className="absolute left-1/2 top-3.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-foreground/90 dark:bg-muted" />
    <div className="relative h-[570px] overflow-hidden rounded-[2.25rem] bg-background">
      {children}
    </div>
  </div>
);

const StatusBar = () => (
  <div className="flex items-center justify-between px-6 pt-3.5 pb-1 text-[0.75rem] font-medium text-foreground/70">
    <span>9:41</span>
    <span className="flex items-center gap-1">
      <span className="h-2 w-3.5 rounded-sm bg-foreground/60" />
      <span className="h-2 w-2 rounded-full bg-foreground/60" />
    </span>
  </div>
);

const BottomBar = ({ active = 'home' }: { active?: 'home' | 'progress' }) => {
  const items = [
    { key: 'home', Icon: HomeIcon },
    { key: 'chat', Icon: MessageCircle },
    { key: 'sos', Icon: null },
    { key: 'progress', Icon: BarChart3 },
    { key: 'profile', Icon: User },
  ] as const;
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-card/95 px-3 pb-5 pt-2.5">
      {items.map(({ key, Icon }) =>
        Icon ? (
          <Icon
            key={key}
            className={cn('h-5 w-5', key === active ? 'text-primary' : 'text-muted-foreground')}
            strokeWidth={2}
          />
        ) : (
          <LifeRing key={key} className="h-8 w-8 -mt-1" />
        ),
      )}
    </div>
  );
};

/** Tela inicial do paciente: humor do dia e atalhos de autocuidado. */
export const HomeScreen = () => {
  const moods = [
    { Icon: Frown, label: 'Mal' },
    { Icon: Annoyed, label: 'Baixo' },
    { Icon: Meh, label: 'Ok' },
    { Icon: Smile, label: 'Bem', active: true },
    { Icon: Laugh, label: 'Ótimo' },
  ];
  return (
    <div className="relative h-full">
      <StatusBar />
      <div className="px-5 pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Boa noite,</p>
            <p className="text-lg font-semibold text-foreground">Ana</p>
          </div>
          <div className="relative grid h-9 w-9 place-items-center rounded-full bg-accent">
            <Bell className="h-4 w-4 text-primary" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Como você está hoje?</p>
          <div className="mt-3 flex justify-between">
            {moods.map(({ Icon, label, active }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    'grid h-9 w-9 place-items-center rounded-full',
                    active ? 'bg-primary text-primary-foreground shadow-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className={cn('text-[0.75rem]', active ? 'text-primary font-medium' : 'text-muted-foreground')}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-breathing p-3.5 text-primary-foreground">
            <Wind className="h-5 w-5" />
            <p className="mt-6 text-sm font-semibold text-primary-foreground">Respirar</p>
            <p className="text-xs text-primary-foreground/85">3 min</p>
          </div>
          <div className="rounded-2xl bg-gradient-sounds p-3.5 text-primary-foreground">
            <Music className="h-5 w-5" />
            <p className="mt-6 text-sm font-semibold text-primary-foreground">Sons</p>
            <p className="text-xs text-primary-foreground/85">Chuva leve</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent">
            <CalendarCheck className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Consulta confirmada</p>
            <p className="text-xs text-muted-foreground">Quinta, 19h · por vídeo</p>
          </div>
        </div>
      </div>
      <BottomBar />
    </div>
  );
};

/** Respiração guiada: o círculo que cresce e diminui no ritmo da técnica. */
export const BreathingScreen = () => (
  <div className="relative h-full bg-gradient-calm">
    <StatusBar />
    <div className="px-5 pt-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Respiração 4-7-8</p>
      <p className="mt-1 text-sm text-muted-foreground">Ciclo 2 de 4</p>
    </div>
    <div className="relative mx-auto mt-10 grid h-60 w-60 place-items-center">
      <span className="absolute inset-0 rounded-full bg-breathing-primary/10 landing-breathe" />
      <span className="absolute inset-6 rounded-full bg-breathing-primary/15 landing-breathe [animation-delay:400ms]" />
      <span className="absolute inset-12 rounded-full bg-gradient-breathing opacity-90 shadow-breathing landing-breathe [animation-delay:800ms]" />
      <span className="relative text-center">
        <span className="block text-xl font-semibold text-primary-foreground">Inspire</span>
        <span className="block text-3xl font-bold tabular-nums text-primary-foreground">4</span>
      </span>
    </div>
    <p className="mt-10 px-8 text-center text-sm text-muted-foreground">
      Puxe o ar pelo nariz, devagar. Sem pressa.
    </p>
    <div className="absolute inset-x-5 bottom-8 flex gap-2">
      {['Inspire', 'Segure', 'Solte'].map((step, i) => (
        <div
          key={step}
          className={cn(
            'flex-1 rounded-xl py-2 text-center text-xs font-medium',
            i === 0 ? 'bg-breathing-primary/15 text-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {step}
        </div>
      ))}
    </div>
  </div>
);

/** Meu progresso: humor dos últimos dias e metas da semana. */
export const ProgressScreen = () => (
  <div className="relative h-full">
    <StatusBar />
    <div className="px-5 pt-4 space-y-3">
      <p className="text-lg font-semibold text-foreground">Meu progresso</p>
      <div className="flex gap-3">
        <div className="flex-1 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <Flame className="h-4 w-4 text-primary" />
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">7</p>
          <p className="text-xs text-muted-foreground">dias seguidos</p>
        </div>
        <div className="flex-1 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <Smile className="h-4 w-4 text-evolution-primary dark:text-evolution-secondary" />
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">4,1</p>
          <p className="text-xs text-muted-foreground">humor médio</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Humor · 30 dias</p>
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">em alta</span>
        </div>
        <svg viewBox="0 0 240 90" className="mt-2 h-16 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="landing-mood-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 70 C 20 66, 30 52, 50 56 S 80 72, 100 58 S 130 34, 150 42 S 185 30, 200 24 S 225 16, 240 12 L 240 90 L 0 90 Z"
            fill="url(#landing-mood-fill)"
          />
          <path
            d="M0 70 C 20 66, 30 52, 50 56 S 80 72, 100 58 S 130 34, 150 42 S 185 30, 200 24 S 225 16, 240 12"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="240" cy="12" r="4" fill="hsl(var(--primary))" />
        </svg>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2.5">
        <p className="text-sm font-semibold text-foreground">Metas da semana</p>
        {[
          { label: 'Respirar 3x', value: 100 },
          { label: 'Registrar o humor', value: 70 },
        ].map((g) => (
          <div key={g.label}>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{g.label}</span>
              <span className="tabular-nums">{g.value}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${g.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
    <BottomBar active="progress" />
  </div>
);

/** SOS: a tela de espera, quieta e com o CVV sempre à mão. */
export const SosScreen = () => (
  <div className="relative h-full bg-calm">
    <StatusBar />
    <div className="flex flex-col items-center px-6 pt-8 text-center">
      <div className="relative grid h-36 w-36 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary/15 landing-ripple" />
        <span className="absolute inset-0 rounded-full border-2 border-primary/15 landing-ripple [animation-delay:1.2s]" />
        <span className="grid h-24 w-24 place-items-center rounded-full bg-card shadow-lg">
          <LifeRing className="h-14 w-14" />
        </span>
      </div>
      <p className="mt-6 text-lg font-semibold text-foreground">Buscando um profissional para você agora.</p>
      <p className="mt-2 text-sm text-muted-foreground">Respire devagar. Você não está sozinho.</p>
      <div className="mt-6 w-full rounded-2xl border border-border bg-card p-3 text-left shadow-sm">
        <p className="text-xs text-muted-foreground">3 psicólogos online agora</p>
        <div className="mt-2 flex -space-x-2">
          {['MC', 'RL', 'JS'].map((i) => (
            <span
              key={i}
              className="grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-accent text-xs font-semibold text-accent-foreground"
            >
              {i}
            </span>
          ))}
        </div>
      </div>
    </div>
    <div className="absolute inset-x-6 bottom-8 rounded-xl border border-border bg-card/80 py-2.5 text-center text-xs text-muted-foreground">
      Em risco imediato? Ligue <strong className="text-foreground">CVV 188</strong> ou <strong className="text-foreground">SAMU 192</strong>
    </div>
  </div>
);

/** Cartão de videochamada (consulta agendada). */
export const VideoCallCard = ({ className }: { className?: string }) => (
  <div
    aria-hidden="true"
    className={cn('w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-xl', className)}
  >
    <div className="relative aspect-[4/3] bg-gradient-to-br from-accent via-background to-muted">
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-primary text-2xl font-semibold text-primary-foreground shadow-primary">
            MC
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">Dra. Marina Costa</p>
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" /> CRP verificado
          </p>
        </div>
      </div>
      <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground shadow-sm">
        32:14
      </span>
      <span className="absolute bottom-3 right-3 grid h-16 w-12 place-items-center rounded-xl border border-border bg-card shadow-md">
        <User className="h-5 w-5 text-muted-foreground" />
      </span>
    </div>
    <div className="flex items-center justify-center gap-3 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-muted">
        <Mic className="h-4 w-4 text-foreground" />
      </span>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-muted">
        <Video className="h-4 w-4 text-foreground" />
      </span>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-destructive">
        <PhoneOff className="h-4 w-4 text-destructive-foreground" />
      </span>
    </div>
  </div>
);
