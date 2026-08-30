'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, CalendarClock, CarFront, CheckCircle2, ChevronDown,
  Download, FileCheck2, FileText, Gauge, Menu, Pencil, Plus, Search,
  Settings, ShieldCheck, Trash2, Upload, X, LogIn, LogOut, Mail, Eye, EyeOff,
} from 'lucide-react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User } from 'firebase/auth';
import { auth, firebaseReady } from '@/lib/firebase';

type View = 'summary' | 'documents' | 'vehicles' | 'alerts';
type Profile = { name: string };
type Vehicle = { id: number; nickname: string; brand: string; model: string; year: string; plate: string };
type VehicleDocument = {
  id: number; name: string; type: string; vehicleId: number; expirationDate: string;
  fileName?: string | null; file?: Blob | null; notes?: string;
};

const profileKey = 'readycar-profile';
const vehiclesKey = 'readycar-vehicles';
const alertsKey = 'readycar-alert-days';
const notificationsKey = 'readycar-notifications';
const dateFormat = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
const todayFormat = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

function daysUntil(date: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${date}T12:00:00`).getTime() - today.getTime()) / 86400000);
}
function statusFor(date: string, alertDays: number[]) {
  const days = daysUntil(date);
  if (days < 0) return { label: `Vencido hace ${Math.abs(days)} días`, tone: 'red' };
  if (days === 0) return { label: 'Vence hoy', tone: 'red' };
  if (days <= Math.min(...alertDays)) return { label: `Vence en ${days} días`, tone: 'orange' };
  if (days <= Math.max(...alertDays)) return { label: `Vence en ${days} días`, tone: 'yellow' };
  return { label: 'Vigente', tone: 'green' };
}

const databaseName = 'readycar-data';
const storeName = 'documents';
function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function loadDocuments() {
  const database = await openDatabase();
  return new Promise<VehicleDocument[]>((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as VehicleDocument[]);
    request.onerror = () => reject(request.error);
  });
}
async function persistDocument(document: VehicleDocument) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(document);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
}
async function removeDocument(id: number) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  });
}
async function downloadDocument(document: VehicleDocument) {
  if (!document.file) return;
  const url = URL.createObjectURL(document.file);
  const anchor = window.document.createElement('a'); anchor.href = url;
  anchor.download = document.fileName || document.name; anchor.click(); URL.revokeObjectURL(url);
}

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [alertDays, setAlertDays] = useState([45, 15, 5]);
  const [view, setView] = useState<View>('summary');
  const [query, setQuery] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<number | 'all'>('all');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState<VehicleDocument | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    const savedProfile = localStorage.getItem(profileKey);
    const savedVehicles = localStorage.getItem(vehiclesKey);
    const savedAlerts = localStorage.getItem(alertsKey);
    if (savedProfile) setProfile(JSON.parse(savedProfile)); else setShowOnboarding(true);
    if (savedVehicles) setVehicles(JSON.parse(savedVehicles));
    if (savedAlerts) setAlertDays(JSON.parse(savedAlerts));
    loadDocuments().then(setDocuments).catch(() => setToast('No pudimos abrir tus documentos'));
    setNotificationsEnabled(localStorage.getItem(notificationsKey) === 'true' && Notification.permission === 'granted');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!auth) { setAuthLoading(false); setShowAuth(true); return; }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser); setAuthLoading(false); setShowAuth(!nextUser);
      if (nextUser?.displayName && !localStorage.getItem(profileKey)) {
        const nextProfile = { name: nextUser.displayName };
        setProfile(nextProfile); localStorage.setItem(profileKey, JSON.stringify(nextProfile));
      }
    });
  }, []);

  useEffect(() => {
    if (!notificationsEnabled || !documents.length || Notification.permission !== 'granted') return;
    const urgent = documents.filter((document) => daysUntil(document.expirationDate) <= Math.max(...alertDays));
    const stamp = new Date().toISOString().slice(0, 10);
    const sentKey = `readycar-notified-${stamp}`;
    if (urgent.length && !localStorage.getItem(sentKey)) {
      const overdueCount = urgent.filter((document) => daysUntil(document.expirationDate) < 0).length;
      new Notification('ReadyCar · Documentos por revisar', { body: overdueCount ? `${overdueCount} vencido(s) y ${urgent.length - overdueCount} próximo(s) a vencer.` : `${urgent.length} documento(s) próximo(s) a vencer.`, icon: '/favicon.svg', tag: 'readycar-daily' });
      localStorage.setItem(sentKey, 'true');
    }
  }, [documents, alertDays, notificationsEnabled]);

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3200); }
  function vehicleFor(id: number) { return vehicles.find((vehicle) => vehicle.id === id); }
  function saveVehicles(next: Vehicle[]) { setVehicles(next); localStorage.setItem(vehiclesKey, JSON.stringify(next)); }

  const filteredDocuments = useMemo(() => documents
    .filter((document) => {
      const vehicle = vehicles.find((item) => item.id === document.vehicleId);
      const text = `${document.name} ${document.type} ${vehicle?.plate || ''} ${vehicle?.brand || ''}`.toLowerCase();
      return text.includes(query.toLowerCase()) && (vehicleFilter === 'all' || document.vehicleId === vehicleFilter);
    }).sort((a, b) => a.expirationDate.localeCompare(b.expirationDate)), [documents, query, vehicleFilter, vehicles]);
  const expiring = documents.filter((document) => daysUntil(document.expirationDate) <= Math.max(...alertDays)).length;
  const overdue = documents.filter((document) => daysUntil(document.expirationDate) < 0).length;
  const current = documents.length - expiring;
  const initials = profile?.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'RC';

  function completeOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const nextProfile = { name: String(data.get('name')).trim() };
    const firstVehicle: Vehicle = { id: Date.now(), nickname: String(data.get('nickname') || 'Mi vehículo'), brand: String(data.get('brand')), model: String(data.get('model')), year: String(data.get('year')), plate: String(data.get('plate')).toUpperCase() };
    setProfile(nextProfile); localStorage.setItem(profileKey, JSON.stringify(nextProfile));
    saveVehicles([firstVehicle]); setShowOnboarding(false); notify('Tu cuenta local está lista');
  }
  function addVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const vehicle: Vehicle = { id: Date.now(), nickname: String(data.get('nickname') || 'Mi vehículo'), brand: String(data.get('brand')), model: String(data.get('model')), year: String(data.get('year')), plate: String(data.get('plate')).toUpperCase() };
    saveVehicles([...vehicles, vehicle]); setShowVehicleForm(false); notify('Vehículo agregado');
  }
  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const selectedFile = data.get('file') as File;
    const document: VehicleDocument = { id: editingDocument?.id || Date.now(), name: String(data.get('name')), type: String(data.get('type')), vehicleId: Number(data.get('vehicleId')), expirationDate: String(data.get('expirationDate')), notes: String(data.get('notes') || ''), fileName: selectedFile?.size ? selectedFile.name : editingDocument?.fileName || null, file: selectedFile?.size ? selectedFile : editingDocument?.file || null };
    await persistDocument(document);
    setDocuments((items) => editingDocument ? items.map((item) => item.id === document.id ? document : item) : [document, ...items]);
    setShowDocumentForm(false); setEditingDocument(null); notify(editingDocument ? 'Documento actualizado' : 'Documento guardado');
  }
  async function deleteDocument(document: VehicleDocument) {
    if (!window.confirm(`¿Eliminar “${document.name}”? Esta acción no se puede deshacer.`)) return;
    await removeDocument(document.id); setDocuments((items) => items.filter((item) => item.id !== document.id)); notify('Documento eliminado');
  }
  function updateAlerts(days: number) {
    const next = alertDays.includes(days) ? alertDays.filter((item) => item !== days) : [...alertDays, days].sort((a, b) => b - a);
    if (!next.length) return; setAlertDays(next); localStorage.setItem(alertsKey, JSON.stringify(next));
  }
  async function toggleNotifications() {
    if (!('Notification' in window)) { notify('Este navegador no admite notificaciones'); return; }
    if (notificationsEnabled) { setNotificationsEnabled(false); localStorage.setItem(notificationsKey, 'false'); notify('Notificaciones pausadas'); return; }
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted'; setNotificationsEnabled(enabled); localStorage.setItem(notificationsKey, String(enabled));
    if (enabled) { new Notification('ReadyCar está listo', { body: 'Te avisaremos cuando tus documentos requieran atención.', icon: '/favicon.svg' }); notify('Notificaciones activadas'); }
    else notify('Debes permitir las notificaciones en el navegador');
  }
  async function logout() { if (auth) await signOut(auth); setShowAuth(true); notify('Sesión cerrada'); }

  return <main className="min-h-screen bg-[#f4f3ef] text-[#17231d]">
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-[#dfe1dc] bg-[#f8f7f3]/95 px-5 backdrop-blur md:px-9">
      <div className="flex items-center gap-3"><button aria-label="Abrir menú" className="mr-1 rounded-xl p-2 hover:bg-black/5 lg:hidden" onClick={() => setMobileNav(true)}><Menu size={22} /></button><Brand /></div>
      <div className="flex items-center gap-2"><button onClick={() => setView('alerts')} className="relative grid size-10 place-items-center rounded-xl border border-[#d9ddd7] bg-white text-[#526159]" aria-label="Alertas"><Bell size={19} />{expiring > 0 && <span className="absolute right-1.5 top-1 grid min-w-4 place-items-center rounded-full bg-[#ec703b] px-1 text-[9px] font-bold text-white">{expiring}</span>}</button>{user ? <button onClick={() => setShowAuth(true)} className="ml-1 hidden items-center gap-3 rounded-xl border border-[#d9ddd7] bg-white px-3 py-2 sm:flex"><div className="grid size-8 place-items-center rounded-lg bg-[#e2eee8] text-xs font-bold text-[#174434]">{initials}</div><div className="text-left"><p className="max-w-32 truncate text-xs font-semibold">{profile?.name || user.displayName || 'Tu perfil'}</p><p className="max-w-32 truncate text-[10px] text-[#738078]">{user.email}</p></div><ChevronDown size={14} /></button> : <button onClick={() => setShowAuth(true)} className="flex h-10 items-center gap-2 rounded-xl bg-[#183f33] px-4 text-xs font-bold text-white"><LogIn size={16} />Ingresar</button>}</div>
    </header>

    <div className="mx-auto flex max-w-[1500px]">
      <aside className={`${mobileNav ? 'fixed inset-0 z-40 flex' : 'hidden'} w-64 shrink-0 flex-col border-r border-[#dfe1dc] bg-[#f4f3ef] p-5 lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-80px)]`}><button aria-label="Cerrar menú" className="absolute right-4 top-4 p-2 lg:hidden" onClick={() => setMobileNav(false)}><X /></button><nav className="mt-12 space-y-2 lg:mt-0"><NavButton active={view === 'summary'} icon={<Gauge size={18} />} label="Resumen" onClick={() => setView('summary')} /><NavButton active={view === 'documents'} icon={<FileText size={18} />} label="Documentos" count={documents.length} onClick={() => setView('documents')} /><NavButton active={view === 'vehicles'} icon={<CarFront size={18} />} label="Vehículos" count={vehicles.length} onClick={() => setView('vehicles')} /><NavButton active={view === 'alerts'} icon={<Bell size={18} />} label="Alertas" count={expiring} onClick={() => setView('alerts')} /></nav><div className="mt-auto rounded-2xl border border-[#dce2dc] bg-[#eaf0eb] p-4"><div className="mb-3 grid size-9 place-items-center rounded-xl bg-white text-[#275344]"><ShieldCheck size={19} /></div><p className="text-sm font-bold">Privacidad local</p><p className="mt-1 text-xs leading-5 text-[#68756e]">Tus datos y archivos permanecen en este navegador. ReadyCar no los envía a terceros.</p></div><button onClick={() => setShowOnboarding(true)} className="mt-4 flex items-center gap-3 px-4 py-3 text-sm text-[#66736b]"><Settings size={18} />Editar perfil</button></aside>

      <section className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-10"><div className="mx-auto max-w-6xl">
        {view === 'summary' && <Summary profile={profile} documents={documents} vehicles={vehicles} alertDays={alertDays} current={current} expiring={expiring} overdue={overdue} onAddDocument={() => vehicles.length ? setShowDocumentForm(true) : setShowVehicleForm(true)} onViewDocuments={() => setView('documents')} vehicleFor={vehicleFor} />}
        {view === 'documents' && <DocumentsView documents={filteredDocuments} vehicles={vehicles} query={query} vehicleFilter={vehicleFilter} alertDays={alertDays} setQuery={setQuery} setVehicleFilter={setVehicleFilter} onAdd={() => vehicles.length ? setShowDocumentForm(true) : setShowVehicleForm(true)} onEdit={(document) => { setEditingDocument(document); setShowDocumentForm(true); }} onDelete={deleteDocument} />}
        {view === 'vehicles' && <VehiclesView vehicles={vehicles} documents={documents} onAdd={() => setShowVehicleForm(true)} />}
        {view === 'alerts' && <AlertsView documents={documents} vehicles={vehicles} alertDays={alertDays} onToggle={updateAlerts} notificationsEnabled={notificationsEnabled} onToggleNotifications={toggleNotifications} />}
      </div></section>
    </div>

    {showOnboarding && <OnboardingForm profile={profile} firstVehicle={vehicles[0]} onClose={() => profile && setShowOnboarding(false)} onSubmit={completeOnboarding} />}
    {showVehicleForm && <VehicleForm onClose={() => setShowVehicleForm(false)} onSubmit={addVehicle} />}
    {showDocumentForm && <DocumentForm vehicles={vehicles} document={editingDocument} onClose={() => { setShowDocumentForm(false); setEditingDocument(null); }} onSubmit={saveDocument} />}
    {!authLoading && showAuth && <AuthModal user={user} onClose={() => user && setShowAuth(false)} onSignedIn={() => setShowAuth(false)} onLogout={logout} />}
    {toast && <div role="status" className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-[#183f33] px-4 py-3 text-sm font-semibold text-white shadow-xl"><CheckCircle2 size={18} />{toast}</div>}
  </main>;
}

function Brand() { return <><div className="grid size-10 place-items-center rounded-xl bg-[#183f33] text-white shadow-sm"><CarFront size={22} /></div><div><p className="text-lg font-bold leading-none tracking-[-.03em]">ReadyCar</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-[#718078]">Documentos al día</p></div></>; }
function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) { return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${active ? 'bg-[#183f33] text-white shadow-sm' : 'text-[#637068] hover:bg-white'}`}>{icon}{label}{count !== undefined && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/15' : 'bg-[#e1e3de]'}`}>{count}</span>}</button>; }

function Summary({ profile, documents, vehicles, alertDays, current, expiring, overdue, onAddDocument, onViewDocuments, vehicleFor }: { profile: Profile | null; documents: VehicleDocument[]; vehicles: Vehicle[]; alertDays: number[]; current: number; expiring: number; overdue: number; onAddDocument: () => void; onViewDocuments: () => void; vehicleFor: (id: number) => Vehicle | undefined }) {
  const urgent = [...documents].filter((document) => daysUntil(document.expirationDate) <= Math.max(...alertDays)).sort((a, b) => a.expirationDate.localeCompare(b.expirationDate)).slice(0, 4);
  return <><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-bold capitalize tracking-[.08em] text-[#6d7c73]">{todayFormat.format(new Date())}</p><h1 className="text-3xl font-bold tracking-[-.045em] sm:text-4xl">Hola{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}.</h1><p className="mt-2 text-sm text-[#69766f]">Aquí tienes el estado real de tus vehículos y documentos.</p></div><button onClick={onAddDocument} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ed6e3b] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(237,110,59,.22)] hover:-translate-y-0.5"><Plus size={18} />Agregar documento</button></div>
    <div className="mt-8 grid gap-4 md:grid-cols-3"><Stat icon={<FileCheck2 />} value={current} title="Documentos vigentes" description="Sin acciones pendientes" kind="green" /><Stat icon={<CalendarClock />} value={expiring} title="Requieren atención" description={`Vencen en ${Math.max(...alertDays)} días o menos`} kind="orange" /><Stat icon={<AlertTriangle />} value={overdue} title="Documentos vencidos" description="Actualízalos cuanto antes" kind="red" /></div>
    <div className="mt-7 grid gap-6 xl:grid-cols-[1.4fr_.8fr]"><div className="overflow-hidden rounded-2xl border border-[#dfe1dc] bg-white"><div className="flex items-center justify-between border-b border-[#e6e7e3] p-5"><div><h2 className="font-bold">Próximos vencimientos</h2><p className="mt-1 text-xs text-[#77827b]">Ordenados por urgencia</p></div><button onClick={onViewDocuments} className="text-xs font-bold text-[#285747]">Ver todos</button></div>{urgent.length ? <div className="divide-y divide-[#ecece8]">{urgent.map((document) => { const vehicle = vehicleFor(document.vehicleId); const status = statusFor(document.expirationDate, alertDays); return <div key={document.id} className="flex items-center gap-4 p-5"><div className="grid size-10 place-items-center rounded-xl bg-[#edf1ee] text-[#315b4c]"><FileText size={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{document.name}</p><p className="mt-1 text-xs text-[#7b857e]">{vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : 'Vehículo'}</p></div><div className="text-right"><p className="text-xs font-semibold">{dateFormat.format(new Date(`${document.expirationDate}T12:00:00`))}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold status-${status.tone}`}>{status.label}</span></div></div>; })}</div> : <Empty icon={<FileText />} title="Aún no tienes documentos" text="Agrega el primero para comenzar a recibir alertas." action="Agregar documento" onAction={onAddDocument} />}</div>
      <div className="rounded-2xl bg-[#183f33] p-6 text-white"><p className="text-xs font-bold uppercase tracking-[.14em] text-white/55">Tu garaje</p><p className="mt-3 text-4xl font-bold">{vehicles.length}</p><p className="mt-1 text-sm text-white/65">{vehicles.length === 1 ? 'vehículo registrado' : 'vehículos registrados'}</p><div className="mt-7 space-y-3">{vehicles.slice(0, 3).map((vehicle) => <div key={vehicle.id} className="flex items-center gap-3 rounded-xl bg-white/8 p-3"><CarFront size={18} /><div><p className="text-xs font-bold">{vehicle.nickname}</p><p className="text-[10px] text-white/55">{vehicle.brand} {vehicle.model} · {vehicle.plate}</p></div></div>)}</div></div></div></>;
}

function Stat({ icon, value, title, description, kind }: { icon: ReactNode; value: number; title: string; description: string; kind: 'green' | 'orange' | 'red' }) { const colors = { green: 'bg-[#e8f5ed] text-[#258254]', orange: 'bg-[#fff0e5] text-[#de6531]', red: 'bg-[#fdebe7] text-[#bd4632]' }[kind]; return <div className="rounded-2xl border border-[#dfe1dc] bg-white p-5"><div className="flex items-start justify-between"><div className={`grid size-10 place-items-center rounded-xl ${colors}`}>{icon}</div><span className="text-3xl font-bold">{value}</span></div><p className="mt-5 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-[#768179]">{description}</p></div>; }

function DocumentsView({ documents, vehicles, query, vehicleFilter, alertDays, setQuery, setVehicleFilter, onAdd, onEdit, onDelete }: { documents: VehicleDocument[]; vehicles: Vehicle[]; query: string; vehicleFilter: number | 'all'; alertDays: number[]; setQuery: (value: string) => void; setVehicleFilter: (value: number | 'all') => void; onAdd: () => void; onEdit: (document: VehicleDocument) => void; onDelete: (document: VehicleDocument) => void }) { return <><PageHeader eyebrow="Documentación" title="Mis documentos" text="Archivos, fechas y vigencia de cada vehículo." action="Agregar documento" onAction={onAdd} /><div className="mt-7 overflow-hidden rounded-2xl border border-[#dfe1dc] bg-white"><div className="flex flex-col gap-3 border-b border-[#e6e7e3] p-5 sm:flex-row"><label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe1dc] bg-[#fafaf8] px-3 focus-within:border-[#4d7668]"><Search size={16} className="text-[#879189]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar por documento, patente o marca" /></label><select value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="h-10 rounded-xl border border-[#dfe1dc] bg-white px-3 text-sm"><option value="all">Todos los vehículos</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.nickname}</option>)}</select></div>{documents.length ? <div className="divide-y divide-[#ecece8]">{documents.map((document) => <DocumentRow key={document.id} document={document} vehicle={vehicles.find((vehicle) => vehicle.id === document.vehicleId)} alertDays={alertDays} onEdit={() => onEdit(document)} onDelete={() => onDelete(document)} />)}</div> : <Empty icon={<Search />} title="No hay documentos para mostrar" text="Cambia los filtros o agrega un nuevo documento." action="Agregar documento" onAction={onAdd} />}</div></>; }
function DocumentRow({ document, vehicle, alertDays, onEdit, onDelete }: { document: VehicleDocument; vehicle?: Vehicle; alertDays: number[]; onEdit: () => void; onDelete: () => void }) { const status = statusFor(document.expirationDate, alertDays); return <article className="grid gap-4 p-5 hover:bg-[#fafaf7] md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center"><div className="flex min-w-0 items-center gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#edf1ee] text-[#315b4c]"><FileText size={20} /></div><div className="min-w-0"><p className="truncate text-sm font-bold">{document.name}</p><p className="mt-1 truncate text-xs text-[#7b857e]">{document.fileName || 'Sin archivo adjunto'} · {document.type}</p></div></div><div><p className="table-label">Vehículo</p><p className="mt-1 text-sm font-semibold">{vehicle?.plate || 'Sin vehículo'}</p><p className="text-xs text-[#7c8780]">{vehicle ? `${vehicle.brand} ${vehicle.model}` : ''}</p></div><div><p className="table-label">Vencimiento</p><p className="mt-1 text-sm font-semibold">{dateFormat.format(new Date(`${document.expirationDate}T12:00:00`))}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold status-${status.tone}`}>{status.label}</span></div><div className="flex gap-1"><button onClick={() => downloadDocument(document)} disabled={!document.file} className="row-action" title="Descargar"><Download size={16} /></button><button onClick={onEdit} className="row-action" title="Editar"><Pencil size={16} /></button><button onClick={onDelete} className="row-action text-[#a84938]" title="Eliminar"><Trash2 size={16} /></button></div></article>; }

function VehiclesView({ vehicles, documents, onAdd }: { vehicles: Vehicle[]; documents: VehicleDocument[]; onAdd: () => void }) { return <><PageHeader eyebrow="Garaje" title="Mis vehículos" text="Organiza la documentación de cada vehículo por separado." action="Agregar vehículo" onAction={onAdd} /><div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{vehicles.map((vehicle) => { const count = documents.filter((document) => document.vehicleId === vehicle.id).length; return <article key={vehicle.id} className="rounded-2xl border border-[#dfe1dc] bg-white p-6"><div className="flex items-start justify-between"><div className="grid size-12 place-items-center rounded-xl bg-[#183f33] text-white"><CarFront /></div><span className="rounded-lg bg-[#f0f1ed] px-2 py-1 text-[10px] font-bold text-[#657168]">{vehicle.year}</span></div><p className="mt-6 text-xs font-bold uppercase tracking-[.12em] text-[#7b867f]">{vehicle.nickname}</p><h2 className="mt-1 text-xl font-bold">{vehicle.brand} {vehicle.model}</h2><p className="mt-2 inline-flex rounded-lg bg-[#edf1ee] px-3 py-1 font-mono text-sm font-bold tracking-wider">{vehicle.plate}</p><div className="mt-6 flex items-center justify-between border-t border-[#ecece8] pt-4 text-xs text-[#6e7a73]"><span>{count} {count === 1 ? 'documento' : 'documentos'}</span><span>{documents.filter((document) => document.vehicleId === vehicle.id && daysUntil(document.expirationDate) <= 45).length} próximos</span></div></article>; })}{!vehicles.length && <div className="md:col-span-2 xl:col-span-3"><Empty icon={<CarFront />} title="Tu garaje está vacío" text="Registra un vehículo para comenzar." action="Agregar vehículo" onAction={onAdd} /></div>}</div></>; }

function AlertsView({ documents, vehicles, alertDays, onToggle, notificationsEnabled, onToggleNotifications }: { documents: VehicleDocument[]; vehicles: Vehicle[]; alertDays: number[]; onToggle: (days: number) => void; notificationsEnabled: boolean; onToggleNotifications: () => void }) { const alerts = documents.filter((document) => daysUntil(document.expirationDate) <= Math.max(...alertDays)).sort((a, b) => a.expirationDate.localeCompare(b.expirationDate)); return <><PageHeader eyebrow="Centro de alertas" title="Vencimientos" text="Configura cuándo ReadyCar debe llamar tu atención." /><div className="mt-7 grid gap-6 xl:grid-cols-[1.3fr_.7fr]"><div className="overflow-hidden rounded-2xl border border-[#dfe1dc] bg-white">{alerts.length ? <div className="divide-y divide-[#ecece8]">{alerts.map((document) => { const vehicle = vehicles.find((item) => item.id === document.vehicleId); const status = statusFor(document.expirationDate, alertDays); return <div key={document.id} className="flex items-center gap-4 p-5"><div className={`grid size-10 place-items-center rounded-xl ${daysUntil(document.expirationDate) < 0 ? 'bg-[#fdebe7] text-[#bd4632]' : 'bg-[#fff0e5] text-[#de6531]'}`}><AlertTriangle size={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{document.name}</p><p className="mt-1 text-xs text-[#7b857e]">{vehicle?.plate} · {dateFormat.format(new Date(`${document.expirationDate}T12:00:00`))}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold status-${status.tone}`}>{status.label}</span></div>; })}</div> : <Empty icon={<CheckCircle2 />} title="Todo está al día" text="No tienes vencimientos dentro del período configurado." />}</div><aside className="space-y-5"><div className="rounded-2xl border border-[#dfe1dc] bg-white p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold">Notificaciones del navegador</h2><p className="mt-1 text-xs leading-5 text-[#758079]">Recibe un aviso diario al abrir ReadyCar si hay documentos pendientes.</p></div><button role="switch" aria-checked={notificationsEnabled} onClick={onToggleNotifications} className={`relative h-7 w-12 shrink-0 rounded-full ${notificationsEnabled ? 'bg-[#183f33]' : 'bg-[#cfd5d0]'}`}><span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-transform ${notificationsEnabled ? 'translate-x-1' : '-translate-x-5'}`} /></button></div><div className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${notificationsEnabled ? 'bg-[#e7f4eb] text-[#267849]' : 'bg-[#f1f3f0] text-[#68756e]'}`}><Bell size={15} />{notificationsEnabled ? 'Notificaciones activas' : 'Notificaciones desactivadas'}</div></div><div className="rounded-2xl border border-[#dfe1dc] bg-white p-6"><h2 className="font-bold">Anticipación</h2><p className="mt-1 text-xs leading-5 text-[#758079]">Elige con cuánta anticipación quieres ver cada alerta.</p><div className="mt-5 space-y-3">{[60, 45, 30, 15, 5].map((days) => <label key={days} className="flex cursor-pointer items-center justify-between rounded-xl border border-[#e3e5e0] p-3 text-sm font-semibold"><span>{days} días antes</span><input checked={alertDays.includes(days)} onChange={() => onToggle(days)} type="checkbox" className="size-4 accent-[#183f33]" /></label>)}</div></div></aside></div></>; }

function PageHeader({ eyebrow, title, text, action, onAction }: { eyebrow: string; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.15em] text-[#6d7c73]">{eyebrow}</p><h1 className="text-3xl font-bold tracking-[-.04em]">{title}</h1><p className="mt-2 text-sm text-[#69766f]">{text}</p></div>{action && <button onClick={onAction} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ed6e3b] px-5 text-sm font-bold text-white"><Plus size={18} />{action}</button>}</div>; }
function Empty({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="grid place-items-center px-5 py-14 text-center"><div className="grid size-12 place-items-center rounded-xl bg-[#edf1ee] text-[#668076]">{icon}</div><p className="mt-4 text-sm font-bold">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-[#7c8780]">{text}</p>{action && <button onClick={onAction} className="mt-4 rounded-xl bg-[#183f33] px-4 py-2 text-xs font-bold text-white">{action}</button>}</div>; }

function Modal({ children, onClose, locked = false }: { children: ReactNode; onClose: () => void; locked?: boolean }) { return <div role="presentation" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10241c]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => !locked && event.target === event.currentTarget && onClose()}>{children}</div>; }
function AuthModal({ user, onClose, onSignedIn, onLogout }: { user: User | null; onClose: () => void; onSignedIn: () => void; onLogout: () => void }) {
  const [registering, setRegistering] = useState(false); const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!auth) return; setBusy(true); setError(''); const data = new FormData(event.currentTarget); const email = String(data.get('email')); const password = String(data.get('password')); try { if (registering) { const credential = await createUserWithEmailAndPassword(auth, email, password); const name = String(data.get('name')).trim(); if (name) await updateProfile(credential.user, { displayName: name }); } else await signInWithEmailAndPassword(auth, email, password); onSignedIn(); } catch { setError('No pudimos completar el acceso. Revisa tus datos e inténtalo nuevamente.'); } finally { setBusy(false); } }
  async function google() { if (!auth) return; setBusy(true); setError(''); try { await signInWithPopup(auth, new GoogleAuthProvider()); onSignedIn(); } catch { setError('No pudimos abrir el acceso con Google.'); } finally { setBusy(false); } }
  if (user) return <Modal onClose={onClose}><div className="w-full max-w-md rounded-3xl bg-[#fbfbf8] p-7 shadow-2xl"><div className="flex justify-between"><Brand /><button onClick={onClose} aria-label="Cerrar" className="rounded-xl p-2"><X size={20} /></button></div><div className="mt-8 flex items-center gap-4 rounded-2xl bg-[#edf2ee] p-4"><div className="grid size-12 place-items-center rounded-xl bg-[#183f33] font-bold text-white">{(user.displayName || user.email || 'RC').slice(0, 2).toUpperCase()}</div><div className="min-w-0"><p className="truncate font-bold">{user.displayName || 'Cuenta ReadyCar'}</p><p className="truncate text-xs text-[#6f7b74]">{user.email}</p></div></div><button onClick={onLogout} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9ddd7] py-3 text-sm font-bold text-[#9d4336]"><LogOut size={17} />Cerrar sesión</button></div></Modal>;
  return <Modal locked onClose={onClose}><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-[#fbfbf8] p-7 shadow-2xl"><Brand /><div className="mt-8"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#758178]">Tu garaje digital</p><h2 className="mt-2 text-3xl font-bold tracking-[-.04em]">{registering ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}</h2><p className="mt-2 text-sm leading-6 text-[#68756e]">Accede para mantener tus documentos y alertas bajo control.</p></div>{!firebaseReady && <div className="mt-5 rounded-xl border border-[#efd4c6] bg-[#fff3eb] p-3 text-xs leading-5 text-[#9a4b2e]">El acceso está listo, pero falta configurar las variables públicas de Firebase.</div>}{error && <div role="alert" className="mt-5 rounded-xl bg-[#fdebe7] p-3 text-xs text-[#a54431]">{error}</div>}<div className="mt-6 space-y-4">{registering && <label className="field">Nombre completo<input name="name" required placeholder="Catalina Rojas" autoComplete="name" /></label>}<label className="field">Correo electrónico<div className="relative"><Mail className="absolute left-3 top-3 text-[#869088]" size={17} /><input className="pl-10!" name="email" type="email" required placeholder="tu@correo.cl" autoComplete="email" /></div></label><label className="field">Contraseña<div className="relative"><input className="pr-11!" name="password" type={showPassword ? 'text' : 'password'} minLength={6} required placeholder="Mínimo 6 caracteres" autoComplete={registering ? 'new-password' : 'current-password'} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-[#78847c]" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label></div><button disabled={busy || !firebaseReady} className="mt-6 w-full rounded-xl bg-[#183f33] py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Procesando…' : registering ? 'Crear cuenta' : 'Iniciar sesión'}</button><div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#929a94]"><span className="h-px flex-1 bg-[#dfe2dd]" />o continúa con<span className="h-px flex-1 bg-[#dfe2dd]" /></div><button type="button" disabled={busy || !firebaseReady} onClick={google} className="w-full rounded-xl border border-[#d8ddd8] bg-white py-3 text-sm font-bold disabled:opacity-50">Google</button><p className="mt-6 text-center text-xs text-[#68756e]">{registering ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'} <button type="button" onClick={() => { setRegistering(!registering); setError(''); }} className="font-bold text-[#1d5b47]">{registering ? 'Inicia sesión' : 'Créala aquí'}</button></p></form></Modal>;
}
function OnboardingForm({ profile, firstVehicle, onClose, onSubmit }: { profile: Profile | null; firstVehicle?: Vehicle; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <Modal locked={!profile} onClose={onClose}><form onSubmit={onSubmit} className="w-full max-w-xl rounded-3xl bg-[#fbfbf8] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><Brand /><h2 className="mt-7 text-2xl font-bold tracking-tight">{profile ? 'Editar datos principales' : 'Configura tu ReadyCar'}</h2><p className="mt-2 text-sm leading-6 text-[#68756e]">No necesitas una cuenta. Esta información solo se guarda en este navegador.</p></div>{profile && <button type="button" onClick={onClose} className="rounded-xl p-2"><X /></button>}</div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="field sm:col-span-2">Tu nombre<input name="name" required defaultValue={profile?.name} placeholder="Ej. Catalina Rojas" /></label><label className="field">Nombre del vehículo<input name="nickname" required defaultValue={firstVehicle?.nickname || 'Mi vehículo'} /></label><label className="field">Patente<input name="plate" required defaultValue={firstVehicle?.plate} placeholder="ABCD-12" /></label><label className="field">Marca<input name="brand" required defaultValue={firstVehicle?.brand} placeholder="Ej. Toyota" /></label><label className="field">Modelo<input name="model" required defaultValue={firstVehicle?.model} placeholder="Ej. Corolla Cross" /></label><label className="field sm:col-span-2">Año<input name="year" required type="number" min="1950" max="2030" defaultValue={firstVehicle?.year || new Date().getFullYear()} /></label></div><button className="mt-7 w-full rounded-xl bg-[#183f33] px-5 py-3 text-sm font-bold text-white">Guardar y continuar</button></form></Modal>; }
function VehicleForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <Modal onClose={onClose}><form onSubmit={onSubmit} className="w-full max-w-lg rounded-3xl bg-[#fbfbf8] p-6 shadow-2xl sm:p-8"><FormTitle eyebrow="Nuevo registro" title="Agregar vehículo" onClose={onClose} /><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="field">Nombre<input name="nickname" required placeholder="Ej. Auto familiar" /></label><label className="field">Patente<input name="plate" required placeholder="ABCD-12" /></label><label className="field">Marca<input name="brand" required placeholder="Ej. Hyundai" /></label><label className="field">Modelo<input name="model" required placeholder="Ej. Tucson" /></label><label className="field sm:col-span-2">Año<input name="year" type="number" min="1950" max="2030" required defaultValue={new Date().getFullYear()} /></label></div><FormActions onClose={onClose} label="Guardar vehículo" /></form></Modal>; }
function DocumentForm({ vehicles, document, onClose, onSubmit }: { vehicles: Vehicle[]; document: VehicleDocument | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <Modal onClose={onClose}><form onSubmit={onSubmit} className="w-full max-w-lg rounded-3xl bg-[#fbfbf8] p-6 shadow-2xl sm:p-8"><FormTitle eyebrow={document ? 'Editar registro' : 'Nuevo registro'} title={document ? 'Editar documento' : 'Agregar documento'} onClose={onClose} /><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="field sm:col-span-2">Nombre<input name="name" required defaultValue={document?.name} placeholder="Ej. Permiso de circulación" /></label><label className="field">Tipo<select name="type" defaultValue={document?.type || 'Permiso de circulación'}><option>Permiso de circulación</option><option>Revisión técnica</option><option>SOAP</option><option>Seguro automotriz</option><option>Padrón</option><option>Mantención</option><option>Otro</option></select></label><label className="field">Vencimiento<input name="expirationDate" type="date" required defaultValue={document?.expirationDate} /></label><label className="field sm:col-span-2">Vehículo<select name="vehicleId" defaultValue={document?.vehicleId || vehicles[0]?.id}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.nickname} ({vehicle.brand} {vehicle.model})</option>)}</select></label><label className="field sm:col-span-2">Notas <em>(opcional)</em><textarea name="notes" defaultValue={document?.notes} rows={3} placeholder="Número de póliza, observaciones…" /></label><label className="field sm:col-span-2"><span>Archivo <em>(PDF o imagen, hasta 10 MB)</em></span><span className="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#bcc5bf] bg-white text-sm font-semibold text-[#557066]"><Upload size={18} />{document?.fileName || 'Seleccionar archivo'}</span><input className="sr-only" name="file" type="file" accept="application/pdf,image/*" /></label></div><FormActions onClose={onClose} label={document ? 'Guardar cambios' : 'Guardar documento'} /></form></Modal>; }
function FormTitle({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) { return <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#78847c]">{eyebrow}</p><h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2></div><button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-xl p-2 hover:bg-black/5"><X size={20} /></button></div>; }
function FormActions({ onClose, label }: { onClose: () => void; label: string }) { return <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl px-5 py-3 text-sm font-semibold hover:bg-black/5">Cancelar</button><button className="rounded-xl bg-[#183f33] px-5 py-3 text-sm font-bold text-white">{label}</button></div>; }
