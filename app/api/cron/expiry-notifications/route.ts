import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import webpush from 'web-push';

import { daysUntil } from '@/lib/expiry';
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:readycar@appreadycar.vercel.app',
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const db = adminDb();
  const documents = await db.collectionGroup('documents').get();
  const byUser = new Map<string, { urgent: number; overdue: number }>();
  for (const item of documents.docs) {
    const data = item.data();
    if (data.archived) continue;
    const days = daysUntil(data.expirationDate);
    if (!data.ownerId || !Number.isFinite(days)) continue;
    const settings = await db
      .doc(`users/${data.ownerId}/settings/account`)
      .get();
    const preferences = settings.data();
    if (
      preferences?.vehicles?.some(
        (vehicle: { id: number; archived?: boolean }) =>
          vehicle.id === data.vehicleId && vehicle.archived,
      )
    )
      continue;
    const alertDays = preferences?.alertDays || [45, 15, 5];
    if (days <= Math.max(...alertDays)) {
      const current = byUser.get(data.ownerId) || { urgent: 0, overdue: 0 };
      current.urgent++;
      if (days < 0) current.overdue++;
      byUser.set(data.ownerId, current);
    }
  }
  let sent = 0;
  for (const [userId, counts] of byUser) {
    const tokens = await db.collection(`users/${userId}/pushTokens`).get();
    const payload = JSON.stringify({
      title: 'ReadyCar · Documentos por revisar',
      body: counts.overdue
        ? `${counts.overdue} vencido(s) y ${counts.urgent - counts.overdue} próximo(s) a vencer.`
        : `${counts.urgent} documento(s) próximo(s) a vencer.`,
      url: '/',
    });
    for (const token of tokens.docs) {
      try {
        const stamp = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Santiago',
        }).format(new Date());
        if (token.data().lastSentDate === stamp) continue;
        await webpush.sendNotification(token.data().subscription, payload);
        await token.ref.update({ lastSentDate: stamp });
        sent++;
      } catch (error) {
        if (
          [404, 410].includes(
            (error as { statusCode?: number }).statusCode || 0,
          )
        )
          await token.ref.delete();
      }
    }
  }
  return NextResponse.json({ ok: true, sent });
}
