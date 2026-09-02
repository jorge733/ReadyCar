import { getAuth } from 'firebase-admin/auth';
import { adminApp, adminDb } from '@/lib/firebase-admin';

export async function DELETE(request: Request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token)
      return Response.json(
        { error: 'Inicia sesión para continuar' },
        { status: 401 },
      );
    const auth = getAuth(adminApp());
    const user = await auth.verifyIdToken(token, true);
    if (Date.now() / 1000 - user.auth_time > 300)
      return Response.json(
        {
          error:
            'Por seguridad, cierra sesión y vuelve a ingresar antes de eliminar tu cuenta.',
        },
        { status: 401 },
      );
    await adminDb().recursiveDelete(adminDb().doc(`users/${user.uid}`));
    await auth.deleteUser(user.uid);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      {
        error:
          'No se pudo completar la eliminación. Puedes volver a intentarlo.',
      },
      { status: 500 },
    );
  }
}
