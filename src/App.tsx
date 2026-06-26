import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Cloud,
  Egg,
  Eye,
  EyeOff,
  LineChart,
  LogOut,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldCheck,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import {
  createUser,
  forgotPassword,
  getDashboard,
  getInventory,
  getMe,
  getNotifications,
  getUsers,
  login,
  logout,
  markNotificationsRead,
  postCollection,
  postExpense,
  postSale,
  resetPassword,
  updateUser
} from './lib/api';
import { enqueueOperation, getQueuedOperations, syncQueuedOperations } from './lib/offline';
import type {
  AdminUser,
  AppNotification,
  CategoryKey,
  CollectionPayload,
  CreateUserPayload,
  ExpensePayload,
  Role,
  SalePayload,
  User
} from './types';

const categoryLabels: Record<CategoryKey, string> = {
  pequeno: 'Pequeno',
  mediano: 'Mediano',
  grande: 'Grande',
  extra_grande: 'Extra grande',
  jumbo: 'Jumbo'
};

const categoryOrder: CategoryKey[] = ['grande', 'mediano', 'pequeno', 'extra_grande', 'jumbo'];

const collectionFieldByCategory: Record<CategoryKey, keyof CollectionPayload> = {
  grande: 'grande',
  mediano: 'mediano',
  pequeno: 'pequeno',
  extra_grande: 'extraGrande',
  jumbo: 'jumbo'
};

const expenseCategories = ['Alimento', 'Vacunas', 'Medicamentos', 'Materia prima', 'Transporte', 'Otros'];

const dateToday = () => new Date().toISOString().slice(0, 10);

const emptyCollection = (): CollectionPayload => ({
  collectionDate: dateToday(),
  pequeno: 0,
  mediano: 0,
  grande: 0,
  extraGrande: 0,
  jumbo: 0,
  rotos: 0,
  notes: ''
});

const emptySale = (): SalePayload => ({
  saleDate: dateToday(),
  customer: '',
  notes: '',
  items: [{ productType: 'cajon', category: 'grande', quantity: 1, unitPrice: 0 }]
});

const emptyExpense = (): ExpensePayload => ({ expenseDate: dateToday(), category: 'Alimento', supplier: '', amount: 0, notes: '' });

function isNetworkError(error: unknown) {
  return !navigator.onLine || error instanceof TypeError;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-GT').format(value || 0);
}

function collectionProduction(collection: Record<string, number>) {
  return categoryOrder.reduce((sum, key) => sum + Number(collection[key] || 0), 0);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

function notificationIcon(type: AppNotification['type']) {
  if (type === 'sale') return <CircleDollarSign size={18} />;
  if (type === 'expense') return <ReceiptText size={18} />;
  if (type === 'low_inventory') return <AlertTriangle size={18} />;
  return <Egg size={18} />;
}

type ProfitTrend = { label: string; tone: 'good' | 'bad' | 'neutral'; dir: 'up' | 'down' | null };

function profitTrend(profit: number, yesterday: number): ProfitTrend {
  if (yesterday !== 0) {
    const pct = Math.round(((profit - yesterday) / Math.abs(yesterday)) * 100);
    if (pct > 0) return { label: `+${pct}% vs ayer`, tone: 'good', dir: 'up' };
    if (pct < 0) return { label: `${pct}% vs ayer`, tone: 'bad', dir: 'down' };
    return { label: 'Igual que ayer', tone: 'neutral', dir: null };
  }
  if (profit > 0) return { label: 'Positiva', tone: 'good', dir: 'up' };
  if (profit < 0) return { label: 'Negativa', tone: 'bad', dir: 'down' };
  return { label: 'Sin movimiento', tone: 'neutral', dir: null };
}

/* ---------------------------------------------------------------- primitives */

function Toast({ title, detail, onDone }: { title: string; detail?: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">
        <Check size={18} />
      </span>
      <span className="toast-text">
        <span className="toast-title">{title}</span>
        {detail && <span className="toast-detail">{detail}</span>}
      </span>
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

function CounterRow({
  label,
  helper,
  value,
  onChange,
  tone = 'mint'
}: {
  label: string;
  helper?: string;
  value: number;
  onChange: (next: number) => void;
  tone?: 'mint' | 'warning';
}) {
  return (
    <div className={`counter ${tone === 'warning' ? 'counter-warning' : ''}`}>
      <span className="counter-icon" aria-hidden="true">
        {tone === 'warning' ? <AlertTriangle size={22} /> : <Egg size={22} />}
      </span>
      <span className="counter-copy">
        <span className="counter-label">{label}</span>
        {helper && <span className="counter-helper">{helper}</span>}
      </span>
      <button
        type="button"
        className="counter-btn counter-btn-ghost"
        aria-label={`Quitar uno a ${label}`}
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
      >
        <Minus size={20} />
      </button>
      <input
        className="counter-input number-text"
        type="number"
        min="0"
        inputMode="numeric"
        aria-label={`Cantidad ${label}`}
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={(event) => onChange(Math.max(0, Math.floor(Number(event.target.value || 0))))}
      />
      <button
        type="button"
        className="counter-btn counter-btn-solid"
        aria-label={`Agregar uno a ${label}`}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={20} />
      </button>
    </div>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="chip-field">
      <legend className="field-legend">{label}</legend>
      <div className="chip-row">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="field-control" type="date" max={dateToday()} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ScreenHeader({ title, sub, status }: { title: string; sub?: string; status?: React.ReactNode }) {
  return (
    <div className="screen-head">
      <div>
        <h1 className="screen-title">{title}</h1>
        {sub && <p className="screen-sub">{sub}</p>}
      </div>
      {status}
    </div>
  );
}

function OnlinePill({ online }: { online: boolean }) {
  return (
    <span className={`pill ${online ? 'pill-online' : 'pill-offline'}`}>
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
      {online ? 'En linea' : 'Sin conexion'}
    </span>
  );
}

/* ----------------------------------------------------------------- welcome */

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="welcome">
      <div className="welcome-hero">
        <div className="welcome-brand">
          <span className="welcome-logo" aria-hidden="true">
            <Egg size={20} />
          </span>
          <span>El Rancho</span>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span className="welcome-art-ring welcome-art-ring-1" />
          <span className="welcome-art-ring welcome-art-ring-2" />
          <span className="welcome-art-egg">
            <Egg size={56} strokeWidth={1.5} />
          </span>
        </div>
      </div>
      <div className="welcome-body">
        <p className="eyebrow">Granja avicola</p>
        <h1 className="welcome-title">Registra tu granja sin perder tiempo</h1>
        <p className="welcome-lead">Recoleccion, ventas y gastos de huevos en pocos toques. Funciona aunque se caiga el internet.</p>
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onStart}>
          Comenzar
          <ArrowRight size={20} />
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onStart}>
          Ya tengo cuenta
        </button>
        <p className="welcome-note">
          <ShieldCheck size={16} /> Modo offline incluido
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------- login */

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (value: string) => void; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-affix">
        <input
          className="field-control field-control-affix"
          type={visible ? 'text' : 'password'}
          required
          minLength={label.toLowerCase().includes('nueva') ? 8 : undefined}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          aria-label={visible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
          className="field-toggle"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </span>
    </label>
  );
}

function LoginScreen({ onLogin, onBack }: { onLogin: (user: User) => void; onBack: () => void }) {
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      if (mode === 'login') {
        const result = await login(email, password);
        onLogin(result.user);
      }
      if (mode === 'forgot') {
        const result = await forgotPassword(email);
        setMessage(result.devToken ? `${result.message} Token dev: ${result.devToken}` : result.message);
        setMode('reset');
      }
      if (mode === 'reset') {
        const result = await resetPassword(token, password);
        setMessage(result.message);
        setMode('login');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setLoading(false);
    }
  }

  const title = mode === 'login' ? 'Entrar al sistema' : mode === 'forgot' ? 'Recuperar contrasena' : 'Nueva contrasena';

  return (
    <main className="auth">
      <div className="auth-top">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Volver" onClick={onBack}>
          <ChevronRight size={20} className="flip" />
        </button>
        <span className="auth-brand">
          <span className="welcome-logo" aria-hidden="true">
            <Egg size={18} />
          </span>
          El Rancho
        </span>
      </div>
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="pill pill-online auth-badge">
          <ShieldCheck size={14} /> PWA con modo offline
        </span>
        <h1 id="auth-title" className="screen-title">
          {title}
        </h1>
        <p className="auth-lead">
          {mode === 'login' ? 'Usa tu correo y contrasena para continuar.' : 'El token de recuperacion vence en 30 minutos.'}
        </p>

        <form onSubmit={submit} className="form-grid">
          {mode !== 'reset' && (
            <label className="field">
              <span className="field-label">Correo electronico</span>
              <input
                className="field-control"
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          {mode === 'reset' && (
            <label className="field">
              <span className="field-label">Token de recuperacion</span>
              <input className="field-control" required value={token} onChange={(event) => setToken(event.target.value)} />
            </label>
          )}
          {mode !== 'forgot' && (
            <PasswordField
              label={mode === 'login' ? 'Contrasena' : 'Nueva contrasena'}
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={setPassword}
            />
          )}
          {message && (
            <p aria-live="polite" className="status-message">
              {message}
            </p>
          )}
          <button className="btn btn-primary btn-block btn-lg" disabled={loading} aria-busy={loading}>
            {loading ? 'Procesando...' : mode === 'login' ? 'Entrar' : mode === 'forgot' ? 'Enviar instrucciones' : 'Cambiar contrasena'}
          </button>
        </form>

        <div className="auth-links">
          {mode !== 'login' && (
            <button type="button" className="link-btn" onClick={() => setMode('login')}>
              Volver al login
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className="link-btn" onClick={() => setMode('forgot')}>
              Olvide la contrasena
            </button>
          )}
          {mode === 'forgot' && (
            <button type="button" className="link-btn" onClick={() => setMode('reset')}>
              Ya tengo token
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

/* --------------------------------------------------------------------- hoy */

function HoyScreen({
  user,
  online,
  unread,
  onOpenNotifications
}: {
  user: User;
  online: boolean;
  unread: number;
  onOpenNotifications: () => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo cargar el resumen.'));
  }, []);

  const production = data ? collectionProduction(data.collection) : 0;
  const rotos = data ? Number(data.collection.rotos || 0) : 0;

  return (
    <section className="screen screen-hoy">
      <div className="hoy-hero">
        <img
          className="hoy-hero-img"
          src="/brand/hero.jpg"
          alt=""
          aria-hidden="true"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
        <div className="hoy-hero-row">
          <div className="hoy-greeting">
            <span className="hoy-avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="hoy-hello">Buenos dias</p>
              <p className="hoy-name">{user.name}</p>
            </div>
          </div>
          <button
            type="button"
            className="hoy-bell"
            onClick={onOpenNotifications}
            aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
          >
            <Bell size={20} />
            {unread > 0 && (
              <span className="bell-badge" aria-live="polite">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>
      </div>

      {message && (
        <p className="status-message status-message-danger" role="alert">
          {message}
        </p>
      )}

      <div className="hoy-feature">
        <div className="hoy-feature-top">
          <span className="hoy-feature-label">Ganancia de hoy</span>
          {data &&
            (() => {
              const trend = profitTrend(data.profit, data.profitYesterday);
              return (
                <span className={`pill ${trend.tone === 'good' ? 'pill-online' : trend.tone === 'bad' ? 'pill-danger' : 'pill-neutral'}`}>
                  {trend.dir === 'up' && <TrendingUp size={13} />}
                  {trend.dir === 'down' && <TrendingDown size={13} />}
                  {trend.label}
                </span>
              );
            })()}
        </div>
        {data ? <p className="hoy-feature-value number-text">{formatMoney(data.profit)}</p> : <Skeleton className="skeleton-feature" />}
      </div>

      <div className="stat-grid">
        <article className="stat-card">
          <p className="stat-label">Produccion</p>
          {data ? <p className="stat-value number-text">{formatNumber(production)}</p> : <Skeleton className="skeleton-stat" />}
          <p className="stat-meta">huevos buenos</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Ventas</p>
          {data ? <p className="stat-value number-text">{formatMoney(data.sales.total)}</p> : <Skeleton className="skeleton-stat" />}
          <p className="stat-meta">{data ? `${data.sales.count} ventas` : ''}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Gastos</p>
          {data ? <p className="stat-value number-text">{formatMoney(data.expenses.total)}</p> : <Skeleton className="skeleton-stat" />}
          <p className="stat-meta">{data ? `${data.expenses.count} gastos` : ''}</p>
        </article>
      </div>

      {rotos > 0 && (
        <p className="merma-chip">
          <AlertTriangle size={14} />
          {formatNumber(rotos)} huevos rotos hoy · merma
        </p>
      )}

      <div className="section-head">
        <h2 className="section-title">Inventario disponible</h2>
        <span className={`sync-tag ${online ? '' : 'sync-tag-off'}`}>{online ? 'Sincronizado' : 'Pendiente'}</span>
      </div>
      <div className="list">
        {!data &&
          [0, 1, 2].map((index) => (
            <div key={index} className="list-row">
              <Skeleton className="skeleton-icon" />
              <Skeleton className="skeleton-line" />
            </div>
          ))}
        {data &&
          data.inventory.map((item) => (
            <div key={item.category} className="list-row">
              <span className="list-icon" aria-hidden="true">
                <Egg size={18} />
              </span>
              <span className="list-main">
                <span className="list-title">{categoryLabels[item.category as CategoryKey] ?? item.category}</span>
                <span className="list-sub">disponible para vender</span>
              </span>
              <span className="list-value number-text">{formatNumber(item.quantity)}</span>
            </div>
          ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- registrar */

type Seg = 'recoleccion' | 'venta' | 'gasto';

function CollectionPanel({
  user,
  online,
  form,
  setForm,
  onSaved,
  onQueued
}: {
  user: User;
  online: boolean;
  form: CollectionPayload;
  setForm: (next: CollectionPayload) => void;
  onSaved: (detail: string) => void;
  onQueued: () => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const production = categoryOrder.reduce((sum, key) => sum + Number(form[collectionFieldByCategory[key]] || 0), 0);

  function setField(field: keyof CollectionPayload, next: number) {
    setForm({ ...form, [field]: next });
  }

  async function submit() {
    setLoading(true);
    setMessage('');
    try {
      await postCollection(form);
      onSaved('Inventario actualizado');
      setForm(emptyCollection());
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueueOperation({ type: 'collection', payload: form });
        onQueued();
        setForm(emptyCollection());
        setMessage('Sin conexion: recoleccion guardada en este dispositivo.');
      } else {
        setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel-flow">
      <DateField label="Fecha de recoleccion" value={form.collectionDate} onChange={(value) => setForm({ ...form, collectionDate: value })} />
      <p className="seg-help">Escribe la cantidad o usa los botones por tamano.</p>
      <div className="stack">
        {categoryOrder.map((key) => (
          <CounterRow
            key={key}
            label={categoryLabels[key]}
            value={Number(form[collectionFieldByCategory[key]] || 0)}
            onChange={(next) => setField(collectionFieldByCategory[key], next)}
          />
        ))}
        <CounterRow label="Huevos rotos" helper="Merma del dia" tone="warning" value={form.rotos} onChange={(next) => setField('rotos', next)} />
      </div>

      <div className="total-row">
        <span className="total-label">Total recolectado</span>
        <span className="total-value number-text">
          {formatNumber(production)} <span className="total-unit">huevos buenos</span>
        </span>
      </div>

      {message && (
        <p className="status-message" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block btn-lg"
        onClick={submit}
        disabled={loading || production + form.rotos === 0}
        aria-busy={loading}
      >
        <Check size={20} />
        {loading ? 'Guardando...' : 'Guardar recoleccion'}
      </button>
      <p className="save-as">
        Se guarda como <strong>{user.name}</strong> {online ? '· en linea' : '· offline'}
      </p>
    </div>
  );
}

function SalePanel({
  form,
  setForm,
  onSaved,
  onQueued
}: {
  form: SalePayload;
  setForm: (next: SalePayload) => void;
  onSaved: (detail: string) => void;
  onQueued: () => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const item = form.items[0];
  const eggs = (item.productType === 'oferta_grande' ? 90 : 360) * item.quantity;
  const total = item.quantity * item.unitPrice;

  function updateItem(next: Partial<SalePayload['items'][number]>) {
    const updated = { ...item, ...next };
    if (updated.productType === 'oferta_grande') updated.category = 'grande';
    setForm({ ...form, items: [updated] });
  }

  async function submit() {
    setLoading(true);
    setMessage('');
    try {
      await postSale(form);
      onSaved('Inventario descontado');
      setForm(emptySale());
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueueOperation({ type: 'sale', payload: form });
        onQueued();
        setForm(emptySale());
        setMessage('Sin conexion: venta pendiente. Se validara inventario al sincronizar.');
      } else {
        setMessage(error instanceof Error ? error.message : 'No se pudo guardar la venta.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel-flow">
      <DateField label="Fecha de venta" value={form.saleDate} onChange={(value) => setForm({ ...form, saleDate: value })} />
      <p className="seg-help">Cada venta descuenta inventario al guardar.</p>

      <ChipGroup
        label="Producto"
        value={item.productType}
        onChange={(value) => updateItem({ productType: value })}
        options={[
          { value: 'cajon', label: 'Cajon · 360' },
          { value: 'oferta_grande', label: 'Oferta · 90' }
        ]}
      />

      <ChipGroup
        label="Categoria"
        value={item.category}
        onChange={(value) => updateItem({ category: value })}
        options={categoryOrder.map((key) => ({ value: key, label: categoryLabels[key] }))}
      />

      <div className="duo-grid">
        <label className="field">
          <span className="field-label">Cantidad</span>
          <input
            className="field-control number-text"
            type="number"
            min="1"
            inputMode="numeric"
            value={item.quantity}
            onChange={(event) => updateItem({ quantity: Number(event.target.value || 1) })}
          />
        </label>
        <label className="field">
          <span className="field-label">Precio unitario</span>
          <input
            className="field-control number-text"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={item.unitPrice}
            onChange={(event) => updateItem({ unitPrice: Number(event.target.value || 0) })}
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Cliente (opcional)</span>
        <input className="field-control" value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} />
      </label>

      <div className="total-card">
        <div>
          <p className="total-card-label">Total venta</p>
          <p className="total-card-meta">{formatNumber(eggs)} huevos a descontar</p>
        </div>
        <p className="total-card-value number-text">{formatMoney(total)}</p>
      </div>

      {message && (
        <p className="status-message" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <button type="button" className="btn btn-accent btn-block btn-lg" onClick={submit} disabled={loading} aria-busy={loading}>
        <CircleDollarSign size={20} />
        {loading ? 'Guardando...' : 'Registrar venta'}
      </button>
    </div>
  );
}

function ExpensePanel({
  form,
  setForm,
  onSaved,
  onQueued
}: {
  form: ExpensePayload;
  setForm: (next: ExpensePayload) => void;
  onSaved: (detail: string) => void;
  onQueued: () => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setMessage('');
    try {
      await postExpense(form);
      onSaved('Gasto registrado');
      setForm(emptyExpense());
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueueOperation({ type: 'expense', payload: form });
        onQueued();
        setForm(emptyExpense());
        setMessage('Sin conexion: gasto guardado pendiente.');
      } else {
        setMessage(error instanceof Error ? error.message : 'No se pudo guardar el gasto.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel-flow">
      <DateField label="Fecha del gasto" value={form.expenseDate} onChange={(value) => setForm({ ...form, expenseDate: value })} />
      <p className="seg-help">Registra compras y costos del dia.</p>

      <ChipGroup
        label="Tipo de gasto"
        value={form.category}
        onChange={(value) => setForm({ ...form, category: value })}
        options={expenseCategories.map((category) => ({ value: category, label: category }))}
      />

      <label className="field">
        <span className="field-label">Monto</span>
        <div className="amount-input">
          <span className="amount-symbol number-text">Q</span>
          <input
            className="field-control field-control-amount number-text"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            value={form.amount === 0 ? '' : form.amount}
            placeholder="0"
            onChange={(event) => setForm({ ...form, amount: Number(event.target.value || 0) })}
          />
        </div>
      </label>

      <label className="field">
        <span className="field-label">Proveedor o nota (opcional)</span>
        <input
          className="field-control"
          placeholder="Agregar nota o proveedor..."
          value={form.supplier}
          onChange={(event) => setForm({ ...form, supplier: event.target.value })}
        />
      </label>

      {message && (
        <p className="status-message" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={submit} disabled={loading || form.amount <= 0} aria-busy={loading}>
        <Check size={20} />
        {loading ? 'Guardando...' : 'Guardar gasto'}
      </button>
    </div>
  );
}

function RegistrarScreen({
  user,
  isAdmin,
  online,
  hidden,
  draft,
  setDraft,
  onSaved,
  onQueued
}: {
  user: User;
  isAdmin: boolean;
  online: boolean;
  hidden: boolean;
  draft: RegistrarDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegistrarDraft>>;
  onSaved: (detail: string) => void;
  onQueued: () => void;
}) {
  const segments: Array<{ key: Seg; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { key: 'recoleccion', label: 'Recoleccion', icon: <Egg size={18} /> },
    { key: 'venta', label: 'Venta', icon: <CircleDollarSign size={18} />, adminOnly: true },
    { key: 'gasto', label: 'Gasto', icon: <ReceiptText size={18} />, adminOnly: true }
  ];
  const available = segments.filter((segment) => isAdmin || !segment.adminOnly);
  const seg = draft.seg;

  return (
    <section className="screen screen-pad" hidden={hidden} aria-hidden={hidden}>
      <ScreenHeader title="Registrar" sub="Trabajo de campo" status={<OnlinePill online={online} />} />

      <div className="segmented" role="tablist" aria-label="Tipo de registro">
        {available.map((segment) => (
          <button
            key={segment.key}
            type="button"
            role="tab"
            aria-selected={seg === segment.key}
            className="segment"
            onClick={() => setDraft((current) => ({ ...current, seg: segment.key }))}
          >
            {segment.icon}
            {segment.label}
          </button>
        ))}
      </div>

      {seg === 'recoleccion' && (
        <CollectionPanel
          user={user}
          online={online}
          form={draft.collection}
          setForm={(next) => setDraft((current) => ({ ...current, collection: next }))}
          onSaved={onSaved}
          onQueued={onQueued}
        />
      )}
      {seg === 'venta' && isAdmin && (
        <SalePanel
          form={draft.sale}
          setForm={(next) => setDraft((current) => ({ ...current, sale: next }))}
          onSaved={onSaved}
          onQueued={onQueued}
        />
      )}
      {seg === 'gasto' && isAdmin && (
        <ExpensePanel
          form={draft.expense}
          setForm={(next) => setDraft((current) => ({ ...current, expense: next }))}
          onSaved={onSaved}
          onQueued={onQueued}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------- inventario */

function InventarioScreen() {
  const [inventory, setInventory] = useState<Array<{ category: string; quantity: number; updated_at: string }>>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const result = await getInventory();
      setInventory(result.inventory);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar inventario.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalEggs = inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const max = Math.max(1, ...inventory.map((item) => Number(item.quantity || 0)));
  const updated = inventory.map((item) => item.updated_at).filter(Boolean).sort().at(-1);

  return (
    <section className="screen screen-pad">
      <ScreenHeader title="Inventario" sub={updated ? `Actualizado ${new Date(updated).toLocaleString('es-GT')}` : 'Existencia por categoria'} />

      <div className="feature-banner">
        <p className="feature-banner-label">Existencia total</p>
        <p className="feature-banner-value number-text">
          {formatNumber(totalEggs)} <span className="feature-banner-unit">huevos</span>
        </p>
      </div>

      {message && (
        <p className="status-message status-message-danger" role="alert">
          {message}
        </p>
      )}

      <div className="stack">
        {loading &&
          [0, 1, 2, 3].map((index) => (
            <div key={index} className="inv-card">
              <div className="inv-card-top">
                <Skeleton className="skeleton-icon" />
                <Skeleton className="skeleton-line" />
              </div>
            </div>
          ))}
        {!loading &&
          inventory.map((item) => {
            const quantity = Number(item.quantity || 0);
            return (
              <div key={item.category} className="inv-card">
                <div className="inv-card-top">
                  <span className="list-icon" aria-hidden="true">
                    <Egg size={18} />
                  </span>
                  <span className="list-main">
                    <span className="list-title">{categoryLabels[item.category as CategoryKey] ?? item.category}</span>
                    <span className="list-sub">{formatNumber(quantity)} huevos</span>
                  </span>
                  <span className="list-value number-text">{formatNumber(quantity)}</span>
                </div>
                <div className="inv-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((quantity / max) * 100)}%` }} />
                </div>
              </div>
            );
          })}
      </div>

      <button type="button" className="btn btn-secondary btn-block" onClick={load} disabled={loading}>
        <RotateCcw size={18} />
        Actualizar inventario
      </button>
    </section>
  );
}

/* ---------------------------------------------------------------- reportes */

function ReportesScreen() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo cargar reportes.'));
  }, []);

  const production = data ? collectionProduction(data.collection) : 0;

  return (
    <section className="screen screen-pad">
      <ScreenHeader title="Reportes" sub="Cifras del dia de hoy" />

      {message && (
        <p className="status-message status-message-danger" role="alert">
          {message}
        </p>
      )}

      <div className="empty-card">
        <span className="empty-card-icon" aria-hidden="true">
          <LineChart size={28} strokeWidth={1.7} />
        </span>
        <p className="empty-card-title">Tendencias por periodo</p>
        <p className="empty-card-text">Apareceran cuando haya varios dias de historial acumulado.</p>
      </div>

      <div className="stack">
        <div className="kv-row">
          <span className="kv-label">Produccion de hoy</span>
          <span className="kv-value number-text">{data ? formatNumber(production) : '—'}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Ventas de hoy</span>
          <span className="kv-value number-text">{data ? formatMoney(data.sales.total) : '—'}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Gastos de hoy</span>
          <span className="kv-value number-text">{data ? formatMoney(data.expenses.total) : '—'}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Ganancia de hoy</span>
          <span className={`kv-value number-text ${data && data.profit < 0 ? 'kv-negative' : 'kv-positive'}`}>
            {data ? formatMoney(data.profit) : '—'}
          </span>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- ajustes */

function AjustesScreen({
  user,
  online,
  pending,
  onSync,
  onOpenUsers,
  onLogout
}: {
  user: User;
  online: boolean;
  pending: number;
  onSync: () => void;
  onOpenUsers: () => void;
  onLogout: () => void;
}) {
  const isAdmin = user.role === 'admin';
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="screen screen-pad">
      <ScreenHeader title="Ajustes" sub="Tu cuenta y sincronizacion" />

      <div className="profile-card">
        <span className="profile-avatar" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="profile-info">
          <p className="profile-name">{user.name}</p>
          <p className="profile-role">{isAdmin ? 'Administrador' : 'Trabajador'}</p>
        </div>
      </div>

      <div className="stack">
        <button type="button" className="settings-row" onClick={onSync} disabled={!online || pending === 0}>
          <span className="settings-icon" aria-hidden="true">
            <Cloud size={18} />
          </span>
          <span className="settings-label">Sincronizacion</span>
          <span className="settings-meta">{!online ? 'Sin conexion' : pending > 0 ? `${pending} pendientes` : 'Al dia'}</span>
          <ChevronRight size={18} className="settings-chevron" />
        </button>

        {isAdmin && (
          <>
            <div className="settings-row settings-row-static">
              <span className="settings-icon" aria-hidden="true">
                <Building2 size={18} />
              </span>
              <span className="settings-label">Perfil de granja</span>
              <span className="settings-meta">El Rancho</span>
            </div>
            <div className="settings-row settings-row-static">
              <span className="settings-icon" aria-hidden="true">
                <Tag size={18} />
              </span>
              <span className="settings-label">Precios y categorias</span>
              <span className="settings-meta">Proximamente</span>
            </div>
            <button type="button" className="settings-row" onClick={onOpenUsers}>
              <span className="settings-icon" aria-hidden="true">
                <Users size={18} />
              </span>
              <span className="settings-label">Usuarios</span>
              <ChevronRight size={18} className="settings-chevron" />
            </button>
          </>
        )}
      </div>

      {!confirming ? (
        <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirming(true)}>
          <LogOut size={18} />
          Cerrar sesion
        </button>
      ) : (
        <div className="confirm-inline" role="group" aria-label="Confirmar cierre de sesion">
          <span className="confirm-inline-text">Cerrar sesion en este equipo?</span>
          <div className="confirm-inline-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)} aria-label="Cancelar">
              Cancelar
            </button>
            <button type="button" className="btn btn-danger-solid btn-sm" onClick={onLogout}>
              <LogOut size={16} />
              Confirmar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- usuarios */

function roleLabel(role: Role) {
  return role === 'admin' ? 'Administrador' : 'Trabajador';
}

function UsersScreen({ currentUser, onBack, onToast }: { currentUser: User; onBack: () => void; onToast: (detail: string) => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const emptyDraft: CreateUserPayload = { name: '', email: '', role: 'trabajador', password: '' };
  const [draft, setDraft] = useState<CreateUserPayload>(emptyDraft);
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const result = await getUsers();
      setUsers(result.users);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar usuarios.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submitCreate() {
    setSaving(true);
    setFormMessage('');
    try {
      await createUser({ ...draft, email: draft.email.trim().toLowerCase() });
      onToast('Usuario creado');
      setDraft(emptyDraft);
      setCreating(false);
      await load();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  }

  async function patch(user: AdminUser, changes: { role?: Role; active?: boolean }) {
    setBusyId(user.id);
    setMessage('');
    try {
      await updateUser(user.id, changes);
      onToast('Usuario actualizado');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="screen screen-pad">
      <div className="subscreen-top">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Volver a ajustes" onClick={onBack}>
          <ChevronRight size={20} className="flip" />
        </button>
        <div>
          <h1 className="screen-title">Usuarios</h1>
          <p className="screen-sub">Quien puede entrar al sistema</p>
        </div>
      </div>

      {message && (
        <p className="status-message status-message-danger" role="alert">
          {message}
        </p>
      )}

      {!creating ? (
        <button type="button" className="btn btn-primary btn-block" onClick={() => setCreating(true)}>
          <Plus size={18} />
          Nuevo usuario
        </button>
      ) : (
        <div className="create-card">
          <p className="create-card-title">Nuevo usuario</p>
          <label className="field">
            <span className="field-label">Nombre</span>
            <input className="field-control" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Correo</span>
            <input
              className="field-control"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
          </label>
          <ChipGroup
            label="Rol"
            value={draft.role}
            onChange={(value) => setDraft({ ...draft, role: value })}
            options={[
              { value: 'trabajador' as Role, label: 'Trabajador' },
              { value: 'admin' as Role, label: 'Administrador' }
            ]}
          />
          <label className="field">
            <span className="field-label">Contrasena inicial</span>
            <input
              className="field-control"
              type="text"
              autoComplete="off"
              minLength={8}
              placeholder="Minimo 8 caracteres"
              value={draft.password}
              onChange={(event) => setDraft({ ...draft, password: event.target.value })}
            />
          </label>
          {formMessage && (
            <p className="status-message status-message-danger" role="alert">
              {formMessage}
            </p>
          )}
          <div className="confirm-inline-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setCreating(false);
                setDraft(emptyDraft);
                setFormMessage('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={submitCreate}
              disabled={saving || draft.name.length < 2 || draft.password.length < 8}
              aria-busy={saving}
            >
              {saving ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      <div className="stack">
        {!users && [0, 1, 2].map((index) => (
          <div key={index} className="user-card">
            <div className="user-card-top">
              <Skeleton className="skeleton-icon" />
              <Skeleton className="skeleton-line" />
            </div>
          </div>
        ))}
        {users &&
          users.map((user) => {
            const self = user.id === currentUser.id;
            const busy = busyId === user.id;
            return (
              <div key={user.id} className={`user-card ${user.active ? '' : 'user-card-inactive'}`}>
                <div className="user-card-top">
                  <span className="user-avatar" aria-hidden="true">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="user-main">
                    <span className="user-name">
                      {user.name}
                      {self && <span className="user-self">tu</span>}
                    </span>
                    <span className="user-email">{user.email}</span>
                  </span>
                  <span className={`user-badge ${user.active ? 'user-badge-on' : 'user-badge-off'}`}>{user.active ? 'Activo' : 'Inactivo'}</span>
                </div>
                <div className="user-card-actions">
                  <button
                    type="button"
                    className="user-action"
                    disabled={busy || self}
                    onClick={() => patch(user, { role: user.role === 'admin' ? 'trabajador' : 'admin' })}
                  >
                    {roleLabel(user.role)}
                    {!self && <span className="user-action-hint">cambiar</span>}
                  </button>
                  <button
                    type="button"
                    className={`user-action ${user.active ? 'user-action-danger' : ''}`}
                    disabled={busy || self}
                    onClick={() => patch(user, { active: !user.active })}
                  >
                    {user.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ sync banner */

function NotificationsSheet({
  open,
  notifications,
  onClose
}: {
  open: boolean;
  notifications: AppNotification[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="notif-scrim" role="dialog" aria-modal="true" aria-label="Notificaciones" onClick={onClose}>
      <div className="notif-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="notif-head">
          <h2 className="notif-title">Notificaciones</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {notifications.length === 0 ? (
          <div className="notif-empty">
            <span className="notif-empty-icon" aria-hidden="true">
              <Bell size={26} />
            </span>
            <p className="notif-empty-text">Sin notificaciones todavia</p>
            <p className="notif-empty-sub">Aqui veras los registros de los trabajadores y avisos de inventario.</p>
          </div>
        ) : (
          <div className="notif-list">
            {notifications.map((item) => (
              <div key={item.id} className={`notif-row ${item.type === 'low_inventory' ? 'notif-row-warn' : ''}`}>
                <span className="notif-icon" aria-hidden="true">
                  {notificationIcon(item.type)}
                </span>
                <span className="notif-main">
                  <span className="notif-row-title">{item.title}</span>
                  {item.body && <span className="notif-row-body">{item.body}</span>}
                </span>
                <span className="notif-time">
                  {timeAgo(item.created_at)}
                  {item.source === 'sync' ? ' · sync' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SyncBanner({ online, pending, onSync }: { online: boolean; pending: number; onSync: () => void }) {
  if (online && pending === 0) return null;
  return (
    <div className="sync-banner" role="status" aria-live="polite">
      <span className="sync-banner-text">
        <WifiOff size={20} />
        {online ? `${pending} registros pendientes por sincronizar.` : 'Sin internet. Los registros se guardan en este dispositivo.'}
      </span>
      {online && pending > 0 && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onSync}>
          Sincronizar
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- shell */

type ViewKey = 'hoy' | 'registrar' | 'inventario' | 'reportes' | 'ajustes' | 'usuarios';

type RegistrarDraft = {
  seg: Seg;
  collection: CollectionPayload;
  sale: SalePayload;
  expense: ExpensePayload;
};

const NAV: Array<{ key: ViewKey; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
  { key: 'hoy', label: 'Hoy', icon: <BarChart3 size={22} />, adminOnly: true },
  { key: 'registrar', label: 'Registrar', icon: <ClipboardList size={22} /> },
  { key: 'inventario', label: 'Inventario', icon: <PackageCheck size={22} />, adminOnly: true },
  { key: 'reportes', label: 'Reportes', icon: <LineChart size={22} />, adminOnly: true },
  { key: 'ajustes', label: 'Ajustes', icon: <Settings size={22} /> }
];

function AppShell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const isAdmin = user.role === 'admin';
  const nav = useMemo(() => NAV.filter((item) => isAdmin || !item.adminOnly), [isAdmin]);
  const allowed: ViewKey[] = [...nav.map((item) => item.key), ...(isAdmin ? (['usuarios'] as ViewKey[]) : [])];

  const readHashView = (): ViewKey => {
    const hash = window.location.hash.replace('#', '') as ViewKey;
    return allowed.includes(hash) ? hash : allowed.includes('hoy') ? 'hoy' : 'registrar';
  };

  const [view, setView] = useState<ViewKey>(readHashView);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState<{ title: string; detail?: string } | null>(null);
  const [draft, setDraft] = useState<RegistrarDraft>(() => ({
    seg: 'recoleccion',
    collection: emptyCollection(),
    sale: emptySale(),
    expense: emptyExpense()
  }));
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  async function refreshPending() {
    setPending((await getQueuedOperations()).length);
  }

  async function loadNotifications() {
    try {
      const result = await getNotifications();
      setNotifications(result.notifications);
      setUnread(result.unreadCount);
    } catch {
      /* sin conexion o error transitorio: se reintenta en el siguiente ciclo */
    }
  }

  async function openNotifications() {
    setNotifOpen(true);
    if (unread > 0) {
      setUnread(0);
      await markNotificationsRead().catch(() => undefined);
    }
  }

  async function runSync() {
    await syncQueuedOperations().catch(() => undefined);
    await refreshPending();
    if (isAdmin) loadNotifications();
  }

  useEffect(() => {
    refreshPending();
    const goOnline = () => {
      setOnline(true);
      runSync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => setView(readHashView());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    loadNotifications();
    const interval = setInterval(() => {
      if (!document.hidden) loadNotifications();
    }, 25000);
    const onFocus = () => {
      if (!document.hidden) loadNotifications();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAdmin]);

  function selectView(next: ViewKey) {
    setView(next);
    if (window.location.hash !== `#${next}`) window.location.hash = next;
  }

  function handleSaved(detail: string) {
    setToast({ title: 'Registro guardado', detail });
    refreshPending();
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>

      <main id="main" className="shell-main" tabIndex={-1}>
        <SyncBanner online={online} pending={pending} onSync={runSync} />
        {view === 'hoy' && isAdmin && (
          <HoyScreen user={user} online={online} unread={unread} onOpenNotifications={openNotifications} />
        )}
        <RegistrarScreen
          user={user}
          isAdmin={isAdmin}
          online={online}
          hidden={view !== 'registrar'}
          draft={draft}
          setDraft={setDraft}
          onSaved={handleSaved}
          onQueued={refreshPending}
        />
        {view === 'inventario' && isAdmin && <InventarioScreen />}
        {view === 'reportes' && isAdmin && <ReportesScreen />}
        {view === 'ajustes' && (
          <AjustesScreen
            user={user}
            online={online}
            pending={pending}
            onSync={runSync}
            onOpenUsers={() => selectView('usuarios')}
            onLogout={onLogout}
          />
        )}
        {view === 'usuarios' && isAdmin && (
          <UsersScreen currentUser={user} onBack={() => selectView('ajustes')} onToast={(detail) => setToast({ title: 'Listo', detail })} />
        )}
      </main>

      {toast && <Toast title={toast.title} detail={toast.detail} onDone={() => setToast(null)} />}

      <NotificationsSheet open={notifOpen} notifications={notifications} onClose={() => setNotifOpen(false)} />

      <nav className="bottom-nav" aria-label="Navegacion principal">
        {nav.map((item) => (
          <button
            key={item.key}
            type="button"
            className="nav-item"
            aria-current={view === item.key || (item.key === 'ajustes' && view === 'usuarios') ? 'page' : undefined}
            onClick={() => selectView(item.key)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* -------------------------------------------------------------------- root */

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<'welcome' | 'login'>('welcome');

  useEffect(() => {
    getMe()
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await logout().catch(() => undefined);
    setUser(null);
    setStage('welcome');
  }

  if (loading) {
    return (
      <main className="boot" role="status" aria-label="Cargando El Rancho">
        <div className="boot-inner">
          <span className="boot-logo" aria-hidden="true">
            <Egg size={34} />
          </span>
          <div className="boot-text">
            <p className="boot-name">El Rancho</p>
            <p className="boot-sub">Control avicola</p>
          </div>
          <div className="boot-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    if (stage === 'welcome') return <WelcomeScreen onStart={() => setStage('login')} />;
    return <LoginScreen onLogin={setUser} onBack={() => setStage('welcome')} />;
  }

  return <AppShell user={user} onLogout={handleLogout} />;
}
