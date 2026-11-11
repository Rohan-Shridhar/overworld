import { z } from 'zod';

export const countryCodeParamsSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,4}$/, 'code must be 2 to 4 letters'),
});

export type CountryCodeParams = z.infer<typeof countryCodeParamsSchema>;

export const provinceQuerySchema = z.object({
  countryId: z.string().trim().min(1).optional(),
});

export type ProvinceQuery = z.infer<typeof provinceQuerySchema>;

const nonNegative = z.coerce.number().finite().min(0);
const colour = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'colour must be a hex value such as #4a6fa5');

export const countryBodySchema = z.object({
  name: z.string().trim().min(2, 'name needs at least 2 characters').max(60),
  shortCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,4}$/, 'short code must be 2 to 4 letters')
    .optional(),
  flag: z.string().trim().min(1).max(8),
  capital: z.string().trim().min(2, 'capital needs at least 2 characters').max(60),
  colour,
  continent: z.string().trim().min(2).max(40),
  population: z.coerce.number().int().min(1_000, 'population must be at least 1,000').max(2_000_000_000),
  gdp: nonNegative.max(500_000),
  governmentType: z.string().trim().min(2).max(60),
  leader: z.string().trim().min(2).max(80),
  stability: z.coerce.number().int().min(0).max(100),
  description: z.string().trim().max(800).optional(),
  resources: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  economy: z
    .object({
      gdpGrowth: z.coerce.number().finite().min(-100).max(100),
      inflation: nonNegative.max(10_000),
      debt: nonNegative.max(1_000),
      currency: z.string().trim().min(1).max(40),
      tradeBalance: z.coerce.number().finite().min(-100_000).max(100_000),
    })
    .partial()
    .optional(),
  military: z
    .object({
      personnel: nonNegative.max(50_000_000),
      army: nonNegative.max(50_000_000),
      navy: nonNegative.max(50_000_000),
      airForce: nonNegative.max(50_000_000),
    })
    .partial()
    .optional(),
  government: z
    .object({
      ideology: z.string().trim().max(60),
      rulingParty: z.string().trim().max(60),
    })
    .partial()
    .optional(),
});

export const countryUpdateSchema = countryBodySchema.partial();

export type CountryBody = z.infer<typeof countryBodySchema>;
export type CountryUpdateBody = z.infer<typeof countryUpdateSchema>;

export const provinceBodySchema = z.object({
  name: z.string().trim().min(2, 'name needs at least 2 characters').max(60),
  population: z.coerce.number().int().min(0).max(500_000_000),
  terrain: z.string().trim().min(2).max(40),
  resources: z.array(z.string().trim().min(1).max(40)).max(8),
  infrastructure: z.coerce.number().int().min(0).max(100),
});

export const provinceUpdateSchema = provinceBodySchema.partial();

export type ProvinceBody = z.infer<typeof provinceBodySchema>;
export type ProvinceUpdateBody = z.infer<typeof provinceUpdateSchema>;

export const provinceIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export type ProvinceIdParams = z.infer<typeof provinceIdParamsSchema>;

export const transferBodySchema = z.object({
  targetCode: z.string().trim().regex(/^[A-Za-z]{2,4}$/, 'targetCode must be 2 to 4 letters'),
});

export type TransferBody = z.infer<typeof transferBodySchema>;
