import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getMoodOptionByValue } from '@/components/moodOptions';

interface MoodAreaChartProps {
  entries: { date: string; value: number }[];
}

/** Gráfico de humor (recharts), carregado só quando há dados para mostrar. */
const MoodAreaChart = ({ entries }: MoodAreaChartProps) => (
  <ResponsiveContainer width="100%" height={180}>
    <AreaChart data={entries.map((e) => ({
      date: format(new Date(`${e.date}T00:00:00`), 'dd/MM', { locale: ptBR }),
      value: e.value,
    }))}>
      <defs>
        <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
      <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} fontSize={11} tickLine={false} axisLine={false} width={24} />
      <Tooltip
        formatter={(value: number) => [getMoodOptionByValue(value)?.label ?? value, 'Humor']}
      />
      <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#moodGradient)" strokeWidth={2} />
    </AreaChart>
  </ResponsiveContainer>
);

export default MoodAreaChart;
