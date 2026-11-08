import { useState, useEffect } from "react";

interface ContextualPhrasesProps {
  currentPhase: 'inhale' | 'hold' | 'exhale' | 'pause';
  patternType: string;
  cycleCount: number;
}

const ContextualPhrases = ({ currentPhase, patternType, cycleCount }: ContextualPhrasesProps) => {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);

  const contextualPhrases = {
    relaxation: {
      inhale: [
        "Encha seus pulmões de calma",
        "Inspire paz e tranquilidade", 
        "Permita que a serenidade entre",
        "Respire fundo e solte as tensões"
      ],
      hold: [
        "Mantenha a calma dentro de você",
        "Segure este momento de paz",
        "Deixe a tranquilidade se espalhar",
        "Permita que a calma se fixe"
      ],
      exhale: [
        "Libere toda a tensão",
        "Expire suas preocupações",
        "Solte o que não te serve",
        "Deixe partir toda ansiedade"
      ],
      pause: [
        "Descanso e quietude",
        "Momento de silêncio interior",
        "Pausa regeneradora",
        "Quietude reparadora"
      ]
    },
    balance: {
      inhale: [
        "Equilíbrio começa aqui",
        "Inspire harmonia",
        "Busque o centro interior",
        "Equilibre suas energias"
      ],
      hold: [
        "Mantenha o equilíbrio",
        "Encontre seu centro",
        "Estabilize suas emoções",
        "Harmonize corpo e mente"
      ],
      exhale: [
        "Harmonia em cada expiração",
        "Expire em equilíbrio perfeito",
        "Solte em harmonia",
        "Equilibre-se completamente"
      ],
      pause: [
        "Momento de equilíbrio",
        "Pausa harmoniosa",
        "Estabilidade completa",
        "Centro encontrado"
      ]
    },
    focus: {
      inhale: [
        "Foque na respiração",
        "Concentre-se no momento",
        "Inspire clareza mental",
        "Traga sua atenção para aqui"
      ],
      hold: [
        "Mantenha o foco",
        "Concentração total",
        "Mente clara e presente",
        "Foco absoluto"
      ],
      exhale: [
        "Expire as distrações",
        "Solte pensamentos dispersos",
        "Libere a mente confusa",
        "Clareza em cada expiração"
      ],
      pause: [
        "Pausa focada",
        "Mente quieta e presente",
        "Concentração serena",
        "Foco renovado"
      ]
    },
    control: {
      inhale: [
        "Inspire controle",
        "Mantenha-se no comando",
        "Respire com propósito",
        "Controle total da situação"
      ],
      hold: [
        "Mantenha o controle",
        "Você está no comando",
        "Firmeza e determinação",
        "Controle absoluto"
      ],
      exhale: [
        "Expire com precisão",
        "Controle cada movimento",
        "Disciplina em cada breath",
        "Comando total"
      ],
      pause: [
        "Pausa controlada",
        "Domínio completo",
        "Controle refinado",
        "Precisão absoluta"
      ]
    },
    calm: {
      inhale: [
        "Inspire serenidade",
        "Calma profunda entra",
        "Tranquilidade pura",
        "Paz interior cresce"
      ],
      hold: [
        "Mantenha a serenidade",
        "Calma se estabelece",
        "Paz se fortalece",
        "Tranquilidade se firma"
      ],
      exhale: [
        "Expire suavemente",
        "Solte com tranquilidade",
        "Calma em cada expiração",
        "Serenidade se expande"
      ],
      pause: [
        "Pausa serena",
        "Quietude absoluta",
        "Calma profunda",
        "Serenidade completa"
      ]
    },
    crisis: {
      inhale: [
        "Você está seguro agora",
        "Respire, você consegue",
        "Este momento vai passar",
        "Você não está sozinho"
      ],
      hold: [
        "Mantenha-se presente",
        "Você está no controle",
        "Foque apenas neste momento",
        "Você é mais forte que isto"
      ],
      exhale: [
        "Libere o medo",
        "Solte a ansiedade",
        "Expire a tensão",
        "Deixe partir o pânico"
      ],
      pause: [
        "Momento de paz",
        "Você está bem",
        "Segurança e calma",
        "Tudo vai ficar bem"
      ]
    }
  };

  const defaultPhrases = {
    inhale: [
      "Inspire profundamente",
      "Encha seus pulmões",
      "Respire com calma",
      "Ar puro entrando"
    ],
    hold: [
      "Mantenha a respiração",
      "Segure por um momento",
      "Pause com tranquilidade",
      "Momento de quietude"
    ],
    exhale: [
      "Expire lentamente",
      "Solte o ar suavemente",
      "Libere completamente",
      "Expire com paz"
    ],
    pause: [
      "Momento de pausa",
      "Descanso natural",
      "Quietude reparadora",
      "Pausa restauradora"
    ]
  };

  const getPhrases = () => {
    return contextualPhrases[patternType as keyof typeof contextualPhrases] || defaultPhrases;
  };

  const getCurrentPhrase = () => {
    const phrases = getPhrases();
    const phasePhrases = phrases[currentPhase] || defaultPhrases[currentPhase];
    return phasePhrases[currentPhraseIndex % phasePhrases.length];
  };

  // Change phrase every 2 cycles
  useEffect(() => {
    if (cycleCount > 0 && cycleCount % 2 === 0) {
      const phrases = getPhrases();
      const phasePhrases = phrases[currentPhase];
      setCurrentPhraseIndex(Math.floor(Math.random() * phasePhrases.length));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [cycleCount, currentPhase, patternType]);

  return (
    <div className="text-center max-w-sm">
      <p 
        key={`${currentPhase}-${currentPhraseIndex}-${cycleCount}`}
        className="text-lg text-foreground font-medium leading-relaxed animate-fade-in"
      >
        {getCurrentPhrase()}
      </p>
    </div>
  );
};

export default ContextualPhrases;