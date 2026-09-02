import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { firestore } from './firebase';

export type Vehicle = {
  id: number;
  nickname: string;
  brand: string;
  model: string;
  year: string;
  plate: string;
  vehicleType?: 'car' | 'motorcycle';
  archived?: boolean;
};
export type Account = {
  profile: { name: string };
  vehicles: Vehicle[];
  alertDays: number[];
};

export function watchAccount(
  uid: string,
  update: (value: Account | null) => void,
  fail: () => void,
) {
  if (!firestore) throw new Error('No hay conexión con tu cuenta');
  return onSnapshot(
    doc(firestore, 'users', uid, 'settings', 'account'),
    (snapshot) =>
      update(snapshot.exists() ? (snapshot.data() as Account) : null),
    fail,
  );
}

export async function changeAccount(
  uid: string,
  update: (value: Account) => Account,
) {
  if (!firestore) throw new Error('No hay conexión con tu cuenta');
  const ref = doc(firestore, 'users', uid, 'settings', 'account');
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists()
      ? (snapshot.data() as Account)
      : { profile: { name: '' }, vehicles: [], alertDays: [45, 15, 5] };
    transaction.set(ref, update(current));
  });
}
