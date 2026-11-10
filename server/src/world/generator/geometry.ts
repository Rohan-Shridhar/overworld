import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';

export type Position = [number, number];
export type Ring = Position[];

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Ring[];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Ring[][];
}

export type Geometry = PolygonGeometry | MultiPolygonGeometry;

/** Polygon-clipping expects a polygon (rings) or a multipolygon, never a bare ring. */
export type ClipGeom = Ring[] | Ring[][];

export const roundCoordinate = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Irregular closed ring — the basis of every fictional coastline. */
export function createRadialRing(
  center: Position,
  radiusLon: number,
  radiusLat: number,
  vertexCount: number,
  random: { next: () => number; range: (min: number, max: number) => number },
  roughness = 0.3,
): Ring {
  const ring: Ring = [];

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const angle = (vertex / vertexCount) * Math.PI * 2;
    const wobble = 1 - roughness / 2 + random.next() * roughness;

    ring.push([
      roundCoordinate(center[0] + Math.cos(angle) * radiusLon * wobble),
      roundCoordinate(center[1] + Math.sin(angle) * radiusLat * wobble),
    ]);
  }

  ring.push([ring[0]![0], ring[0]![1]]);

  return ring;
}

export function polygonBounds(geometry: Geometry): [number, number, number, number] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;

  polygons.forEach((rings) => {
    (rings[0] ?? []).forEach(([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
  });

  return [minLon, minLat, maxLon, maxLat];
}

/** Area-weighted centre of the largest ring, good enough for map labels and camera moves. */
export function polygonCentroid(geometry: Geometry): Position {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  let best: Ring = [];
  let bestLength = 0;

  polygons.forEach((rings) => {
    const outer = rings[0] ?? [];
    if (outer.length > bestLength) {
      best = outer;
      bestLength = outer.length;
    }
  });

  if (best.length === 0) return [0, 0];

  const points = best.slice(0, -1);
  const total = points.reduce<Position>((acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat], [0, 0]);

  return [roundCoordinate(total[0] / points.length), roundCoordinate(total[1] / points.length)];
}

export function pointInRing(point: Position, ring: Ring): boolean {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index] as Position;
    const [previousX, previousY] = ring[previous] as Position;

    const intersects =
      y > point[1] !== previousY > point[1] &&
      point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;

    if (intersects) inside = !inside;
  }

  return inside;
}

/** Voronoi cells tile the plane, so cells of interior seeds clipped to a boundary fill it exactly. */
export function voronoiCells(
  points: Position[],
  bounds: [number, number, number, number],
): Ring[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const [minLon, minLat, maxLon, maxLat] = bounds;
    return [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ];
  }

  const voronoi = Delaunay.from(points).voronoi(bounds);

  return points.map((_, index) => {
    const cell = voronoi.cellPolygon(index);

    if (!cell) return [];

    const ring: Ring = cell.map(([lon, lat]) => [roundCoordinate(lon), roundCoordinate(lat)]);

    const first = ring[0];
    const last = ring[ring.length - 1];

    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      ring.push([first[0], first[1]]);
    }

    return ring;
  });
}

export function toClipGeom(geometry: Geometry): ClipGeom {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates;
}

function toGeometry(multi: Ring[][]): Geometry | null {
  const polygons = multi.filter((rings) => (rings[0] ?? []).length >= 4);

  if (polygons.length === 0) return null;
  if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] as Ring[] };

  return { type: 'MultiPolygon', coordinates: polygons };
}

/** Intersects a Voronoi cell with a country or continent boundary. */
export function clipRingToGeometry(cell: Ring, boundary: Geometry): Geometry | null {
  if (cell.length < 4) return null;

  try {
    // The cell must be wrapped in a polygon array: polygon-clipping has no bare-ring geometry.
    const clipped = polygonClipping.intersection([cell], toClipGeom(boundary));

    return toGeometry(clipped as unknown as Ring[][]);
  } catch {
    return null;
  }
}

/** Rejection-samples seeds that lie inside a ring, keeping them reasonably apart. */
export function samplePointsInRing(
  ring: Ring,
  count: number,
  random: { next: () => number; range: (min: number, max: number) => number },
  minDistance = 0,
): Position[] {
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const points: Position[] = [];
  let attempts = 0;

  while (points.length < count && attempts < count * 240) {
    attempts += 1;

    const candidate: Position = [
      roundCoordinate(random.range(minLon, maxLon)),
      roundCoordinate(random.range(minLat, maxLat)),
    ];

    if (!pointInRing(candidate, ring)) continue;

    const tooClose =
      minDistance > 0 &&
      points.some(
        ([lon, lat]) => Math.hypot(lon - candidate[0], lat - candidate[1]) < minDistance,
      );

    if (tooClose) continue;

    points.push(candidate);
  }

  return points;
}

export function ringArea(ring: Ring): number {
  let area = 0;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index] as Position;
    const [previousX, previousY] = ring[previous] as Position;
    area += previousX * y - x * previousY;
  }

  return Math.abs(area / 2);
}
