import type { User } from 'firebase/auth';
import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
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
  chunkCount?: number;
  notes?: string;
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
  let fileName = document.fileName || null;
  let fileSize = document.fileSize || null;
  let fileType = document.fileType || null;
  let chunkCount = document.chunkCount || 0;
  if (file?.size) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error('El archivo supera los 10 MB');
    const oldChunks = await getDocs(
      collection(
        firestore,
        'users',
        user.uid,
        'documents',
        String(document.id),
        'chunks',
      ),
    );
    const cleanup = writeBatch(firestore);
    oldChunks.forEach((item) => cleanup.delete(item.ref));
    await cleanup.commit();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunkSize = 700 * 1024;
    chunkCount = Math.ceil(bytes.length / chunkSize);
    const batch = writeBatch(firestore);
    for (let index = 0; index < chunkCount; index++) {
      const value = bytes.slice(
        index * chunkSize,
        Math.min(bytes.length, (index + 1) * chunkSize),
      );
      batch.set(
        doc(
          firestore,
          'users',
          user.uid,
          'documents',
          String(document.id),
          'chunks',
          String(index).padStart(3, '0'),
        ),
        { index, value: Bytes.fromUint8Array(value) },
      );
    }
    await batch.commit();
    fileName = file.name;
    fileSize = file.size;
    fileType = file.type || 'application/octet-stream';
  }
  const saved = {
    ...document,
    ownerId: user.uid,
    fileName,
    fileSize,
    fileType,
    chunkCount,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(
    doc(firestore, 'users', user.uid, 'documents', String(document.id)),
    saved,
  );
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
  await batch.commit();
  await deleteDoc(
    doc(firestore, 'users', userId, 'documents', String(document.id)),
  );
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
  const parts = chunks.docs.map((item) => {
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
