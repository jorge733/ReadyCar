type VpicMake = { MakeId: number; MakeName: string };

export async function GET(request: Request): Promise<Response> {
  const kinds =
    new URL(request.url).searchParams.get('type') === 'motorcycle'
      ? ['moto']
      : ['car', 'multipurpose', 'truck'];
  try {
    const responses = await Promise.all(
      kinds.map((kind) =>
        fetch(
          `https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/${kind}?format=json`,
          { next: { revalidate: 86400 } },
        ),
      ),
    );
    if (responses.some((response) => !response.ok))
      throw new Error('Vehicle catalog unavailable');
    const datasets = await Promise.all(
      responses.map(
        (response) => response.json() as Promise<{ Results?: VpicMake[] }>,
      ),
    );
    const unique = new Map<string, VpicMake>();
    for (const data of datasets)
      for (const make of data.Results || [])
        if (make.MakeName) unique.set(make.MakeName.toLocaleUpperCase(), make);
    const makes = [...unique.values()].sort((a, b) =>
      a.MakeName.localeCompare(b.MakeName),
    );
    return Response.json(
      { makes },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      },
    );
  } catch {
    return Response.json(
      { error: 'No se pudo cargar el catálogo de marcas' },
      { status: 502 },
    );
  }
}
