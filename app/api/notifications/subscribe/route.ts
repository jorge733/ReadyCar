import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { createHash } from 'node:crypto';

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer '))
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const verification = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: authorization.slice(7) }),
      },
    );
    const verified = (await verification.json()) as {
      users?: Array<{ localId: string }>;
    };
    const userId = verified.users?.[0]?.localId;
    if (!verification.ok || !userId)
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { subscription, enabled = true } = (await request.json()) as {
      subscription?: { endpoint?: string };
      enabled?: boolean;
    };
    if (!subscription?.endpoint)
      return NextResponse.json(
        { error: 'Suscripción requerida' },
        { status: 400 },
      );
    const id = createHash('sha256').update(subscription.endpoint).digest('hex');
    const tokenRef = adminDb().doc(`users/${userId}/pushTokens/${id}`);
    if (enabled)
      await tokenRef.set({
        subscription,
        userId,
        updatedAt: new Date().toISOString(),
      });
    else await tokenRef.delete();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo guardar la suscripción' },
      { status: 500 },
    );
  }
}
