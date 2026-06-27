import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { ReportSeriesPoint } from '../types';

const moneyShort = (value: number) =>
  value >= 1000 ? `Q${Math.round(value / 1000)}k` : `Q${Math.round(value)}`;

const eggShort = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`);

export default function ReportChart({ series, reducedMotion }: { series: ReportSeriesPoint[]; reducedMotion: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="#e0f2d9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#4e7a38' }} tickLine={false} axisLine={{ stroke: '#c0e6b3' }} interval="preserveStartEnd" minTickGap={16} />
        <YAxis yAxisId="eggs" tick={{ fontSize: 10, fill: '#86a86a' }} tickLine={false} axisLine={false} width={34} tickFormatter={eggShort} />
        <YAxis yAxisId="money" orientation="right" tick={{ fontSize: 10, fill: '#86a86a' }} tickLine={false} axisLine={false} width={38} tickFormatter={moneyShort} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #c0e6b3', fontSize: 12, fontFamily: 'Fira Sans, sans-serif' }}
          formatter={(value, name) => {
            const numeric = Number(value ?? 0);
            const label = String(name);
            return label === 'Producción'
              ? [`${numeric} huevos`, label]
              : [`Q ${Math.round(numeric).toLocaleString('es-GT')}`, label];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} iconType="circle" />
        <Bar yAxisId="eggs" dataKey="eggs" name="Producción" fill="#a1d98c" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion} />
        <Line yAxisId="money" type="monotone" dataKey="sales" name="Ventas" stroke="#ea580c" strokeWidth={2} dot={false} isAnimationActive={!reducedMotion} />
        <Line yAxisId="money" type="monotone" dataKey="profit" name="Ganancia" stroke="#3b7326" strokeWidth={2} dot={false} isAnimationActive={!reducedMotion} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
