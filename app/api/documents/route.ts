import { env } from 'cloudflare:workers';
type Bindings = { DB: D1Database; DOCUMENTS: R2Bucket };
const bindings = env as unknown as Bindings;

async function prepareDatabase() {
  await bindings.DB.batch([
    bindings.DB.prepare(`CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, vehicle TEXT NOT NULL, plate TEXT NOT NULL, expiration_date TEXT NOT NULL, file_name TEXT, file_key TEXT, created_at TEXT NOT NULL)`),
    bindings.DB.prepare('CREATE INDEX IF NOT EXISTS idx_documents_expiration_date ON documents(expiration_date)'),
  ]);
}

export async function GET() {
  await prepareDatabase();
  const result = await bindings.DB.prepare(`SELECT id, name, type, vehicle, plate, expiration_date AS expirationDate, file_name AS fileName FROM documents ORDER BY expiration_date ASC`).all();
  return Response.json(result.results);
}

export async function POST(request: Request) {
  await prepareDatabase();
  const data = await request.formData();
  const file = data.get('file');
  let fileKey: string | null = null;
  let fileName: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: 'El archivo supera el límite de 10 MB' }, { status: 400 });
    fileName = file.name;
    fileKey = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await bindings.DOCUMENTS.put(fileKey, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  }
  const createdAt = new Date().toISOString();
  const result = await bindings.DB.prepare(`INSERT INTO documents (name, type, vehicle, plate, expiration_date, file_name, file_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(data.get('name'), data.get('type'), data.get('vehicle'), data.get('plate'), data.get('expirationDate'), fileName, fileKey, createdAt).first<{ id: number }>();
  return Response.json({ id: result?.id, name: data.get('name'), type: data.get('type'), vehicle: data.get('vehicle'), plate: data.get('plate'), expirationDate: data.get('expirationDate'), fileName }, { status: 201 });
}
