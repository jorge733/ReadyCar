import type { User } from 'firebase/auth';
import {
  Bytes,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from './firebase';

export type CloudDocument = {
  id: number;
  name: string;
  type: string;
  vehicleId: number;
  expirationDate: string;
  fileName?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  fileVersion?: string | null;
  chunkCount?: number;
  notes?: string;
  archived?: boolean;
  previousId?: number;
};

export function watchDocuments(
  userId: string,
  update: (documents: CloudDocument[]) => void,
  fail: () => void,
) {
  if (!firestore) return () => undefined;
  return onSnapshot(
    collection(firestore, 'users', userId, 'documents'),
    (snapshot) => {
      update(snapshot.docs.map((item) => item.data() as CloudDocument));
    },
    fail,
  );
}

export async function saveCloudDocument(
  user: User,
  document: CloudDocument,
  file?: File | null,
) {
  if (!firestore) throw new Error('Firebase no está disponible');
  if (
    document.expirationDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(document.expirationDate) ||
      !Number.isFinite(Date.parse(document.expirationDate)))
  )
    throw new Error('Fecha de vencimiento inválida');
  if (!document.name.trim() || !Number.isFinite(document.vehicleId))
    throw new Error('Revisa el nombre y el vehículo');
  const batch = writeBatch(firestore);
  let fileVersion = document.fileVersion || null;
  let oldChunks: Awaited<ReturnType<typeof getDocs>> | null = null;
  let fileName = document.fileName || null;
  let fileSize = document.fileSize || null;
  let fileType = document.fileType || null;
  let chunkCount = document.chunkCount || 0;
  if (file?.size) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error('El archivo supera los 10 MB');
    oldChunks = await getDocs(
      collection(
        firestore,
        'users',
        user.uid,
        'documents',
        String(document.id),
        'chunks',
      ),
    );
    if (
      file.type !== 'application/pdf' &&
      ![
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
      ].includes(file.type)
    )
      throw new Error('Usa un PDF o imagen JPG, PNG, WEBP o HEIC');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunkSize = 700 * 1024;
    chunkCount = Math.ceil(bytes.length / chunkSize);
    fileVersion = crypto.randomUUID();
    let upload = writeBatch(firestore);
    for (let index = 0; index < chunkCount; index++) {
      const value = bytes.slice(
        index * chunkSize,
        Math.min(bytes.length, (index + 1) * chunkSize),
      );
      upload.set(
        doc(
          firestore,
          'users',
          user.uid,
          'documents',
          String(document.id),
          'chunks',
          fileVersion + '-' + String(index).padStart(3, '0'),
        ),
        { index, version: fileVersion, value: Bytes.fromUint8Array(value) },
      );
      if ((index + 1) % 4 === 0 || index === chunkCount - 1) {
        await upload.commit();
        upload = writeBatch(firestore);
      }
    }
    fileName = file.name;
    fileSize = file.size;
    fileType = file.type || 'application/octet-stream';
  }
  const saved = {
    ...document,
    ownerId: user.uid,
    fileName,
    fileVersion,
    fileSize,
    fileType,
    chunkCount,
    updatedAt: new Date().toISOString(),
  };
  batch.set(
    doc(firestore, 'users', user.uid, 'documents', String(document.id)),
    saved,
  );
  if (document.previousId && !document.chunkCount)
    batch.update(
      doc(
        firestore,
        'users',
        user.uid,
        'documents',
        String(document.previousId),
      ),
      { archived: true },
    );
  await batch.commit();
  if (oldChunks && !oldChunks.empty) {
    // Remove only chunks of the previously visible version; interrupted uploads can be retried safely.
    const cleanup = writeBatch(firestore);
    oldChunks.docs
      .filter(
        (item) =>
          ((item.data() as { version?: string }).version || null) ===
          (document.fileVersion || null),
      )
      .forEach((item) => cleanup.delete(item.ref));
    await cleanup.commit().catch(() => undefined);
  }
  return saved as CloudDocument;
}

export async function deleteCloudDocument(
  userId: string,
  document: CloudDocument,
) {
  if (!firestore) throw new Error('Firebase no está disponible');
  const chunks = await getDocs(
    collection(
      firestore,
      'users',
      userId,
      'documents',
      String(document.id),
      'chunks',
    ),
  );
  const batch = writeBatch(firestore);
  chunks.forEach((item) => batch.delete(item.ref));
  batch.delete(
    doc(firestore, 'users', userId, 'documents', String(document.id)),
  );
  await batch.commit();
}

export async function getCloudDocumentBlob(
  userId: string,
  document: CloudDocument,
) {
  if (!firestore || !document.chunkCount) return null;
  const chunks = await getDocs(
    query(
      collection(
        firestore,
        'users',
        userId,
        'documents',
        String(document.id),
        'chunks',
      ),
      orderBy('index'),
    ),
  );
  const selectedChunks = chunks.docs.filter(
    (item) => (item.data().version || null) === (document.fileVersion || null),
  );
  if (selectedChunks.length !== document.chunkCount)
    throw new Error('Archivo incompleto. Intenta nuevamente.');
  const parts = selectedChunks.map((item) => {
    const value = (item.data().value as Bytes).toUint8Array();
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ) as ArrayBuffer;
  });
  return new Blob(parts, {
    type: document.fileType || 'application/octet-stream',
  });
}

export async function downloadCloudDocument(
  userId: string,
  document: CloudDocument,
) {
  const blob = await getCloudDocumentBlob(userId, document);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = document.fileName || document.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
