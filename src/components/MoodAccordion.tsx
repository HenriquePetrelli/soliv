import React, { useState } from 'react';
import { Check } from 'lucide-react';
import ExpandableCard from '@/components/ExpandableCard';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from '@/hooks/use-toast';
import { useMoodLog } from '@/hooks/useMoodLog';
import { cn } from '@/lib/utils';
import { MOOD_OPTIONS, getMoodOptionByValue, type MoodOption } from '@/components/moodOptions';


interface MoodAccordionProps {
  currentValue: number | null;
  onMoodSelected: (value: number) => void;
}

export const MoodAccordion: React.FC<MoodAccordionProps> = ({ currentValue, onMoodSelected }) => {
  const { toast } = useToast();
  const { logMood, saving: isSaving } = useMoodLog();
  const [open, setOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  const selected = getMoodOptionByValue(currentValue);

  const handleSelect = async (mood: MoodOption) => {
    const ok = await logMood(mood.value);
    if (ok) {
      onMoodSelected(mood.value);
      setShowFeedback(true);
    }
  };

  const handleHideMoodDaily = async (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('moodToggleChanged', { detail: { enabled: false } }));
    setIsHiding(true);
    try {
      const { data: { user } } = await getSessionUser();
      if (!user) return;
      const { error } = await supabase
        .from('patients')
        .update({ daily_mood_enabled: false })
        .eq('user_id', user.id);
      if (error) {
        window.dispatchEvent(new CustomEvent('moodToggleChanged', { detail: { enabled: true } }));
        toast({ title: 'Erro', description: 'Não foi possível ocultar o humor diário.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Humor diário ocultado', description: 'Você pode reativar nas configurações do perfil.' });
    } finally {
      setIsHiding(false);
    }
  };

  const HeaderIcon = selected?.Icon;

  return (
    <ExpandableCard
      open={open}
      onOpenChange={setOpen}
      leading={selected && HeaderIcon ? <HeaderIcon className={selected.colorClass} /> : undefined}
      title={selected ? selected.label : 'Registre seu humor'}
      titleClassName={selected?.colorClass}
      subtitle={selected ? 'Humor de hoje' : 'Como você está se sentindo hoje?'}
      actions={
        open ? (
          <button
            type="button"
            onClick={handleHideMoodDaily}
            disabled={isHiding}
            className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground px-2 sm:px-3 py-1 sm:py-1.5 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isHiding ? 'Ocultando...' : 'Ocultar'}
          </button>
        ) : undefined
      }
      contentClassName="relative"
    >
      {/* Content */}
      <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
            {MOOD_OPTIONS.map((mood) => {
              const Icon = mood.Icon;
              const isSelected = currentValue === mood.value;
              return (
                <button
                  key={mood.value}
                  type="button"
                  onClick={() => handleSelect(mood)}
                  disabled={isSaving}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed bg-background',
                    isSelected ? `${mood.borderClass} ${mood.bgClass}` : 'border-border hover:border-foreground/20'
                  )}
                >
                  <Icon className={cn('w-7 h-7', isSelected ? mood.colorClass : 'text-muted-foreground')} />
                  <span className={cn('text-sm font-medium', isSelected ? mood.colorClass : 'text-muted-foreground')}>
                    {mood.label}
                  </span>
                </button>
              );
            })}
          </div>

          {showFeedback && selected && (
            <div
              className={cn(
                'mt-3 rounded-lg border px-3 py-2 text-sm inline-flex items-start gap-2 w-full',
                selected.borderClass,
                selected.bgClass,
                selected.colorClass
              )}
            >
              <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Humor registrado! Estamos aqui para apoiar você em cada passo da sua jornada.</span>
            </div>
          )}
      </div>
    </ExpandableCard>
  );
};

export default MoodAccordion;
