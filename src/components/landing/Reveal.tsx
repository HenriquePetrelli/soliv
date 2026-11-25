import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Atraso em ms, para entrar em sequência com os vizinhos. */
  delay?: number;
  as?: 'div' | 'li' | 'section';
}

/**
 * Entra suave (sobe 16px e aparece) quando chega à tela. Sem biblioteca de
 * animação: a página de apresentação é a primeira coisa que o visitante baixa.
 * Quem pede menos movimento no sistema vê o conteúdo direto (CSS em index.css).
 */
const Reveal = ({ children, className, delay = 0, as: Tag = 'div' }: RevealProps) => {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={cn('landing-reveal', visible && 'is-visible', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
};

export default Reveal;
