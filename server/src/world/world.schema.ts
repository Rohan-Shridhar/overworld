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
