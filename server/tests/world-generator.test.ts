import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/generator/world-generator.js';
import type { Geometry } from '../src/world/generator/geometry.js';

const world = generateWorld('generation-test-seed');

function rings(geometry: Geometry): number[][][] {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

describe('world generation', () => {
  it('produces byte-identical output for the same seed', () => {
    expect(JSON.stringify(generateWorld('alpha'))).toBe(JSON.stringify(generateWorld('alpha')));
  });

  it('produces a different world for a different seed', () => {
    expect(JSON.stringify(generateWorld('alpha'))).not.toBe(JSON.stringify(generateWorld('beta')));
  });

  it('generates between five and seven continents holding thirty countries', () => {
    expect(world.continentCount).toBeGreaterThanOrEqual(5);
    expect(world.continentCount).toBeLessThanOrEqual(7);
    expect(world.countries).toHaveLength(30);
    expect(world.countryCount).toBe(30);
    expect(new Set(world.countries.map((country) => country.continent)).size).toBe(
      world.continentCount,
    );
  });

  it('keeps country names, short codes and colours unique', () => {
    expect(new Set(world.countries.map((country) => country.name)).size).toBe(30);
    expect(new Set(world.countries.map((country) => country.shortCode)).size).toBe(30);
    expect(new Set(world.countries.map((country) => country.colour)).size).toBe(30);
  });

  it('gives every country provinces that reference their owner', () => {
    world.countries.forEach((country) => {
      expect(country.provinces.length).toBeGreaterThanOrEqual(3);

      country.provinces.forEach((province) => {
        expect(province.name.length).toBeGreaterThan(2);
        expect(province.currentOwner).toBe(country.name);
        expect(province.currentController).toBe(country.name);
        expect(province.geometry.type).toMatch(/^(Multi)?Polygon$/);
        expect(province.population).toBeGreaterThan(0);
        expect(province.infrastructure).toBeGreaterThanOrEqual(0);
        expect(province.infrastructure).toBeLessThanOrEqual(100);
        expect(province.resources.length).toBeGreaterThan(0);
      });
    });
  });

  it('closes every ring and keeps coordinates inside the world bounds', () => {
    world.countries.forEach((country) => {
      rings(country.geometry).forEach((ring) => {
        expect(ring.length).toBeGreaterThanOrEqual(4);

        const first = ring[0] as [number, number];
        const last = ring[ring.length - 1] as [number, number];

        expect(last[0]).toBeCloseTo(first[0], 5);
        expect(last[1]).toBeCloseTo(first[1], 5);

        ring.forEach(([lon, lat]) => {
          expect(lon).toBeGreaterThanOrEqual(-180);
          expect(lon).toBeLessThanOrEqual(180);
          expect(lat).toBeGreaterThanOrEqual(-90);
          expect(lat).toBeLessThanOrEqual(90);
        });
      });
    });
  });

  it('derives plausible country statistics', () => {
    world.countries.forEach((country) => {
      expect(country.shortCode).toMatch(/^[A-Z]{2,4}$/);
      expect(country.colour).toMatch(/^#[0-9a-f]{6}$/i);
      expect(country.population).toBeGreaterThan(0);
      expect(country.gdp).toBeGreaterThan(0);
      expect(country.stability).toBeGreaterThanOrEqual(0);
      expect(country.stability).toBeLessThanOrEqual(100);
      expect(country.capital.length).toBeGreaterThan(3);
      expect(country.leader.split(' ')).toHaveLength(2);
      expect(country.description.length).toBeGreaterThan(10);
    });
  });
});
