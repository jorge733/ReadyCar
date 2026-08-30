import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import webpush from 'web-push';

function daysUntil(date: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(`${date}T12:00:00Z`).getTime() - today.getTime()) / 86400000,
  );
}
export async function GET(request: Request) {
  if (
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
    const days = daysUntil(data.expirationDate);
    if (days <= 45) {
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
      url: 'https://appreadycar.vercel.app/',
    });
    for (const token of tokens.docs) {
      try {
        await webpush.sendNotification(token.data().subscription, payload);
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
