import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BookLock,
  Building2,
  CalendarCheck,
  Check,
  ClipboardList,
  HeartHandshake,
  Lock,
  Menu,
  MessageCircle,
  Music,
  Phone,
  ShieldCheck,
  Sprout,
  Stethoscope,
  Target,
  TrendingUp,
  Users,
  Video,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Wordmark from '@/components/Wordmark';
import LifeRing from '@/components/icons/LifeRingIcon';
import Reveal from '@/components/landing/Reveal';
import {
  BreathingScreen,
  HomeScreen,
  PhoneFrame,
  ProgressScreen,
  SosScreen,
  VideoCallCard,
} from '@/components/landing/Illustrations';
import { FREE_PLAN, PLAN_LIST } from '@/lib/plans';
import { LOGIN_PATH } from '@/lib/authPaths';
import { cn } from '@/lib/utils';

/*
 * Página de apresentação (antes do login), no navegador do computador e do
 * celular. No app instalado (Android/iOS) a rota "/" abre direto o login,
 * como fazem Nubank, Headspace e Calm: quem baixou o app já decidiu usar.
 * Estrutura no padrão das grandes (Headspace, Calm, Zenklub, Nubank): promessa
 * clara com o produto à vista, prova de confiança logo abaixo, recursos,
 * como funciona, segurança, planos, perguntas frequentes e chamada final.
 */

const NAV = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#seguranca', label: 'Segurança' },
  { href: '#planos', label: 'Planos' },
  { href: '#psicologos', label: 'Para psicólogos' },
  { href: '#perguntas', label: 'Dúvidas' },
];

interface Feature {
  Icon: LucideIcon | typeof LifeRing;
  title: string;
  text: string;
  tone: string;
}

const FEATURES: Feature[] = [
  {
    Icon: LifeRing,
    title: 'SOS emocional',
    text: 'Num momento difícil, um toque chama um psicólogo online para uma conversa por vídeo de até 25 minutos.',
    tone: 'bg-card',
  },
  {
    Icon: Video,
    title: 'Consultas por vídeo',
    text: 'Escolha o psicólogo, veja os horários livres e marque uma consulta de 50 minutos sem sair de casa.',
    tone: 'bg-accent text-primary',
  },
  {
    Icon: MessageCircle,
    title: 'Chat com o psicólogo',
    text: 'Continue a conversa entre um encontro e outro, com aviso de entrega e de leitura.',
    tone: 'bg-accent text-primary',
  },
  {
    Icon: Wind,
    title: 'Respiração guiada',
    text: 'Nove técnicas com um círculo que guia o ritmo, para acalmar, focar ou dormir melhor.',
    tone: 'bg-breathing-primary/10 text-breathing-primary',
  },
  {
    Icon: Music,
    title: 'Sons terapêuticos',
    text: 'Chuva, natureza e frequências para meditar, focar e dormir, com tempo para desligar sozinho.',
    tone: 'bg-sounds-primary/10 text-sounds-primary',
  },
  {
    Icon: BookLock,
    title: 'Diário privado',
    text: 'Escreva o que sentiu no dia. Só você lê o seu diário.',
    tone: 'bg-accent text-primary',
  },
  {
    Icon: TrendingUp,
    title: 'Humor e progresso',
    text: 'Registre como está e acompanhe a evolução do humor, a sequência de dias e as conquistas.',
    tone: 'bg-evolution-primary/10 text-evolution-primary dark:text-evolution-secondary',
  },
  {
    Icon: Target,
    title: 'Hábitos e metas',
    text: 'Pequenas metas semanais e hábitos do dia a dia, no seu ritmo e sem cobrança.',
    tone: 'bg-evolution-primary/10 text-evolution-primary dark:text-evolution-secondary',
  },
  {
    Icon: ShieldCheck,
    title: 'Plano de segurança',
    text: 'Seus sinais de alerta, o que ajuda e quem chamar, guardado e à mão, até sem internet.',
    tone: 'bg-accent text-primary',
  },
  {
    Icon: Users,
    title: 'Grupos de apoio',
    text: 'Leia e compartilhe experiências por tema, com a opção de publicar como anônimo.',
    tone: 'bg-accent text-primary',
  },
  {
    Icon: ClipboardList,
    title: 'Questionários',
    text: 'Questionários reconhecidos de ansiedade e humor para você e seu psicólogo acompanharem a evolução.',
    tone: 'bg-accent text-primary',
  },
  {
    Icon: Sprout,
    title: 'Comer com atenção',
    text: 'Um exercício curto de atenção plena para a hora da refeição.',
    tone: 'bg-evolution-primary/10 text-evolution-primary dark:text-evolution-secondary',
  },
];

const STEPS = [
  { n: '1', title: 'Crie sua conta', text: 'Leva um minuto. Comece pelo plano grátis, sem cartão.' },
  { n: '2', title: 'Cuide de você todo dia', text: 'Respiração, sons, diário e humor sempre à mão, no celular ou no computador.' },
  { n: '3', title: 'Fale com um psicólogo', text: 'Marque uma consulta por vídeo ou use o SOS quando precisar de alguém agora.' },
];

const TRUST = [
  { Icon: BadgeCheck, label: 'Psicólogos com CRP verificado' },
  { Icon: Lock, label: 'Dados protegidos pela LGPD' },
  { Icon: Video, label: 'Atendimento por vídeo' },
  { Icon: HeartHandshake, label: 'Acolhimento sem julgamento' },
];

const SECURITY = [
  {
    Icon: BadgeCheck,
    title: 'Profissionais conferidos',
    text: 'Cada psicólogo passa por análise da nossa equipe, com o registro no CRP conferido antes de atender.',
  },
  {
    Icon: Lock,
    title: 'Conversas que são suas',
    text: 'A equipe da Soliv não lê suas mensagens. O diário é só seu. As conexões são criptografadas.',
  },
  {
    Icon: ShieldCheck,
    title: 'Você no controle dos dados',
    text: 'Baixe tudo o que é seu ou exclua a conta quando quiser, direto no app, como prevê a LGPD.',
  },
];

const FAQ = [
  {
    q: 'O Soliv substitui a terapia?',
    a: 'Não. O Soliv aproxima você de psicólogos de verdade, em consultas e no SOS. As ferramentas de autocuidado ajudam no dia a dia, entre um atendimento e outro.',
  },
  {
    q: 'Como funciona o SOS?',
    a: 'Você toca no SOS e os psicólogos online recebem o pedido na hora. O primeiro que aceitar entra numa chamada de vídeo com você, de até 25 minutos. Em risco imediato, ligue para o CVV (188) ou o SAMU (192).',
  },
  {
    q: 'Quem são os psicólogos?',
    a: 'Psicólogos com CRP ativo. Antes de atender, cada cadastro passa pela análise da nossa equipe, que confere o registro e os documentos.',
  },
  {
    q: 'Meus dados ficam seguros?',
    a: 'Sim. Seguimos a LGPD, as conexões são criptografadas, ninguém da equipe lê suas conversas e o diário é só seu. Você pode baixar seus dados ou excluir a conta a qualquer momento.',
  },
  {
    q: 'Posso usar de graça?',
    a: 'Sim. O plano grátis já inclui respiração guiada e sons terapêuticos. Os planos pagos somam atendimento com psicólogo e liberam todos os recursos.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Pode, sem multa. E se cancelar em até 7 dias da primeira assinatura, o valor volta para você.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Funciona no navegador do celular e do computador. Os apps para Android e iPhone estão a caminho.',
  },
  {
    q: 'Minha empresa pode oferecer o Soliv?',
    a: 'Pode. A empresa contrata vagas de um plano e cada pessoa entra com um código. O RH vê só o uso geral, nunca quem usa o quê.',
  },
];

const SectionTitle = ({
  eyebrow,
  title,
  text,
  className,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  className?: string;
}) => (
  <Reveal className={cn('mx-auto max-w-2xl text-center', className)}>
    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
    <h2 className="mt-3 text-3xl sm:text-4xl font-semibold text-foreground text-balance">{title}</h2>
    {text && <p className="mt-4 text-lg text-muted-foreground text-pretty">{text}</p>}
  </Reveal>
);

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300',
        scrolled
          ? 'border-b border-border/70 bg-background/85 shadow-sm backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#inicio" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Soliv, voltar ao início">
          <img src="/soliv-logo.webp" alt="" className="h-9 w-auto" width={36} height={36} />
          <Wordmark className="h-[24px] text-primary" />
        </a>

        <nav aria-label="Seções" className="hidden lg:flex items-center gap-1">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="h-10 px-4">
            <Link to={LOGIN_PATH}>Entrar</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex h-10 px-5 rounded-full">
            <Link to="/signup-type">Criar conta</Link>
          </Button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden h-10 w-10" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-xs">
              <SheetHeader>
                <SheetTitle className="text-left">Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Seções" className="mt-6 flex flex-col">
                {NAV.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-3 text-base text-foreground transition-colors hover:bg-accent"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="mt-6 flex flex-col gap-2">
                <Button asChild className="h-12 rounded-full">
                  <Link to="/signup-type">Criar conta grátis</Link>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-full">
                  <Link to={LOGIN_PATH}>Entrar</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

const Hero = () => (
  <section id="inicio" className="relative overflow-hidden">
    {/* Luz suave da marca ao fundo: leveza, sem disputar com o texto */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute top-40 -right-32 h-80 w-80 rounded-full bg-breathing-primary/10 blur-3xl" />
      <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-primary-glow/10 blur-3xl" />
    </div>

    <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-8 lg:pb-24 lg:pt-16">
      <div className="text-center lg:text-left">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
            Bem-estar emocional, do seu jeito
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mt-6 text-5xl sm:text-6xl lg:text-[3.5rem] lg:leading-[1.08] font-semibold tracking-tight text-foreground text-balance">
            Um lugar seguro para{' '}
            <span className="landing-gradient-text">cuidar da sua mente</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-lg text-lg sm:text-xl text-muted-foreground text-pretty lg:mx-0">
            Psicólogos online quando você precisar, SOS emocional em minutos e ferramentas de
            autocuidado para o dia a dia. Tudo num só app, com privacidade.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild size="lg" className="h-12 w-full rounded-full px-7 text-base shadow-primary sm:w-auto">
              <Link to="/signup-type">
                Começar grátis
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full rounded-full px-7 text-base sm:w-auto">
              <Link to={LOGIN_PATH}>Já tenho conta</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Plano grátis para sempre. Sem cartão de crédito.</p>
        </Reveal>
      </div>

      <Reveal delay={200} className="relative">
        <div className="relative mx-auto w-fit">
          <div className="landing-float">
            <PhoneFrame>
              <HomeScreen />
            </PhoneFrame>
          </div>

          <div
            aria-hidden="true"
            className="absolute -left-48 top-[300px] hidden sm:flex items-center gap-2.5 rounded-2xl border border-border bg-card/95 px-3.5 py-3 shadow-lg backdrop-blur landing-float [animation-delay:1.5s]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent">
              <BadgeCheck className="h-5 w-5 text-primary" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">CRP verificado</span>
              <span className="block text-xs text-muted-foreground">em todos os psicólogos</span>
            </span>
          </div>

          <div
            aria-hidden="true"
            className="absolute -right-40 top-16 hidden sm:flex items-center gap-2.5 rounded-2xl border border-border bg-card/95 px-3.5 py-3 shadow-lg backdrop-blur landing-float [animation-delay:3s]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-breathing-primary/15">
              <Wind className="h-5 w-5 text-breathing-primary" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">Respire comigo</span>
              <span className="block text-xs text-muted-foreground">3 minutos para desacelerar</span>
            </span>
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);

const TrustStrip = () => (
  <section aria-label="Por que confiar" className="border-y border-border/70 bg-card/60">
    <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-x-6 gap-y-4 px-6 py-7 min-[420px]:grid-cols-2 md:grid-cols-4">
      {TRUST.map(({ Icon, label }, i) => (
        <Reveal as="li" key={label} delay={i * 60} className="flex items-center gap-2.5 text-left">
          <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </Reveal>
      ))}
    </ul>
  </section>
);

const FeatureGrid = () => (
  <section id="recursos" className="scroll-mt-20 py-20 sm:py-28">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <SectionTitle
        eyebrow="Recursos"
        title="Tudo o que ajuda a sua saúde emocional, num só lugar"
        text="Do cuidado de todo dia ao atendimento com psicólogo, cada recurso foi pensado para ser simples, acolhedor e seguro."
      />
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ Icon, title, text, tone }, i) => (
          <Reveal
            as="li"
            key={title}
            delay={(i % 3) * 70}
            className="group rounded-3xl border border-border bg-card p-6 shadow-xs transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
          >
            <span className={cn('grid h-12 w-12 place-items-center rounded-2xl', tone)}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </Reveal>
        ))}
      </ul>
    </div>
  </section>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent">
      <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
    </span>
    <span className="text-base text-muted-foreground">{children}</span>
  </li>
);

const Spotlight = ({
  id,
  eyebrow,
  title,
  text,
  bullets,
  figure,
  reverse,
  glow,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  text: string;
  bullets: string[];
  figure: React.ReactNode;
  reverse?: boolean;
  glow: string;
}) => (
  <div id={id} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
    <Reveal className={cn('relative', reverse && 'lg:order-2')}>
      <div aria-hidden="true" className={cn('absolute inset-x-8 top-10 bottom-10 -z-10 rounded-full blur-3xl', glow)} />
      {figure}
    </Reveal>
    <Reveal delay={120} className={cn(reverse && 'lg:order-1')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
      <h3 className="mt-3 text-3xl font-semibold text-foreground text-balance">{title}</h3>
      <p className="mt-4 text-lg text-muted-foreground text-pretty">{text}</p>
      <ul className="mt-6 space-y-3">
        {bullets.map((b) => (
          <Bullet key={b}>{b}</Bullet>
        ))}
      </ul>
    </Reveal>
  </div>
);

const Spotlights = () => (
  <section aria-label="Conheça o app" className="relative overflow-hidden bg-gradient-calm py-20 sm:py-28">
    <div className="mx-auto max-w-6xl space-y-24 px-4 sm:space-y-32 sm:px-6">
      <Spotlight
        eyebrow="SOS emocional"
        title="Quando apertar, alguém atende"
        text="Num momento de crise você não precisa procurar contato nem marcar horário. O SOS chama os psicólogos online e o primeiro disponível conversa com você por vídeo."
        bullets={[
          'Psicólogos online recebem o seu pedido na hora',
          'Conversa por vídeo de até 25 minutos',
          'CVV 188 e SAMU 192 sempre à vista',
        ]}
        figure={
          <PhoneFrame>
            <SosScreen />
          </PhoneFrame>
        }
        glow="bg-primary/15"
      />
      <Spotlight
        reverse
        eyebrow="Consultas por vídeo"
        title="Seu psicólogo, no horário que cabe na sua rotina"
        text="Veja só os horários realmente livres, marque em poucos toques e entre na sala direto pelo app. Depois, siga a conversa pelo chat."
        bullets={[
          'Consultas de 50 minutos, por vídeo',
          'Aviso assim que o psicólogo confirmar',
          'Chat para falar entre um encontro e outro',
        ]}
        figure={
          <div className="flex flex-col items-center gap-4">
            <VideoCallCard />
            <div aria-hidden="true" className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-md">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent">
                <CalendarCheck className="h-5 w-5 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">Consulta confirmada</span>
                <span className="block text-xs text-muted-foreground">Quinta-feira, 19h · 50 min</span>
              </span>
              <Check className="h-5 w-5 text-success" />
            </div>
          </div>
        }
        glow="bg-primary-glow/15"
      />
      <Spotlight
        eyebrow="Autocuidado"
        title="Pausas curtas que mudam o dia"
        text="Respiração guiada, sons para relaxar e um diário só seu. Ferramentas para usar sozinho, a qualquer hora, inclusive no plano grátis."
        bullets={[
          'Nove técnicas de respiração com guia visual',
          'Sons para meditar, focar e dormir',
          'Diário privado: só você lê',
        ]}
        figure={
          <PhoneFrame>
            <BreathingScreen />
          </PhoneFrame>
        }
        glow="bg-breathing-primary/15"
      />
      <Spotlight
        reverse
        eyebrow="Meu progresso"
        title="Perceba o quanto você já caminhou"
        text="Registre o humor em um toque e veja a evolução ao longo das semanas. Metas pequenas, conquistas e nenhuma cobrança."
        bullets={[
          'Gráfico do humor dos últimos 30 dias',
          'Metas da semana e hábitos do dia a dia',
          'Questionários para acompanhar com o seu psicólogo',
        ]}
        figure={
          <PhoneFrame>
            <ProgressScreen />
          </PhoneFrame>
        }
        glow="bg-evolution-primary/15"
      />
    </div>
  </section>
);

const HowItWorks = () => (
  <section id="como-funciona" className="scroll-mt-20 py-20 sm:py-28">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <SectionTitle eyebrow="Como funciona" title="Comece em três passos" />
      <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
        <div aria-hidden="true" className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent md:block" />
        {STEPS.map((s, i) => (
          <Reveal as="li" key={s.n} delay={i * 100} className="relative text-center">
            <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-primary text-xl font-bold text-primary-foreground shadow-primary">
              {s.n}
            </span>
            <h3 className="mt-5 text-lg font-semibold text-foreground">{s.title}</h3>
            <p className="mx-auto mt-2 max-w-xs text-base text-muted-foreground">{s.text}</p>
          </Reveal>
        ))}
      </ol>
    </div>
  </section>
);

const Security = () => (
  <section id="seguranca" className="scroll-mt-20 pb-20 sm:pb-28">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card px-6 py-14 shadow-sm sm:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary shadow-primary">
              <ShieldCheck className="h-7 w-7 text-primary-foreground" aria-hidden="true" />
            </span>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-primary">Segurança e privacidade</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-semibold text-foreground text-balance">
              O que você sente fica entre você e o seu psicólogo
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Saúde emocional pede confiança. Por isso a privacidade vem antes de qualquer recurso.
            </p>
            <Link to="/privacidade" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ler a Política de Privacidade <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
          <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {SECURITY.map(({ Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={i * 80} className="rounded-2xl border border-border bg-background/60 p-5">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </section>
);

const Plans = () => (
  <section id="planos" className="scroll-mt-20 bg-gradient-calm py-20 sm:py-28">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <SectionTitle
        eyebrow="Planos"
        title="Comece grátis. Cresça quando quiser."
        text="Sem fidelidade. Cancele quando quiser, e em até 7 dias da primeira assinatura o valor volta para você."
      />
      <ul className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Reveal as="li" className="flex flex-col rounded-3xl border border-border bg-card p-6 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">Grátis</h3>
          <p className="mt-3 text-4xl font-bold tabular-nums text-foreground">{FREE_PLAN.price}</p>
          <p className="mt-1 text-sm text-muted-foreground">para sempre</p>
          <ul className="mt-6 flex-1 space-y-3">
            {FREE_PLAN.features.map((f) => (
              <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="mt-8 h-11 rounded-full">
            <Link to="/patient-signup">Começar grátis</Link>
          </Button>
        </Reveal>
        {PLAN_LIST.map((plan, i) => (
          <Reveal
            as="li"
            key={plan.id}
            delay={(i + 1) * 70}
            className={cn(
              'relative flex flex-col rounded-3xl border bg-card p-6',
              plan.popular ? 'border-primary shadow-primary ring-1 ring-primary/30' : 'border-border shadow-xs',
            )}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Recomendado
              </span>
            )}
            <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
            <p className="mt-3 text-4xl font-bold tabular-nums text-foreground">
              {plan.price}
              <span className="text-base font-normal text-muted-foreground">{plan.period}</span>
            </p>
            <p className="mt-1 text-sm font-medium text-primary">Atendimento: {plan.consultation}</p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild variant={plan.popular ? 'default' : 'outline'} className="mt-8 h-11 rounded-full">
              <Link to="/patient-signup">Escolher {plan.name}</Link>
            </Button>
          </Reveal>
        ))}
      </ul>
      <Reveal className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-3 rounded-2xl border border-border bg-card/80 p-5 text-center sm:flex-row sm:text-left">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent">
          <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">Para empresas:</strong> ofereça o Soliv como benefício.
          Cada pessoa entra com um código e o RH acompanha só o uso geral, sem saber quem usa o quê.
        </p>
      </Reveal>
    </div>
  </section>
);

const ForPsychologists = () => (
  <section id="psicologos" className="scroll-mt-20 py-20 sm:py-28">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-professional px-6 py-14 text-primary-foreground shadow-primary sm:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-primary-foreground/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -top-20 left-1/3 h-56 w-56 rounded-full bg-primary-foreground/10 blur-2xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-medium">
              <Stethoscope className="h-4 w-4" aria-hidden="true" /> Para psicólogos
            </span>
            <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-primary-foreground text-balance">
              Atenda online com uma agenda que é sua
            </h2>
            <p className="mt-4 max-w-xl text-lg text-primary-foreground/90">
              Você define os dias e horários, recebe pedidos de consulta e entra no SOS quando quiser ficar online.
              Valor fixo por atendimento e repasse semanal.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary" className="h-12 rounded-full px-7 text-base">
                <Link to="/psychologist-signup">Quero atender pelo Soliv</Link>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <ul className="space-y-4">
              {[
                'Cadastro com CRP ativo e análise da nossa equipe',
                'Agenda com horários, exceções e férias',
                'Consultas e SOS por vídeo, direto no navegador',
                'Ganhos e repasses acompanhados no painel',
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-foreground/20">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-base text-primary-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </div>
  </section>
);

const Faq = () => (
  <section id="perguntas" className="scroll-mt-20 pb-20 sm:pb-28">
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <SectionTitle eyebrow="Dúvidas" title="Perguntas frequentes" />
      <Reveal className="mt-10">
        <Accordion type="single" collapsible className="rounded-3xl border border-border bg-card px-6 shadow-xs">
          {FAQ.map((item, i) => (
            <AccordionItem key={item.q} value={`q${i}`} className={cn(i === FAQ.length - 1 && 'border-b-0')}>
              <AccordionTrigger className="py-5 text-left text-base font-semibold text-foreground hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </div>
  </section>
);

const FinalCta = () => (
  <section className="relative overflow-hidden pb-20 sm:pb-28">
    <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
      <Reveal>
        <img src="/soliv-logo.webp" alt="" className="mx-auto h-16 w-auto" width={64} height={64} />
        <h2 className="mt-6 text-3xl sm:text-4xl font-semibold text-foreground text-balance">
          Dê o primeiro passo hoje. No seu tempo.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Crie sua conta grátis e tenha um espaço de cuidado sempre com você.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 w-full rounded-full px-8 text-base shadow-primary sm:w-auto">
            <Link to="/signup-type">
              Criar conta grátis
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="h-12 w-full rounded-full px-8 text-base sm:w-auto">
            <Link to={LOGIN_PATH}>Entrar</Link>
          </Button>
        </div>
      </Reveal>
    </div>
  </section>
);

const CrisisNotice = () => (
  <aside aria-label="Ajuda em situação de risco" className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 text-center sm:flex-row sm:text-left">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent">
        <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
      </span>
      <p className="text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">Em risco imediato?</strong> Ligue para o{' '}
        <a href="tel:188" className="font-semibold text-primary hover:underline">CVV 188</a> (24 horas, gratuito) ou o{' '}
        <a href="tel:192" className="font-semibold text-primary hover:underline">SAMU 192</a>.
      </p>
    </div>
  </aside>
);

const Footer = () => (
  <footer className="border-t border-border bg-card/60">
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
      <div className="max-w-xs">
        <div className="flex items-center gap-2">
          <img src="/soliv-logo.webp" alt="" className="h-8 w-auto" width={32} height={32} />
          <Wordmark className="h-[24px] text-primary" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Conectando pessoas em busca de bem-estar emocional.
        </p>
      </div>
      <nav aria-label="Links do rodapé" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3">
        <Link to="/signup-type" className="text-muted-foreground hover:text-foreground">Criar conta</Link>
        <Link to={LOGIN_PATH} className="text-muted-foreground hover:text-foreground">Entrar</Link>
        <Link to="/psychologist-signup" className="text-muted-foreground hover:text-foreground">Sou psicólogo</Link>
        <Link to="/termos" className="text-muted-foreground hover:text-foreground">Termos de Uso</Link>
        <Link to="/termos-psicologo" className="text-muted-foreground hover:text-foreground">Termos do Psicólogo</Link>
        <Link to="/privacidade" className="text-muted-foreground hover:text-foreground">Privacidade</Link>
      </nav>
    </div>
    <div className="border-t border-border/70">
      <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} Soliv. O Soliv não é um serviço de emergência médica.
      </p>
    </div>
  </footer>
);

const Landing = () => (
  <div className="landing min-h-screen bg-background text-foreground">
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
    >
      Pular para o conteúdo
    </a>
    <Header />
    <main id="conteudo">
      <Hero />
      <TrustStrip />
      <FeatureGrid />
      <Spotlights />
      <HowItWorks />
      <Security />
      <Plans />
      <ForPsychologists />
      <Faq />
      <FinalCta />
      <CrisisNotice />
    </main>
    <Footer />
  </div>
);

export default Landing;
