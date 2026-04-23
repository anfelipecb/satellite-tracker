/** NORAD IDs for default orbit / globe presets (ISS, Hubble, Tiangong, sample Starlink, Landsat-9, Terra). */
export const DEFAULT_INTERESTING_NORAD = [25544, 20580, 48274, 44713, 49260, 25994] as const;

export type GlobeCategoryFilter =
  | 'all'
  | 'iss'
  | 'starlink'
  | 'hubble'
  | 'weather'
  | 'spacex';

export function satelliteMatchesCategory(
  name: string,
  category: string[] | null | undefined,
  filter: GlobeCategoryFilter
): boolean {
  if (filter === 'all') return true;
  const n = name.toUpperCase();
  const c = (category ?? []).map((x) => x.toUpperCase());
  const catStr = c.join(' ');
  switch (filter) {
    case 'iss':
      return /ISS|ZARYA|TIANGONG|\/CSS|STATION/.test(n) || /TIANGONG|ZARYA/.test(catStr);
    case 'starlink':
      return n.includes('STARLINK') || c.some((x) => x.includes('STARLINK'));
    case 'hubble':
      return n.includes('HUBBLE') || n.includes('LANDSAT') || n.includes('SENTINEL') || /EARTH|IMAGING|RADIOMETER/.test(catStr);
    case 'weather':
      return /NOAA|GOES|METEOSAT|NPP|AQUA|TERRA|MODIS|WEATHER|METOP/.test(n) || /WEATHER|NPP|EOS/.test(catStr);
    case 'spacex':
      return /FALCON|STARLINK|SPACEX|DRAGON|TRANSPORTER/.test(n) || c.some((x) => x.includes('FALCON') || x.includes('STARLINK'));
    default:
      return true;
  }
}
