type VpicModel = { Model_ID: number; Model_Name: string };

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const make = params.get('make')?.trim();
  const kinds =
    params.get('type') === 'motorcycle'
      ? ['moto']
      : ['car', 'multipurpose', 'truck'];
  if (!make || make.length > 80)
    return Response.json({ error: 'Marca inválida' }, { status: 400 });
  try {
    const responses = await Promise.all(
      kinds.map((kind) =>
        fetch(
          `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/vehicletype/${kind}?format=json`,
          { next: { revalidate: 86400 } },
        ),
      ),
    );
    if (responses.some((response) => !response.ok))
      throw new Error('Vehicle catalog unavailable');
    const datasets = await Promise.all(
      responses.map(
        (response) => response.json() as Promise<{ Results?: VpicModel[] }>,
      ),
    );
    const unique = new Map<string, VpicModel>();
    for (const data of datasets)
      for (const model of data.Results || [])
        if (model.Model_Name)
          unique.set(model.Model_Name.toLocaleUpperCase(), model);
    const models = [...unique.values()].sort((a, b) =>
      a.Model_Name.localeCompare(b.Model_Name),
    );
    return Response.json(
      { models },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      },
    );
  } catch {
    return Response.json(
      { error: 'No se pudo cargar el catálogo de modelos' },
      { status: 502 },
    );
  }
}
