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

type Point = { label: string; date: string; eggs: number; rotos: number };

const eggShort = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`);

export default function GalponChart({ series, reducedMotion }: { series: Point[]; reducedMotion: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="#e0f2d9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#4e7a38' }} tickLine={false} axisLine={{ stroke: '#c0e6b3' }} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={{ fontSize: 10, fill: '#86a86a' }} tickLine={false} axisLine={false} width={34} tickFormatter={eggShort} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #c0e6b3', fontSize: 12, fontFamily: 'Fira Sans, sans-serif' }}
          formatter={(value, name) => [`${Number(value ?? 0).toLocaleString('es-GT')} huevos`, String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} iconType="circle" />
        <Bar dataKey="eggs" name="Producción" fill="#a1d98c" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion} />
        <Line type="monotone" dataKey="rotos" name="Rotos" stroke="#ea580c" strokeWidth={2} dot={false} isAnimationActive={!reducedMotion} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
