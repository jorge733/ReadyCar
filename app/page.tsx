'use client';

import {
  SubmitEvent,
  useRef,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import {
  AlertTriangle,
  Bell,
  Bike,
  CalendarClock,
  CarFront,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  FileText,
  Gauge,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  LogIn,
  LogOut,
  Mail,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  type User,
} from 'firebase/auth';
import { auth, firebaseReady } from '@/lib/firebase';
import {
  deleteCloudDocument,
  downloadCloudDocument,
  getCloudDocumentBlob,
  saveCloudDocument,
  watchDocuments,
  type CloudDocument,
} from '@/lib/readycar-cloud';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AccountTools } from '@/components/account-tools';
import { daysUntil, formatExpiry } from '@/lib/expiry';
import { watchAccount, changeAccount, type Vehicle } from '@/lib/account-cloud';

type View = 'summary' | 'documents' | 'vehicles' | 'alerts';
type Profile = { name: string };
function fieldText(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
type VehicleDocument = CloudDocument;

const notificationsKey = 'readycar-notifications';
const todayFormat = new Intl.DateTimeFormat('es-CL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function statusFor(date: string, alertDays: number[]) {
  if (!date) return { label: 'Sin vencimiento', tone: 'green' };
  const days = daysUntil(date);
  if (days < 0)
    return { label: `Vencido hace ${Math.abs(days)} días`, tone: 'red' };
  if (days === 0) return { label: 'Vence hoy', tone: 'red' };
  if (days <= Math.min(...alertDays))
    return { label: `Vence en ${days} días`, tone: 'orange' };
  if (days <= Math.max(...alertDays))
    return { label: `Vence en ${days} días`, tone: 'yellow' };
  return { label: 'Vigente', tone: 'green' };
}

function vapidKey(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export default function Home() {
  const [accountReady, setAccountReady] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [allDocuments, setDocuments] = useState<VehicleDocument[]>([]);
  const documents = allDocuments.filter((item) => !item.archived);
  const [alertDays, setAlertDays] = useState([45, 15, 5]);
  const [view, setView] = useState<View>('summary');
  const [query, setQuery] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<number | 'all'>('all');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [editingDocument, setEditingDocument] =
    useState<VehicleDocument | null>(null);
  const [previewDocument, setPreviewDocument] =
    useState<VehicleDocument | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    setNotificationsEnabled(false);
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  useEffect(() => {
    setAccountReady(false);
    setProfile(null);
    setVehicles([]);
    setDocuments([]);
    setShowOnboarding(false);
    if (!user) return;
    const uid = user.uid;
    setNotificationsEnabled(
      localStorage.getItem(notificationsKey + uid) === 'true' &&
        'Notification' in window &&
        Notification.permission === 'granted',
    );
    return watchAccount(
      uid,
      (account) => {
        setProfile(account?.profile || null);
        setVehicles(account?.vehicles || []);
        setAlertDays(
          account?.alertDays?.length ? account.alertDays : [45, 15, 5],
        );
        setAccountReady(true);
        setShowOnboarding(!account);
      },
      () =>
        notify('No pudimos cargar tu garaje. Recarga para volver a intentar.'),
    );
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      return;
    }
    return watchDocuments(user.uid, setDocuments, () =>
      notify('No pudimos sincronizar tus documentos'),
    );
  }, [user]);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      setShowAuth(true);
      return;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      setShowAuth(!nextUser);
    });
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }
  function vehicleFor(id: number) {
    return vehicles.find((vehicle) => vehicle.id === id);
  }

  const filteredDocuments = useMemo(
    () =>
      allDocuments
        .filter((document) => {
          const vehicle = vehicles.find(
            (item) => item.id === document.vehicleId,
          );
          const text =
            `${document.name} ${document.type} ${vehicle?.plate || ''} ${vehicle?.brand || ''}`.toLowerCase();
          return (
            (statusFilter === 'history'
              ? Boolean(document.archived)
              : !document.archived) &&
            (statusFilter === 'history' ||
              statusFilter === 'all' ||
              (statusFilter === 'overdue'
                ? daysUntil(document.expirationDate) < 0
                : statusFilter === 'soon'
                  ? daysUntil(document.expirationDate) >= 0 &&
                    daysUntil(document.expirationDate) <= Math.max(...alertDays)
                  : daysUntil(document.expirationDate) >= 0)) &&
            text.includes(query.toLowerCase()) &&
            (vehicleFilter === 'all' || document.vehicleId === vehicleFilter)
          );
        })
        .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate)),
    [allDocuments, query, vehicleFilter, vehicles, statusFilter, alertDays],
  );
  const expiring = documents.filter(
    (document) =>
      !vehicles.some(
        (vehicle) => vehicle.id === document.vehicleId && vehicle.archived,
      ) && daysUntil(document.expirationDate) <= Math.max(...alertDays),
  ).length;
  const overdue = documents.filter(
    (document) => daysUntil(document.expirationDate) < 0,
  ).length;
  const current = documents.length - overdue;
  const initials =
    profile?.name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'RC';

  async function completeOnboarding(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextProfile = { name: fieldText(data, 'name').trim() };
    const firstVehicle: Vehicle = {
      id: editingVehicle?.id || Date.now(),
      nickname: fieldText(data, 'nickname') || 'Mi vehículo',
      brand: fieldText(data, 'brand'),
      model: fieldText(data, 'model'),
      year: fieldText(data, 'year'),
      plate: fieldText(data, 'plate').toUpperCase(),
      vehicleType:
        data.get('vehicleType') === 'motorcycle' ? 'motorcycle' : 'car',
    };
    if (!user || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await changeAccount(user.uid, (account) => ({
        ...account,
        profile: nextProfile,
        vehicles: account.profile.name ? account.vehicles : [firstVehicle],
      }));
      setShowOnboarding(false);
      notify('Perfil guardado en tu cuenta');
    } catch {
      notify('No pudimos guardar el perfil. Inténtalo nuevamente.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function addVehicle(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const vehicle: Vehicle = {
      id: editingVehicle?.id || Date.now(),
      nickname: fieldText(data, 'nickname') || 'Mi vehículo',
      brand: fieldText(data, 'brand'),
      model: fieldText(data, 'model'),
      year: fieldText(data, 'year'),
      plate: fieldText(data, 'plate').toUpperCase(),
      vehicleType:
        data.get('vehicleType') === 'motorcycle' ? 'motorcycle' : 'car',
    };
    if (!user || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await changeAccount(user.uid, (account) => {
        if (
          account.vehicles.some(
            (item) =>
              item.id !== vehicle.id &&
              item.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase() ===
                vehicle.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
          )
        )
          throw new Error('Ya registraste esta patente');
        return {
          ...account,
          vehicles: editingVehicle
            ? account.vehicles.map((item) =>
                item.id === vehicle.id
                  ? { ...vehicle, archived: item.archived || false }
                  : item,
              )
            : [...account.vehicles, vehicle],
        };
      });
      setShowVehicleForm(false);
      setEditingVehicle(null);
      notify('Vehículo guardado');
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'No pudimos guardar el vehículo',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function saveDocument(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!user) {
      setShowAuth(true);
      return;
    }
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectedFile = data.get('file') as File;
    const document: VehicleDocument = {
      id: editingDocument?.id || Date.now(),
      name: fieldText(data, 'name'),
      type: fieldText(data, 'type'),
      vehicleId: Number(data.get('vehicleId')),
      expirationDate: fieldText(data, 'expirationDate'),
      notes: fieldText(data, 'notes') || '',
      fileName: editingDocument?.fileName || null,
      fileSize: editingDocument?.fileSize || null,
      fileType: editingDocument?.fileType || null,
      fileVersion: editingDocument?.fileVersion || null,
      chunkCount: editingDocument?.chunkCount || 0,
      ...(editingDocument?.previousId
        ? { previousId: editingDocument.previousId }
        : {}),
      archived: editingDocument?.archived || false,
    };
    savingRef.current = true;
    setSaving(true);
    try {
      await saveCloudDocument(user, document, selectedFile);
      setShowDocumentForm(false);
      setEditingDocument(null);
      notify(
        editingDocument
          ? 'Documento actualizado y sincronizado'
          : 'Documento subido y guardado',
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'No pudimos subir el documento',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function deleteDocument(document: VehicleDocument) {
    if (
      !window.confirm(
        `¿Eliminar “${document.name}”? Esta acción no se puede deshacer.`,
      )
    )
      return;
    if (!user) return;
    try {
      await deleteCloudDocument(user.uid, document);
      notify('Documento eliminado');
    } catch {
      notify('No pudimos eliminar el documento. Inténtalo de nuevo.');
    }
  }
  async function updateAlerts(days: number) {
    const next = alertDays.includes(days)
      ? alertDays.filter((item) => item !== days)
      : [...alertDays, days].sort((a, b) => b - a);
    if (!next.length) return;
    if (!user) return;
    try {
      await changeAccount(user.uid, (account) => ({
        ...account,
        alertDays: next,
      }));
    } catch {
      notify('No pudimos guardar tus preferencias');
    }
  }
  async function toggleNotifications() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        notify(
          'Este navegador no admite avisos. Puedes consultar tus alertas aquí.',
        );
        return;
      }
      if (!('Notification' in window)) {
        notify('Este navegador no admite notificaciones');
        return;
      }
      if (!user) {
        setShowAuth(true);
        notify('Inicia sesión para activar notificaciones');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const currentSubscription =
        await registration.pushManager.getSubscription();
      if (notificationsEnabled) {
        if (currentSubscription) {
          const removal = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${await user.getIdToken()}`,
            },
            body: JSON.stringify({
              subscription: currentSubscription.toJSON(),
              enabled: false,
            }),
          });
          if (!removal.ok) throw new Error('No se pudo pausar');
          await currentSubscription.unsubscribe();
        }
        setNotificationsEnabled(false);
        localStorage.setItem(notificationsKey + user.uid, 'false');
        notify('Notificaciones pausadas');
        return;
      }
      const permission = await Notification.requestPermission();
      const publicKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      const subscription =
        permission === 'granted' && publicKey
          ? await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: vapidKey(publicKey),
            })
          : null;
      const response = subscription
        ? await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${await user.getIdToken()}`,
            },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          })
        : null;
      const enabled = Boolean(subscription && response?.ok);
      setNotificationsEnabled(enabled);
      localStorage.setItem(notificationsKey, String(enabled));
      if (enabled) {
        await registration.showNotification('ReadyCar está listo', {
          body: 'Te avisaremos aunque la aplicación esté cerrada.',
          icon: '/favicon.svg',
        });
        notify('Notificaciones automáticas activadas');
      } else
        notify(
          'No se pudieron activar los avisos. Revisa los permisos o inténtalo más tarde.',
        );
    } catch {
      notify('No pudimos cambiar las notificaciones. Inténtalo nuevamente.');
    }
  }
  async function logout() {
    setVehicles([]);
    setProfile(null);
    setDocuments([]);
    setNotificationsEnabled(false);
    if (auth) await signOut(auth);
    setShowAuth(true);
    notify('Sesión cerrada');
  }

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-[#17231d]">
      {saving && (
        <div
          role="status"
          className="fixed bottom-5 left-5 z-[60] rounded-xl bg-[#183f33] p-4 text-sm text-white"
        >
          Guardando…
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-[#dfe1dc] bg-[#f8f7f3]/95 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-3">
          <button
            aria-label="Abrir menú"
            className="mr-1 rounded-xl p-2 hover:bg-black/5 lg:hidden"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={22} />
          </button>
          <Brand />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMobileNav(false);
              setView('alerts');
            }}
            className="relative grid size-10 place-items-center rounded-xl border border-[#d9ddd7] bg-white text-[#526159]"
            aria-label="Alertas"
          >
            <Bell size={19} />
            {expiring > 0 && (
              <span className="absolute right-1.5 top-1 grid min-w-4 place-items-center rounded-full bg-[#ec703b] px-1 text-[9px] font-bold text-white">
                {expiring}
              </span>
            )}
          </button>
          {user ? (
            <button
              onClick={() => setShowAuth(true)}
              className="ml-1 hidden items-center gap-3 rounded-xl border border-[#d9ddd7] bg-white px-3 py-2 sm:flex"
            >
              <div className="grid size-8 place-items-center rounded-lg bg-[#e2eee8] text-xs font-bold text-[#174434]">
                {initials}
              </div>
              <div className="text-left">
                <p className="max-w-32 truncate text-xs font-semibold">
                  {profile?.name || user.displayName || 'Tu perfil'}
                </p>
                <p className="max-w-32 truncate text-[10px] text-[#738078]">
                  {user.email}
                </p>
              </div>
              <ChevronDown size={14} />
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="flex h-10 items-center gap-2 rounded-xl bg-[#183f33] px-4 text-xs font-bold text-white"
            >
              <LogIn size={16} />
              Ingresar
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px]">
        <aside
          className={`${mobileNav ? 'fixed inset-0 z-40 flex' : 'hidden'} w-64 shrink-0 flex-col border-r border-[#dfe1dc] bg-[#f4f3ef] p-5 lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-80px)]`}
        >
          <button
            aria-label="Cerrar menú"
            className="absolute right-4 top-4 p-2 lg:hidden"
            onClick={() => setMobileNav(false)}
          >
            <X />
          </button>
          <nav className="mt-12 space-y-2 lg:mt-0">
            <NavButton
              active={view === 'summary'}
              icon={<Gauge size={18} />}
              label="Resumen"
              onClick={() => {
                setMobileNav(false);
                setView('summary');
              }}
            />
            <NavButton
              active={view === 'documents'}
              icon={<FileText size={18} />}
              label="Documentos"
              count={documents.length}
              onClick={() => {
                setMobileNav(false);
                setView('documents');
              }}
            />
            <NavButton
              active={view === 'vehicles'}
              icon={<CarFront size={18} />}
              label="Vehículos"
              count={vehicles.length}
              onClick={() => {
                setMobileNav(false);
                setView('vehicles');
              }}
            />
            <NavButton
              active={view === 'alerts'}
              icon={<Bell size={18} />}
              label="Alertas"
              count={expiring}
              onClick={() => {
                setMobileNav(false);
                setView('alerts');
              }}
            />
          </nav>
          <div className="mt-auto rounded-2xl border border-[#dce2dc] bg-[#eaf0eb] p-4">
            <div className="mb-3 grid size-9 place-items-center rounded-xl bg-white text-[#275344]">
              <ShieldCheck size={19} />
            </div>
            <p className="text-sm font-bold">Documentos privados</p>
            <p className="mt-1 text-xs leading-5 text-[#68756e]">
              Tus archivos se sincronizan con tu cuenta y solo tú puedes
              abrirlos.
            </p>
          </div>
          <button
            onClick={() => setShowOnboarding(true)}
            className="mt-4 flex items-center gap-3 px-4 py-3 text-sm text-[#66736b]"
          >
            <Settings size={18} />
            Editar perfil
          </button>
        </aside>

        <section className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-10">
          <div className="mx-auto max-w-6xl">
            {user && !accountReady && <p role="status">Cargando tu garaje…</p>}
            {view === 'summary' && (
              <Summary
                profile={profile}
                documents={documents}
                vehicles={vehicles}
                alertDays={alertDays}
                current={current}
                expiring={expiring}
                overdue={overdue}
                onAddDocument={() =>
                  vehicles.length
                    ? setShowDocumentForm(true)
                    : setShowVehicleForm(true)
                }
                onViewDocuments={() => setView('documents')}
                vehicleFor={vehicleFor}
              />
            )}
            {view === 'documents' && (
              <div className="mb-4 flex flex-wrap gap-3">
                <select
                  aria-label="Filtrar por estado"
                  className="rounded-xl border p-3"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">Todos los estados</option>
                  <option value="current">Vigentes</option>
                  <option value="soon">Próximos a vencer</option>
                  <option value="overdue">Vencidos</option>
                  <option value="history">Historial de renovaciones</option>
                </select>
                <button
                  className="rounded-xl border px-4"
                  onClick={async () => {
                    if (!user || savingRef.current) return;
                    savingRef.current = true;
                    setSaving(true);
                    try {
                      const files = [];
                      for (const item of allDocuments) {
                        const blob = await getCloudDocumentBlob(user.uid, item);
                        const bytes = blob
                          ? new Uint8Array(await blob.arrayBuffer())
                          : null;
                        let binary = '';
                        if (bytes)
                          for (const byte of bytes)
                            binary += String.fromCharCode(byte);
                        files.push({
                          ...item,
                          fileBase64: bytes ? btoa(binary) : null,
                        });
                      }
                      const url = URL.createObjectURL(
                        new Blob(
                          [
                            JSON.stringify({
                              version: 1,
                              exportedAt: new Date().toISOString(),
                              profile,
                              vehicles,
                              alertDays,
                              documents: files,
                            }),
                          ],
                          { type: 'application/json' },
                        ),
                      );
                      const link = window.document.createElement('a');
                      link.href = url;
                      link.download = 'readycar-respaldo.json';
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                      notify('Respaldo descargado');
                    } catch {
                      notify('No pudimos completar el respaldo');
                    } finally {
                      savingRef.current = false;
                      setSaving(false);
                    }
                  }}
                >
                  Descargar respaldo con archivos
                </button>
                <button
                  className="rounded-xl border px-4 py-3"
                  onClick={() => {
                    const escape = (value: string) =>
                      value
                        .replace(/\\/g, '\\\\')
                        .replace(/\n/g, '\\n')
                        .replace(/,/g, '\\,')
                        .replace(/;/g, '\\;');
                    const lines = [
                      'BEGIN:VCALENDAR',
                      'VERSION:2.0',
                      'PRODID:-//ReadyCar//Vencimientos//ES',
                      ...documents
                        .filter((item) => item.expirationDate)
                        .flatMap((item) => [
                          'BEGIN:VEVENT',
                          'UID:' + item.id + '@readycar',
                          'DTSTAMP:' +
                            new Date()
                              .toISOString()
                              .replace(/[-:]/g, '')
                              .replace(/\.\d{3}/, ''),
                          'DTSTART;VALUE=DATE:' +
                            item.expirationDate.replace(/-/g, ''),
                          'SUMMARY:' + escape(item.name),
                          'DESCRIPTION:' + escape(item.notes || ''),
                          'END:VEVENT',
                        ]),
                      'END:VCALENDAR',
                    ];
                    const url = URL.createObjectURL(
                      new Blob([lines.join('\r\n')], { type: 'text/calendar' }),
                    );
                    const a = window.document.createElement('a');
                    a.href = url;
                    a.download = 'readycar-vencimientos.ics';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Exportar calendario
                </button>
              </div>
            )}
            {view === 'documents' && (
              <DocumentsView
                documents={filteredDocuments}
                vehicles={vehicles}
                query={query}
                vehicleFilter={vehicleFilter}
                alertDays={alertDays}
                setQuery={setQuery}
                setVehicleFilter={setVehicleFilter}
                onAdd={() =>
                  vehicles.length
                    ? setShowDocumentForm(true)
                    : setShowVehicleForm(true)
                }
                onEdit={(document) => {
                  setEditingDocument(document);
                  setShowDocumentForm(true);
                }}
                onDownload={(document) =>
                  user && downloadCloudDocument(user.uid, document)
                }
                onRenew={(document) => {
                  setEditingDocument({
                    ...document,
                    id: Date.now(),
                    previousId: document.id,
                    expirationDate: '',
                    fileName: null,
                    fileSize: null,
                    fileType: null,
                    fileVersion: null,
                    chunkCount: 0,
                    archived: false,
                  });
                  setShowDocumentForm(true);
                }}
                onPreview={setPreviewDocument}
                onDelete={deleteDocument}
              />
            )}
            {view === 'vehicles' && (
              <VehiclesView
                vehicles={vehicles}
                documents={documents}
                alertDays={alertDays}
                onAdd={() => {
                  setEditingVehicle(null);
                  setShowVehicleForm(true);
                }}
                onEdit={(vehicle) => {
                  setEditingVehicle(vehicle);
                  setShowVehicleForm(true);
                }}
                onArchive={async (vehicle) => {
                  try {
                    await changeAccount(user!.uid, (account) => ({
                      ...account,
                      vehicles: account.vehicles.map((item) =>
                        item.id === vehicle.id
                          ? { ...item, archived: !item.archived }
                          : item,
                      ),
                    }));
                  } catch {
                    notify('No pudimos actualizar el vehículo');
                  }
                }}
                onDelete={async (vehicle) => {
                  if (
                    allDocuments.some((item) => item.vehicleId === vehicle.id)
                  ) {
                    notify('Archiva el vehículo para conservar sus documentos');
                    return;
                  }
                  if (confirm('¿Eliminar este vehículo sin documentos?'))
                    try {
                      await changeAccount(user!.uid, (account) => ({
                        ...account,
                        vehicles: account.vehicles.filter(
                          (item) => item.id !== vehicle.id,
                        ),
                      }));
                    } catch {
                      notify('No pudimos eliminar el vehículo');
                    }
                }}
              />
            )}
            {view === 'alerts' && (
              <AlertsView
                documents={documents}
                vehicles={vehicles}
                alertDays={alertDays}
                onToggle={updateAlerts}
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={toggleNotifications}
              />
            )}
            {user && accountReady && view === 'summary' && (
              <AccountTools user={user} notify={notify} />
            )}
          </div>
        </section>
      </div>

      {showOnboarding && (
        <OnboardingForm
          profile={profile}
          firstVehicle={vehicles[0]}
          onClose={() => profile && setShowOnboarding(false)}
          onRecover={async () => {
            if (!user) return;
            try {
              const legacy = JSON.parse(
                localStorage.getItem('readycar-vehicles') || '[]',
              );
              if (
                !Array.isArray(legacy) ||
                !legacy.length ||
                legacy.some(
                  (item) =>
                    !Number.isSafeInteger(item.id) ||
                    typeof item.plate !== 'string',
                )
              ) {
                notify('No encontramos un garaje anterior válido');
                return;
              }
              if (
                !confirm(
                  '¿El garaje guardado anteriormente en este navegador es tuyo? Se asociará a la cuenta actual.',
                )
              )
                return;
              await changeAccount(user.uid, (account) => ({
                ...account,
                profile: { name: user.displayName || 'Mi cuenta' },
                vehicles: [
                  ...account.vehicles,
                  ...legacy.filter(
                    (item) =>
                      !account.vehicles.some(
                        (current) => current.id === item.id,
                      ),
                  ),
                ],
              }));
              setShowOnboarding(false);
              notify('Garaje anterior recuperado');
            } catch {
              notify('No pudimos recuperar el garaje anterior');
            }
          }}
          onSubmit={completeOnboarding}
        />
      )}
      {showVehicleForm && (
        <VehicleForm
          vehicle={editingVehicle}
          onClose={() => {
            setShowVehicleForm(false);
            setEditingVehicle(null);
          }}
          onSubmit={addVehicle}
        />
      )}
      {showDocumentForm && (
        <DocumentForm
          vehicles={vehicles}
          document={editingDocument}
          onClose={() => {
            setShowDocumentForm(false);
            setEditingDocument(null);
          }}
          onSubmit={saveDocument}
        />
      )}
      {previewDocument && user && (
        <DocumentPreview
          userId={user.uid}
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
          onDownload={() => downloadCloudDocument(user.uid, previewDocument)}
        />
      )}
      {!authLoading && showAuth && (
        <AuthModal
          user={user}
          onClose={() => user && setShowAuth(false)}
          onSignedIn={() => setShowAuth(false)}
          onLogout={logout}
        />
      )}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-[#183f33] px-4 py-3 text-sm font-semibold text-white shadow-xl"
        >
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}

function Brand() {
  return (
    <>
      <div className="grid size-10 place-items-center rounded-xl bg-[#183f33] text-white shadow-sm">
        <CarFront size={22} />
      </div>
      <div>
        <p className="text-lg font-bold leading-none tracking-[-.03em]">
          ReadyCar
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-[#718078]">
          Documentos al día
        </p>
      </div>
    </>
  );
}
function NavButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${active ? 'bg-[#183f33] text-white shadow-sm' : 'text-[#637068] hover:bg-white'}`}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/15' : 'bg-[#e1e3de]'}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Summary({
  profile,
  documents,
  vehicles,
  alertDays,
  current,
  expiring,
  overdue,
  onAddDocument,
  onViewDocuments,
  vehicleFor,
}: {
  profile: Profile | null;
  documents: VehicleDocument[];
  vehicles: Vehicle[];
  alertDays: number[];
  current: number;
  expiring: number;
  overdue: number;
  onAddDocument: () => void;
  onViewDocuments: () => void;
  vehicleFor: (id: number) => Vehicle | undefined;
}) {
  const urgent = documents
    .filter(
      (document) =>
        !vehicles.some(
          (vehicle) => vehicle.id === document.vehicleId && vehicle.archived,
        ),
    )
    .filter(
      (document) =>
        daysUntil(document.expirationDate) <= Math.max(...alertDays),
    )
    .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))
    .slice(0, 4);
  return (
    <>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold capitalize tracking-[.08em] text-[#6d7c73]">
            {todayFormat.format(new Date())}
          </p>
          <h1 className="text-3xl font-bold tracking-[-.045em] sm:text-4xl">
            Hola{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}.
          </h1>
          <p className="mt-2 text-sm text-[#69766f]">
            Aquí tienes el estado real de tus vehículos y documentos.
          </p>
        </div>
        <button
          onClick={onAddDocument}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ed6e3b] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(237,110,59,.22)] hover:-translate-y-0.5"
        >
          <Plus size={18} />
          Agregar documento
        </button>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat
          icon={<FileCheck2 />}
          value={current}
          title="Documentos vigentes"
          description="Incluye los próximos a vencer"
          kind="green"
        />
        <Stat
          icon={<CalendarClock />}
          value={expiring}
          title="Requieren atención"
          description={`Vencen en ${Math.max(...alertDays)} días o menos`}
          kind="orange"
        />
        <Stat
          icon={<AlertTriangle />}
          value={overdue}
          title="Documentos vencidos"
          description="Actualízalos cuanto antes"
          kind="red"
        />
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <div className="overflow-hidden rounded-2xl border border-[#dfe1dc] bg-white">
          <div className="flex items-center justify-between border-b border-[#e6e7e3] p-5">
            <div>
              <h2 className="font-bold">Próximos vencimientos</h2>
              <p className="mt-1 text-xs text-[#77827b]">
                Ordenados por urgencia
              </p>
            </div>
            <button
              onClick={onViewDocuments}
              className="text-xs font-bold text-[#285747]"
            >
              Ver todos
            </button>
          </div>
          {urgent.length ? (
            <div className="divide-y divide-[#ecece8]">
              {urgent.map((document) => {
                const vehicle = vehicleFor(document.vehicleId);
                const status = statusFor(document.expirationDate, alertDays);
                return (
                  <div
                    key={document.id}
                    className="flex items-center gap-4 p-5"
                  >
                    <div className="grid size-10 place-items-center rounded-xl bg-[#edf1ee] text-[#315b4c]">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {document.name}
                      </p>
                      <p className="mt-1 text-xs text-[#7b857e]">
                        {vehicle
                          ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}`
                          : 'Vehículo'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold">
                        {formatExpiry(document.expirationDate)}
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold status-${status.tone}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              icon={<FileText />}
              title={
                documents.length
                  ? 'Sin vencimientos próximos'
                  : 'Aún no tienes documentos'
              }
              text="Agrega el primero para comenzar a recibir alertas."
              action="Agregar documento"
              onAction={onAddDocument}
            />
          )}
        </div>
        <div className="rounded-2xl bg-[#183f33] p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-white/55">
            Tu garaje
          </p>
          <p className="mt-3 text-4xl font-bold">{vehicles.length}</p>
          <p className="mt-1 text-sm text-white/65">
            {vehicles.length === 1
              ? 'vehículo registrado'
              : 'vehículos registrados'}
          </p>
          <div className="mt-7 space-y-3">
            {vehicles.slice(0, 3).map((vehicle) => (
              <div
                key={vehicle.id}
                className="flex items-center gap-3 rounded-xl bg-white/8 p-3"
              >
                <CarFront size={18} />
                <div>
                  <p className="text-xs font-bold">{vehicle.nickname}</p>
                  <p className="text-[10px] text-white/55">
                    {vehicle.brand} {vehicle.model} · {vehicle.plate}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({
  icon,
  value,
  title,
  description,
  kind,
}: {
  icon: ReactNode;
  value: number;
  title: string;
  description: string;
  kind: 'green' | 'orange' | 'red';
}) {
  const colors = {
    green: 'bg-[#e8f5ed] text-[#258254]',
    orange: 'bg-[#fff0e5] text-[#de6531]',
    red: 'bg-[#fdebe7] text-[#bd4632]',
  }[kind];
  return (
    <div className="rounded-2xl border border-[#dfe1dc] bg-white p-5">
      <div className="flex items-start justify-between">
        <div className={`grid size-10 place-items-center rounded-xl ${colors}`}>
          {icon}
        </div>
        <span className="text-3xl font-bold">{value}</span>
      </div>
      <p className="mt-5 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-[#768179]">{description}</p>
    </div>
  );
}

function DocumentsView({
  documents,
  vehicles,
  query,
  vehicleFilter,
  alertDays,
  setQuery,
  setVehicleFilter,
  onAdd,
  onEdit,
  onDownload,
  onPreview,
  onRenew,
  onDelete,
}: {
  documents: VehicleDocument[];
  vehicles: Vehicle[];
  query: string;
  vehicleFilter: number | 'all';
  alertDays: number[];
  setQuery: (value: string) => void;
  setVehicleFilter: (value: number | 'all') => void;
  onAdd: () => void;
  onEdit: (document: VehicleDocument) => void;
  onDownload: (document: VehicleDocument) => void;
  onPreview: (document: VehicleDocument) => void;
  onRenew: (document: VehicleDocument) => void;
  onDelete: (document: VehicleDocument) => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Documentación"
        title="Mis documentos"
        text="Archivos, fechas y vigencia de cada vehículo."
        action="Agregar documento"
        onAction={onAdd}
      />
      <div className="mt-7 overflow-hidden rounded-2xl border border-[#dfe1dc] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e6e7e3] p-5 sm:flex-row">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe1dc] bg-[#fafaf8] px-3 focus-within:border-[#4d7668]">
            <Search size={16} className="text-[#879189]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Buscar por documento, patente o marca"
            />
          </label>
          <select
            value={vehicleFilter}
            onChange={(event) =>
              setVehicleFilter(
                event.target.value === 'all'
                  ? 'all'
                  : Number(event.target.value),
              )
            }
            className="h-10 rounded-xl border border-[#dfe1dc] bg-white px-3 text-sm"
          >
            <option value="all">Todos los vehículos</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plate} · {vehicle.nickname}
              </option>
            ))}
          </select>
        </div>
        {documents.length ? (
          <div className="divide-y divide-[#ecece8]">
            {documents.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                vehicle={vehicles.find(
                  (vehicle) => vehicle.id === document.vehicleId,
                )}
                alertDays={alertDays}
                onEdit={() => onEdit(document)}
                onDownload={() => onDownload(document)}
                onPreview={() => onPreview(document)}
                onRenew={() => onRenew(document)}
                onDelete={() => onDelete(document)}
              />
            ))}
          </div>
        ) : (
          <Empty
            icon={<Search />}
            title="No hay documentos para mostrar"
            text="Cambia los filtros o agrega un nuevo documento."
            action="Agregar documento"
            onAction={onAdd}
          />
        )}
      </div>
    </>
  );
}
function DocumentRow({
  document,
  vehicle,
  alertDays,
  onEdit,
  onDownload,
  onPreview,
  onRenew,
  onDelete,
}: {
  document: VehicleDocument;
  vehicle?: Vehicle;
  alertDays: number[];
  onEdit: () => void;
  onDownload: () => void;
  onPreview: () => void;
  onRenew: () => void;
  onDelete: () => void;
}) {
  const status = statusFor(document.expirationDate, alertDays);
  return (
    <article className="grid gap-4 p-5 hover:bg-[#fafaf7] md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#edf1ee] text-[#315b4c]">
          <FileText size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{document.name}</p>
          <p className="mt-1 truncate text-xs text-[#7b857e]">
            {document.fileName || 'Sin archivo adjunto'} · {document.type}
          </p>
        </div>
      </div>
      <div>
        <p className="table-label">Vehículo</p>
        <p className="mt-1 text-sm font-semibold">
          {vehicle?.plate || 'Sin vehículo'}
        </p>
        <p className="text-xs text-[#7c8780]">
          {vehicle ? `${vehicle.brand} ${vehicle.model}` : ''}
        </p>
      </div>
      <div>
        <p className="table-label">Vencimiento</p>
        <p className="mt-1 text-sm font-semibold">
          {formatExpiry(document.expirationDate)}
        </p>
        <span
          className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold status-${status.tone}`}
        >
          {status.label}
        </span>
      </div>
      {document.notes && (
        <p className="text-xs text-[#68756e] md:col-span-full">
          {document.notes}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {!document.archived && (
          <button
            onClick={onRenew}
            className="row-action"
            title="Renovar conservando el anterior"
          >
            <CalendarClock size={16} />
          </button>
        )}
        <button
          onClick={onPreview}
          disabled={!document.chunkCount}
          className="row-action"
          title="Ver documento"
        >
          <Eye size={16} />
        </button>
        <button
          onClick={onDownload}
          disabled={!document.chunkCount}
          className="row-action"
          title="Descargar"
        >
          <Download size={16} />
        </button>
        <button onClick={onEdit} className="row-action" title="Editar">
          <Pencil size={16} />
        </button>
        <button
          onClick={onDelete}
          className="row-action text-[#a84938]"
          title="Eliminar"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function DocumentPreview({
  userId,
  document,
  onClose,
  onDownload,
}: {
  userId: string;
  document: VehicleDocument;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl = '';
    getCloudDocumentBlob(userId, document)
      .then((blob) => {
        if (!blob) throw new Error('Archivo no disponible');
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, document]);

  const isImage = document.fileType?.startsWith('image/');
  const isPdf =
    document.fileType === 'application/pdf' ||
    document.fileName?.toLowerCase().endsWith('.pdf');
  return (
    <Modal onClose={onClose}>
      <section className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-[#fbfbf8] shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#e1e4df] px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="truncate font-bold">{document.name}</p>
            <p className="mt-1 truncate text-xs text-[#748078]">
              {document.fileName}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onDownload}
              className="flex items-center gap-2 rounded-xl bg-[#183f33] px-4 py-2 text-xs font-bold text-white"
            >
              <Download size={15} />
              Descargar
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-[#d8ddd8] p-2"
              aria-label="Cerrar visor"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 place-items-center bg-[#e9ebe7] p-3 sm:p-6">
          {!url && !failed && (
            <div className="text-sm font-semibold text-[#68756e]">
              Cargando documento…
            </div>
          )}
          {failed && (
            <Empty
              icon={<FileText />}
              title="No pudimos abrir este archivo"
              text="Puedes intentar descargarlo para verlo en tu dispositivo."
              action="Descargar"
              onAction={onDownload}
            />
          )}
          {url && isImage && (
            <img
              src={url}
              alt={document.name}
              className="max-h-full max-w-full rounded-xl object-contain shadow-lg"
            />
          )}
          {url && isPdf && (
            <iframe
              src={url}
              title={document.name}
              className="h-full w-full rounded-xl bg-white shadow-lg"
            />
          )}
          {url && !isImage && !isPdf && (
            <Empty
              icon={<FileText />}
              title="Vista previa no disponible"
              text="Este tipo de archivo se puede descargar de forma segura."
              action="Descargar"
              onAction={onDownload}
            />
          )}
        </div>
      </section>
    </Modal>
  );
}

function VehiclesView({
  vehicles,
  documents,
  alertDays,
  onAdd,
  onEdit,
  onArchive,
  onDelete,
}: {
  vehicles: Vehicle[];
  documents: VehicleDocument[];
  alertDays: number[];
  onAdd: () => void;
  onEdit: (vehicle: Vehicle) => void;
  onArchive: (vehicle: Vehicle) => void;
  onDelete: (vehicle: Vehicle) => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Garaje"
        title="Mis vehículos"
        text="Organiza la documentación de cada vehículo por separado."
        action="Agregar vehículo"
        onAction={onAdd}
      />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((vehicle) => {
          const count = documents.filter(
            (document) => document.vehicleId === vehicle.id,
          ).length;
          return (
            <article
              key={vehicle.id}
              className="rounded-2xl border border-[#dfe1dc] bg-white p-6"
            >
              <div className="flex items-start justify-between">
                <div className="grid size-12 place-items-center rounded-xl bg-[#183f33] text-white">
                  {vehicle.vehicleType === 'motorcycle' ? (
                    <Bike />
                  ) : (
                    <CarFront />
                  )}
                </div>
                <span className="rounded-lg bg-[#f0f1ed] px-2 py-1 text-[10px] font-bold text-[#657168]">
                  {vehicle.year}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <button onClick={() => onEdit(vehicle)}>Editar</button>
                <button onClick={() => onArchive(vehicle)}>
                  {vehicle.archived ? 'Restaurar' : 'Archivar'}
                </button>
                <button onClick={() => onDelete(vehicle)}>Eliminar</button>
                {vehicle.archived && <strong>Archivado</strong>}
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[.12em] text-[#7b867f]">
                {vehicle.nickname}
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {vehicle.brand} {vehicle.model}
              </h2>
              <p className="mt-2 inline-flex rounded-lg bg-[#edf1ee] px-3 py-1 font-mono text-sm font-bold tracking-wider">
                {vehicle.plate}
              </p>
              <p className="mt-4 text-xs leading-5 text-[#68756e]">
                Sin registrar:{' '}
                {[
                  'Permiso de circulación',
                  'Revisión técnica',
                  'SOAP',
                  'Padrón',
                ]
                  .filter(
                    (type) =>
                      !documents.some(
                        (item) =>
                          item.vehicleId === vehicle.id && item.type === type,
                      ),
                  )
                  .join(', ') ||
                  'Tienes las cuatro categorías básicas registradas'}
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-[#ecece8] pt-4 text-xs text-[#6e7a73]">
                <span>
                  {count} {count === 1 ? 'documento' : 'documentos'}
                </span>
                <span>
                  {
                    documents.filter(
                      (document) =>
                        document.vehicleId === vehicle.id &&
                        daysUntil(document.expirationDate) <=
                          Math.max(...alertDays),
                    ).length
                  }{' '}
                  próximos
                </span>
              </div>
            </article>
          );
        })}
        {!vehicles.length && (
          <div className="md:col-span-2 xl:col-span-3">
            <Empty
              icon={<CarFront />}
              title="Tu garaje está vacío"
              text="Registra un vehículo para comenzar."
              action="Agregar vehículo"
              onAction={onAdd}
            />
          </div>
        )}
      </div>
    </>
  );
}

function AlertsView({
  documents,
  vehicles,
  alertDays,
  onToggle,
  notificationsEnabled,
  onToggleNotifications,
}: {
  documents: VehicleDocument[];
  vehicles: Vehicle[];
  alertDays: number[];
  onToggle: (days: number) => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
}) {
  const alerts = documents
    .filter(
      (document) =>
        !vehicles.some(
          (vehicle) => vehicle.id === document.vehicleId && vehicle.archived,
        ),
    )
    .filter(
      (document) =>
        daysUntil(document.expirationDate) <= Math.max(...alertDays),
    )
    .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));
  return (
    <>
      <PageHeader
        eyebrow="Centro de alertas"
        title="Vencimientos"
        text="Configura cuándo ReadyCar debe llamar tu atención."
      />
      <div className="mt-7 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <div className="overflow-hidden rounded-2xl border border-[#dfe1dc] bg-white">
          {alerts.length ? (
            <div className="divide-y divide-[#ecece8]">
              {alerts.map((document) => {
                const vehicle = vehicles.find(
                  (item) => item.id === document.vehicleId,
                );
                const status = statusFor(document.expirationDate, alertDays);
                return (
                  <div
                    key={document.id}
                    className="flex items-center gap-4 p-5"
                  >
                    <div
                      className={`grid size-10 place-items-center rounded-xl ${daysUntil(document.expirationDate) < 0 ? 'bg-[#fdebe7] text-[#bd4632]' : 'bg-[#fff0e5] text-[#de6531]'}`}
                    >
                      <AlertTriangle size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {document.name}
                      </p>
                      <p className="mt-1 text-xs text-[#7b857e]">
                        {vehicle?.plate} ·{' '}
                        {formatExpiry(document.expirationDate)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold status-${status.tone}`}
                    >
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              icon={<CheckCircle2 />}
              title="Todo está al día"
              text="No tienes vencimientos dentro del período configurado."
            />
          )}
        </div>
        <aside className="space-y-5">
          <div className="rounded-2xl border border-[#dfe1dc] bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold">Notificaciones del navegador</h2>
                <p className="mt-1 text-xs leading-5 text-[#758079]">
                  Recibe avisos automáticos aunque ReadyCar esté cerrada.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={onToggleNotifications}
                className={`relative h-7 w-12 shrink-0 rounded-full ${notificationsEnabled ? 'bg-[#183f33]' : 'bg-[#cfd5d0]'}`}
              >
                <span
                  className={`absolute top-1 size-5 rounded-full bg-white shadow transition-transform ${notificationsEnabled ? 'translate-x-1' : '-translate-x-5'}`}
                />
              </button>
            </div>
            <div
              className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${notificationsEnabled ? 'bg-[#e7f4eb] text-[#267849]' : 'bg-[#f1f3f0] text-[#68756e]'}`}
            >
              <Bell size={15} />
              {notificationsEnabled
                ? 'Notificaciones activas'
                : 'Notificaciones desactivadas'}
            </div>
          </div>
          <div className="rounded-2xl border border-[#dfe1dc] bg-white p-6">
            <h2 className="font-bold">Anticipación</h2>
            <p className="mt-1 text-xs leading-5 text-[#758079]">
              Elige con cuánta anticipación quieres ver cada alerta.
            </p>
            <div className="mt-5 space-y-3">
              {[60, 45, 30, 15, 5].map((days) => (
                <label
                  key={days}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-[#e3e5e0] p-3 text-sm font-semibold"
                >
                  <span>{days} días antes</span>
                  <input
                    checked={alertDays.includes(days)}
                    onChange={() => onToggle(days)}
                    type="checkbox"
                    className="size-4 accent-[#183f33]"
                  />
                </label>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function PageHeader({
  eyebrow,
  title,
  text,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[.15em] text-[#6d7c73]">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-bold tracking-[-.04em]">{title}</h1>
        <p className="mt-2 text-sm text-[#69766f]">{text}</p>
      </div>
      {action && (
        <button
          onClick={onAction}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ed6e3b] px-5 text-sm font-bold text-white"
        >
          <Plus size={18} />
          {action}
        </button>
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="grid place-items-center px-5 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-[#edf1ee] text-[#668076]">
        {icon}
      </div>
      <p className="mt-4 text-sm font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[#7c8780]">{text}</p>
      {action && (
        <button
          onClick={onAction}
          className="mt-4 rounded-xl bg-[#183f33] px-4 py-2 text-xs font-bold text-white"
        >
          {action}
        </button>
      )}
    </div>
  );
}

function Modal({
  children,
  onClose,
  locked = false,
}: {
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[calc(100%-2rem)]! max-h-[95dvh] justify-items-center overflow-y-auto border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-5xl!"
      >
        <DialogTitle className="sr-only">ReadyCar</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
function AuthModal({
  user,
  onClose,
  onSignedIn,
  onLogout,
}: {
  user: User | null;
  onClose: () => void;
  onSignedIn: () => void;
  onLogout: () => void;
}) {
  const [registering, setRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const email = fieldText(data, 'email');
    const password = data.get('password') as string;
    try {
      if (registering) {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const name = fieldText(data, 'name').trim();
        if (name) await updateProfile(credential.user, { displayName: name });
      } else await signInWithEmailAndPassword(auth, email, password);
      onSignedIn();
    } catch {
      setError(
        'No pudimos completar el acceso. Revisa tus datos e inténtalo nuevamente.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    if (!auth) return;
    setBusy(true);
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      onSignedIn();
    } catch {
      setError('No pudimos abrir el acceso con Google.');
    } finally {
      setBusy(false);
    }
  }
  if (user)
    return (
      <Modal onClose={onClose}>
        <div className="w-full max-w-md rounded-3xl bg-[#fbfbf8] p-7 shadow-2xl">
          <div className="flex justify-between">
            <Brand />
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-xl p-2"
            >
              <X size={20} />
            </button>
          </div>
          <div className="mt-8 flex items-center gap-4 rounded-2xl bg-[#edf2ee] p-4">
            <div className="grid size-12 place-items-center rounded-xl bg-[#183f33] font-bold text-white">
              {(user.displayName || user.email || 'RC')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold">
                {user.displayName || 'Cuenta ReadyCar'}
              </p>
              <p className="truncate text-xs text-[#6f7b74]">{user.email}</p>
            </div>
          </div>
          {!user.emailVerified && (
            <button
              className="mt-4 text-sm underline"
              onClick={async () => {
                try {
                  await sendEmailVerification(user);
                  setError('Revisa tu correo para verificar la cuenta');
                } catch {
                  setError('No pudimos enviar el correo. Inténtalo más tarde.');
                }
              }}
            >
              Verificar mi correo
            </button>
          )}
          {error && (
            <p role="status" className="mt-3 text-sm">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            className="mt-4 block text-sm text-red-700 underline"
            onClick={async () => {
              if (
                !confirm(
                  '¿Eliminar tu cuenta y todos tus vehículos, documentos y archivos? Esta acción no se puede deshacer. Descarga un respaldo antes si lo necesitas.',
                )
              )
                return;
              setBusy(true);
              try {
                const response = await fetch('/api/account', {
                  method: 'DELETE',
                  headers: {
                    Authorization: 'Bearer ' + (await user.getIdToken()),
                  },
                });
                const data = (await response.json()) as { error?: string };
                if (!response.ok) throw new Error(data.error);
                onLogout();
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'No pudimos eliminar la cuenta',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Eliminar cuenta y datos
          </button>
          <button
            onClick={onLogout}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9ddd7] py-3 text-sm font-bold text-[#9d4336]"
          >
            <LogOut size={17} />
            Cerrar sesión
          </button>
        </div>
      </Modal>
    );
  return (
    <Modal locked onClose={onClose}>
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl bg-[#fbfbf8] p-7 shadow-2xl"
      >
        <Brand />
        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#758178]">
            Tu garaje digital
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-[-.04em]">
            {registering ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#68756e]">
            Accede para mantener tus documentos y alertas bajo control.
          </p>
        </div>
        {!firebaseReady && (
          <div className="mt-5 rounded-xl border border-[#efd4c6] bg-[#fff3eb] p-3 text-xs leading-5 text-[#9a4b2e]">
            El acceso está listo, pero falta configurar las variables públicas
            de Firebase.
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl bg-[#fdebe7] p-3 text-xs text-[#a54431]"
          >
            {error}
          </div>
        )}
        <div className="mt-6 space-y-4">
          {registering && (
            <label className="field">
              Nombre completo
              <input
                name="name"
                required
                placeholder="Catalina Rojas"
                autoComplete="name"
              />
            </label>
          )}
          <label className="field">
            Correo electrónico
            <div className="relative">
              <Mail
                className="absolute left-3 top-3 text-[#869088]"
                size={17}
              />
              <input
                className="pl-10!"
                name="email"
                type="email"
                required
                placeholder="tu@correo.cl"
                autoComplete="email"
              />
            </div>
          </label>
          <label className="field">
            Contraseña
            <div className="relative">
              <input
                className="pr-11!"
                name="password"
                type={showPassword ? 'text' : 'password'}
                minLength={6}
                required
                placeholder="Mínimo 6 caracteres"
                autoComplete={registering ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-[#78847c]"
                aria-label={
                  showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
        </div>
        <button
          disabled={busy || !firebaseReady}
          className="mt-6 w-full rounded-xl bg-[#183f33] py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy
            ? 'Procesando…'
            : registering
              ? 'Crear cuenta'
              : 'Iniciar sesión'}
        </button>
        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#929a94]">
          <span className="h-px flex-1 bg-[#dfe2dd]" />o continúa con
          <span className="h-px flex-1 bg-[#dfe2dd]" />
        </div>
        <button
          type="button"
          disabled={busy || !firebaseReady}
          onClick={google}
          className="w-full rounded-xl border border-[#d8ddd8] bg-white py-3 text-sm font-bold disabled:opacity-50"
        >
          Google
        </button>
        <button
          type="button"
          className="mt-4 w-full text-sm underline"
          onClick={async (event) => {
            const form = event.currentTarget.form;
            const email = fieldText(new FormData(form!), 'email');
            if (!email || !auth) {
              setError('Escribe tu correo para recuperar tu contraseña');
              return;
            }
            try {
              await sendPasswordResetEmail(auth, email);
              setError(
                'Si existe una cuenta con ese correo, recibirás instrucciones.',
              );
            } catch {
              setError(
                'No pudimos enviar las instrucciones. Revisa el correo.',
              );
            }
          }}
        >
          Olvidé mi contraseña
        </button>
        <p className="mt-6 text-center text-xs text-[#68756e]">
          {registering ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}{' '}
          <button
            type="button"
            onClick={() => {
              setRegistering(!registering);
              setError('');
            }}
            className="font-bold text-[#1d5b47]"
          >
            {registering ? 'Inicia sesión' : 'Créala aquí'}
          </button>
        </p>
      </form>
    </Modal>
  );
}
type CatalogMake = { MakeId: number; MakeName: string };
type CatalogModel = { Model_ID: number; Model_Name: string };

function VehicleCatalogFields({
  initialType = 'car',
  initialBrand = '',
  initialModel = '',
}: {
  initialType?: 'car' | 'motorcycle';
  initialBrand?: string;
  initialModel?: string;
}) {
  const listId = useId().replace(/:/g, '');
  const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>(
    initialType,
  );
  const [brand, setBrand] = useState(initialBrand);
  const [model, setModel] = useState(initialModel);
  const [makes, setMakes] = useState<CatalogMake[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingMakes(true);
    setMakes([]);
    setModels([]);
    fetch(`/api/vehicles/makes?type=${vehicleType}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Catálogo no disponible');
        return (await response.json()) as { makes: CatalogMake[] };
      })
      .then((data) => setMakes(data.makes || []))
      .catch(() => undefined)
      .finally(() => setLoadingMakes(false));
    return () => controller.abort();
  }, [vehicleType]);

  useEffect(() => {
    const selected = makes.find(
      (item) =>
        item.MakeName.localeCompare(brand, undefined, {
          sensitivity: 'base',
        }) === 0,
    );
    if (!selected) {
      setModels([]);
      return;
    }
    const controller = new AbortController();
    setLoadingModels(true);
    fetch(
      `/api/vehicles/models?type=${vehicleType}&make=${encodeURIComponent(selected.MakeName)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Catálogo no disponible');
        return (await response.json()) as { models: CatalogModel[] };
      })
      .then((data) => setModels(data.models || []))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
    return () => controller.abort();
  }, [brand, makes, vehicleType]);

  return (
    <>
      <label className="field sm:col-span-2">
        Tipo de vehículo
        <select
          name="vehicleType"
          value={vehicleType}
          onChange={(event) => {
            setVehicleType(event.target.value as 'car' | 'motorcycle');
            setBrand('');
            setModel('');
          }}
        >
          <option value="car">Auto</option>
          <option value="motorcycle">Moto</option>
        </select>
      </label>
      <label className="field">
        Marca
        <input
          name="brand"
          required
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value);
            setModel('');
          }}
          list={`${listId}-makes`}
          placeholder={
            loadingMakes ? 'Cargando marcas…' : 'Busca cualquier marca'
          }
          autoComplete="off"
        />
        <datalist id={`${listId}-makes`}>
          {makes.map((make) => (
            <option key={make.MakeId} value={make.MakeName} />
          ))}
        </datalist>
      </label>
      <label className="field">
        Modelo
        <input
          name="model"
          required
          value={model}
          onChange={(event) => setModel(event.target.value)}
          list={`${listId}-models`}
          placeholder={
            loadingModels
              ? 'Cargando modelos…'
              : brand
                ? 'Busca el modelo'
                : 'Primero elige una marca'
          }
          autoComplete="off"
        />
        <datalist id={`${listId}-models`}>
          {models.map((item) => (
            <option
              key={`${item.Model_ID}-${item.Model_Name}`}
              value={item.Model_Name}
            />
          ))}
        </datalist>
      </label>
      <p className="-mt-2 text-[10px] leading-4 text-[#7a857e] sm:col-span-2">
        Catálogo internacional de autos y motos; también puedes escribir una
        marca o modelo que aún no figure.
      </p>
    </>
  );
}

function OnboardingForm({
  onRecover,
  profile,
  firstVehicle,
  onClose,
  onSubmit,
}: {
  profile: Profile | null;
  firstVehicle?: Vehicle;
  onRecover: () => void;
  onClose: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal locked={!profile} onClose={onClose}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xl rounded-3xl bg-[#fbfbf8] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <Brand />
            <h2 className="mt-7 text-2xl font-bold tracking-tight">
              {profile ? 'Editar datos principales' : 'Configura tu ReadyCar'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#68756e]">
              Tu perfil, vehículos y documentos se sincronizan de forma privada
              con tu cuenta.
            </p>
          </div>
          {profile && (
            <button type="button" onClick={onClose} className="rounded-xl p-2">
              <X />
            </button>
          )}
        </div>
        {!profile && (
          <button
            type="button"
            onClick={onRecover}
            className="mt-4 text-sm underline"
          >
            Ya usaba ReadyCar: recuperar mi garaje anterior
          </button>
        )}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            Tu nombre
            <input
              name="name"
              required
              defaultValue={profile?.name}
              placeholder="Ej. Catalina Rojas"
            />
          </label>
          {!profile && (
            <>
              <label className="field">
                Nombre del vehículo
                <input
                  name="nickname"
                  required
                  defaultValue={firstVehicle?.nickname || 'Mi vehículo'}
                />
              </label>
              <label className="field">
                Patente
                <input
                  name="plate"
                  required
                  defaultValue={firstVehicle?.plate}
                  placeholder="ABCD-12"
                />
              </label>
              <VehicleCatalogFields
                initialType={firstVehicle?.vehicleType}
                initialBrand={firstVehicle?.brand}
                initialModel={firstVehicle?.model}
              />
              <label className="field sm:col-span-2">
                Año
                <input
                  name="year"
                  required
                  type="number"
                  min="1950"
                  max={new Date().getFullYear() + 1}
                  defaultValue={firstVehicle?.year || new Date().getFullYear()}
                />
              </label>
            </>
          )}
        </div>
        <button className="mt-7 w-full rounded-xl bg-[#183f33] px-5 py-3 text-sm font-bold text-white">
          Guardar y continuar
        </button>
      </form>
    </Modal>
  );
}
function VehicleForm({
  vehicle,
  onClose,
  onSubmit,
}: {
  vehicle?: Vehicle | null;
  onClose: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg rounded-3xl bg-[#fbfbf8] p-6 shadow-2xl sm:p-8"
      >
        <FormTitle
          eyebrow="Nuevo registro"
          title={vehicle ? 'Editar vehículo' : 'Agregar vehículo'}
          onClose={onClose}
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field">
            Nombre
            <input
              name="nickname"
              required
              defaultValue={vehicle?.nickname}
              placeholder="Ej. Auto familiar"
            />
          </label>
          <label className="field">
            Patente
            <input
              name="plate"
              required
              defaultValue={vehicle?.plate}
              placeholder="ABCD-12"
            />
          </label>
          <VehicleCatalogFields
            initialType={vehicle?.vehicleType}
            initialBrand={vehicle?.brand}
            initialModel={vehicle?.model}
          />
          <label className="field sm:col-span-2">
            Año
            <input
              name="year"
              type="number"
              min="1950"
              max={new Date().getFullYear() + 1}
              required
              defaultValue={vehicle?.year || new Date().getFullYear()}
            />
          </label>
        </div>
        <FormActions onClose={onClose} label="Guardar vehículo" />
      </form>
    </Modal>
  );
}
function DocumentForm({
  vehicles,
  document,
  onClose,
  onSubmit,
}: {
  vehicles: Vehicle[];
  document: VehicleDocument | null;
  onClose: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg rounded-3xl bg-[#fbfbf8] p-6 shadow-2xl sm:p-8"
      >
        <FormTitle
          eyebrow={document ? 'Editar registro' : 'Nuevo registro'}
          title={
            document?.previousId
              ? 'Renovar documento'
              : document
                ? 'Editar documento'
                : 'Agregar documento'
          }
          onClose={onClose}
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            Nombre
            <input
              name="name"
              required
              defaultValue={document?.name}
              placeholder="Ej. Permiso de circulación"
            />
          </label>
          <label className="field">
            Tipo
            <select
              name="type"
              defaultValue={document?.type || 'Permiso de circulación'}
            >
              <option>Permiso de circulación</option>
              <option>Revisión técnica</option>
              <option>SOAP</option>
              <option>Seguro automotriz</option>
              <option>Padrón</option>
              <option>Mantención</option>
              <option>Otro</option>
            </select>
          </label>
          <label className="field">
            Vencimiento (opcional)
            <input
              name="expirationDate"
              type="date"
              defaultValue={document?.expirationDate}
            />
          </label>
          <label className="field sm:col-span-2">
            Vehículo
            <select
              name="vehicleId"
              defaultValue={document?.vehicleId || vehicles[0]?.id}
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate} · {vehicle.nickname} ({vehicle.brand}{' '}
                  {vehicle.model})
                </option>
              ))}
            </select>
          </label>
          <label className="field sm:col-span-2">
            Notas <em>(opcional)</em>
            <textarea
              name="notes"
              defaultValue={document?.notes}
              rows={3}
              placeholder="Número de póliza, observaciones…"
            />
          </label>
          <label className="field sm:col-span-2">
            <span>
              Archivo <em>(PDF o imagen, hasta 10 MB)</em>
            </span>
            <span className="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#bcc5bf] bg-white text-sm font-semibold text-[#557066]">
              <Upload size={18} />
              {document?.fileName || 'Seleccionar archivo'}
            </span>
            <input
              className="sr-only"
              name="file"
              type="file"
              accept="application/pdf,image/*"
              required={!document?.fileName}
            />
          </label>
        </div>
        <FormActions
          onClose={onClose}
          label={document ? 'Guardar cambios' : 'Guardar documento'}
        />
      </form>
    </Modal>
  );
}
function FormTitle({
  eyebrow,
  title,
  onClose,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#78847c]">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
      </div>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="rounded-xl p-2 hover:bg-black/5"
      >
        <X size={20} />
      </button>
    </div>
  );
}
function FormActions({
  onClose,
  label,
}: {
  onClose: () => void;
  label: string;
}) {
  return (
    <div className="mt-7 flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl px-5 py-3 text-sm font-semibold hover:bg-black/5"
      >
        Cancelar
      </button>
      <button className="rounded-xl bg-[#183f33] px-5 py-3 text-sm font-bold text-white">
        {label}
      </button>
    </div>
  );
}
