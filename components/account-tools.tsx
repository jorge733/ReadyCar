'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { changeAccount, type Account, type Vehicle } from '@/lib/account-cloud';
import { saveCloudDocument, type CloudDocument } from '@/lib/readycar-cloud';

export function AccountTools({
  user,
  notify,
}: {
  user: User;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function restore(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error('El respaldo supera los 100 MB');
      const data = JSON.parse(await file.text());
      if (
        data.version !== 1 ||
        !Array.isArray(data.vehicles) ||
        !Array.isArray(data.documents) ||
        data.documents.length > 200
      )
        throw new Error('Respaldo no válido');
      const vehicles: Vehicle[] = data.vehicles;
      if (
        vehicles.some(
          (v) =>
            !Number.isSafeInteger(v.id) ||
            ['nickname', 'brand', 'model', 'year', 'plate'].some(
              (key) => typeof v[key as keyof Vehicle] !== 'string',
            ),
        )
      )
        throw new Error('Los vehículos del respaldo no son válidos');
      const records: (CloudDocument & { fileBase64?: string })[] =
        data.documents;
      const files = records.map((item) => {
        if (
          !Number.isSafeInteger(item.id) ||
          typeof item.name !== 'string' ||
          typeof item.type !== 'string' ||
          typeof item.expirationDate !== 'string' ||
          !vehicles.some((v) => v.id === item.vehicleId)
        )
          throw new Error('El respaldo contiene documentos no válidos');
        if (!item.fileBase64)
          throw new Error('El respaldo debe incluir todos los archivos');
        const bytes = Uint8Array.from(atob(item.fileBase64), (c) =>
          c.charCodeAt(0),
        );
        if (bytes.length > 10 * 1024 * 1024)
          throw new Error('Un archivo supera los 10 MB');
        return new File([bytes], item.fileName || item.name, {
          type: item.fileType || 'application/pdf',
        });
      });
      if (
        !confirm(
          `¿Importar ${vehicles.length} vehículos y ${records.length} documentos? Se agregarán como copias sin reemplazar tus datos actuales.`,
        )
      )
        return;
      const mapping = new Map<number, number>();
      const base = Date.now();
      const imported = vehicles.map((v, index) => {
        mapping.set(v.id, base + index);
        return { ...v, id: base + index, nickname: `${v.nickname} (respaldo)` };
      });
      await changeAccount(user.uid, (account) => ({
        ...account,
        vehicles: [...account.vehicles, ...imported],
      }));
      for (let index = 0; index < records.length; index++) {
        const item = records[index];
        await saveCloudDocument(
          user,
          {
            id: base + vehicles.length + index,
            name: item.name,
            type: item.type,
            vehicleId: mapping.get(item.vehicleId)!,
            expirationDate: item.expirationDate,
            notes: item.notes || '',
            archived: Boolean(item.archived),
          },
          files[index],
        );
      }
      notify('Respaldo importado. Tus datos anteriores se conservaron.');
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message +
              '. Si la importación alcanzó a comenzar, revisa las copias importadas antes de repetirla.'
          : 'No pudimos importar el respaldo',
      );
    } finally {
      setBusy(false);
    }
  }
  async function importLocal() {
    try {
      const vehicles = JSON.parse(
        localStorage.getItem('readycar-vehicles') || '[]',
      );
      if (!Array.isArray(vehicles) || !vehicles.length) {
        notify('No encontramos vehículos anteriores en este navegador');
        return;
      }
      if (
        !confirm(
          '¿Estos vehículos antiguos son tuyos? Se vincularán a la cuenta actual conservando sus documentos.',
        )
      )
        return;
      await changeAccount(user.uid, (account: Account) => ({
        ...account,
        vehicles: [
          ...account.vehicles,
          ...vehicles.filter(
            (v: Vehicle) =>
              !account.vehicles.some((current) => current.id === v.id),
          ),
        ],
      }));
      notify('Vehículos anteriores vinculados a tu cuenta');
    } catch {
      notify('No pudimos recuperar los vehículos anteriores');
    }
  }
  return (
    <section className="mt-6 rounded-2xl border border-[#dfe1dc] bg-white p-5 text-sm">
      <h2 className="font-bold">Tu cuenta y acceso rápido</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="rounded-xl border px-4 py-3" onClick={importLocal}>
          Recuperar vehículos de este navegador
        </button>
        <label className="cursor-pointer rounded-xl border px-4 py-3">
          {busy ? 'Importando…' : 'Importar respaldo'}
          <input
            aria-label="Importar respaldo JSON"
            disabled={busy}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              void restore(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        <button
          className="rounded-xl border px-4 py-3"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                'https://appreadycar.vercel.app/',
              );
              notify('Enlace copiado para grabar en tu tarjeta NFC');
            } catch {
              notify('No pudimos copiar el enlace');
            }
          }}
        >
          Copiar enlace para NFC
        </button>
      </div>
      <details className="mt-5">
        <summary className="cursor-pointer font-semibold">
          Cómo usar la tarjeta NFC
        </summary>
        <p className="mt-2 leading-6 text-[#68756e]">
          Graba el enlace del sitio publicado como una dirección web en tu
          tarjeta. Al acercarla a un teléfono compatible, se abrirá ReadyCar.
          Cada persona accede con su propia cuenta; la tarjeta no contiene
          documentos ni contraseñas. Si cambias de dominio, tendrás que
          actualizar la tarjeta.
        </p>
      </details>
      <details className="mt-4">
        <summary className="cursor-pointer font-semibold">
          Privacidad y ayuda
        </summary>
        <p className="mt-2 leading-6 text-[#68756e]">
          ReadyCar guarda el perfil, vehículos, preferencias y documentos en la
          cuenta de Firebase. Los archivos se consultan al iniciar sesión.
          Puedes descargar un respaldo desde Documentos y eliminar documentos
          desde su listado. Los estados dependen de las fechas que registras;
          ReadyCar no verifica la autenticidad del documento. Para problemas de
          acceso, usa la recuperación de contraseña. En un teléfono compartido,
          cierra la sesión al terminar.
        </p>
      </details>
    </section>
  );
}
