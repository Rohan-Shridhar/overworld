import { Router } from 'express';
import { z } from 'zod';
import { ensureDefaultWorld } from '../world/world.service.js';
import { AppError } from '../utils/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  actOnAlliance,
  createAlliance,
  inviteToAlliance,
  listAlliances,
  respondToInvitation,
} from './alliance.service.js';
import {
  getDiplomacyNetwork,
  getDiplomacyOverview,
  performDiplomaticAction,
  requestNegotiation,
} from './diplomacy.service.js';
import { TREATY_TEMPLATES, TREATY_TYPES } from './diplomacy.constants.js';
import {
  actOnTreaty,
  createTreaty,
  expireTreaties,
  getDiplomacyModifiers,
  listTreaties,
} from './treaty.service.js';
import { getCurrentDay } from './diplomacy.store.js';

const code = z.string().trim().regex(/^[A-Za-z]{2,4}$/);
const actionBody = z.object({
  counterpartCode: code,
  action: z.enum(['improve', 'reduce', 'recognise', 'sever', 'message', 'warning', 'request_negotiation']),
  subject: z.string().max(160).optional(),
  body: z.string().max(1200).optional(),
});
const negotiationBody = z.object({
  counterpartCode: code,
  kind: z.enum(['treaty', 'alliance', 'recognition', 'trade', 'peace']),
  durationDays: z.number().int().min(30).max(1800).optional(),
  obligations: z.array(z.string().max(160)).max(8).optional(),
  asksMilitarySupport: z.boolean().optional(),
  offersConcession: z.boolean().optional(),
  treaty: z
    .object({
      name: z.string().trim().min(3).max(120),
      type: z.enum(TREATY_TYPES),
      template: z.string().optional(),
      renewal: z.enum(['none', 'auto', 'renegotiate']).optional(),
      clauses: z
        .array(
          z.object({
            title: z.string().trim().min(2).max(120),
            obligation: z.string().trim().min(2).max(400),
            condition: z.string().max(240).optional(),
            penalty: z.string().max(240).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
const allianceBody = z.object({
  founderCode: code,
  name: z.string().trim().min(3).max(80),
  description: z.string().max(400).optional(),
  emblem: z.string().max(4).optional(),
  type: z.enum(['military', 'economic', 'political', 'non_aggression', 'strategic', 'intelligence', 'regional']),
  charter: z.string().max(2000).optional(),
  votingRules: z.enum(['unanimous', 'majority', 'leader']).optional(),
  durationDays: z.number().int().min(30).max(1800).optional(),
});
const treatyBody = z.object({
  proposedBy: code,
  name: z.string().trim().min(3).max(120),
  type: z.enum(TREATY_TYPES),
  template: z.string().optional(),
  parties: z.array(code).min(1).max(11),
  durationDays: z.number().int().min(30).max(1800).optional(),
  renewal: z.enum(['none', 'auto', 'renegotiate']).optional(),
  clauses: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(120),
        obligation: z.string().trim().min(2).max(400),
        condition: z.string().max(240).optional(),
        penalty: z.string().max(240).optional(),
      }),
    )
    .optional(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw AppError.badRequest(result.error.issues.map((issue) => issue.message).join('; '));
  }

  return result.data;
}

async function world() {
  const record = await ensureDefaultWorld();

  return record._id;
}

export const diplomacyRouter = Router();

diplomacyRouter.get(
  '/network',
  asyncHandler(async (_request, res) => {
    const network = await getDiplomacyNetwork(await world());

    res.json({ success: true, data: network });
  }),
);

diplomacyRouter.get(
  '/templates',
  asyncHandler(async (_request, res) => {
    res.json({ success: true, data: { templates: Object.values(TREATY_TEMPLATES) } });
  }),
);

diplomacyRouter.get(
  '/countries/:code',
  asyncHandler(async (request, res) => {
    const parsed = parse(code, request.params.code);
    const overview = await getDiplomacyOverview(await world(), parsed.toUpperCase());

    res.json({ success: true, data: overview });
  }),
);

diplomacyRouter.post(
  '/relations/:code/actions',
  asyncHandler(async (request, res) => {
    const from = parse(code, request.params.code).toUpperCase();
    const body = parse(actionBody, request.body);
    const result = await performDiplomaticAction(
      await world(),
      from,
      body.counterpartCode.toUpperCase(),
      { action: body.action, subject: body.subject, body: body.body },
    );

    res.json({ success: true, data: result });
  }),
);

diplomacyRouter.post(
  '/negotiations',
  asyncHandler(async (request, res) => {
    const body = parse(negotiationBody, request.body);
    const proposer = parse(code, (request.query.code ?? request.body.proposerCode) as string);

    const result = await requestNegotiation(await world(), proposer.toUpperCase(), {
      ...body,
      counterpartCode: body.counterpartCode.toUpperCase(),
    });

    res.json({ success: true, data: result });
  }),
);

diplomacyRouter.get(
  '/alliances',
  asyncHandler(async (_request, res) => {
    res.json({ success: true, data: { alliances: await listAlliances(await world()) } });
  }),
);

diplomacyRouter.post(
  '/alliances',
  asyncHandler(async (request, res) => {
    const body = parse(allianceBody, request.body);
    const day = await getCurrentDay(await world());
    const alliance = await createAlliance(await world(), body.founderCode.toUpperCase(), body, day);

    res.status(201).json({ success: true, data: { alliance } });
  }),
);

diplomacyRouter.post(
  '/alliances/:id/invitations',
  asyncHandler(async (request, res) => {
    const body = parse(z.object({ actorCode: code, targetCode: code }), request.body);
    const day = await getCurrentDay(await world());
    const invitation = await inviteToAlliance(
      await world(),
      request.params.id as string,
      body.actorCode.toUpperCase(),
      body.targetCode.toUpperCase(),
      day,
    );

    res.status(201).json({ success: true, data: { invitation } });
  }),
);

diplomacyRouter.post(
  '/invitations/:id/respond',
  asyncHandler(async (request, res) => {
    const body = parse(z.object({ accept: z.boolean() }), request.body);
    const day = await getCurrentDay(await world());
    const invitation = await respondToInvitation(await world(), request.params.id as string, body.accept, day);

    res.json({ success: true, data: { invitation } });
  }),
);

diplomacyRouter.post(
  '/alliances/:id/actions',
  asyncHandler(async (request, res) => {
    const body = parse(
      z.object({
        actorCode: code,
        action: z.enum(['leave', 'expel', 'dissolve', 'edit']),
        targetCode: code.optional(),
        charter: z.string().max(2000).optional(),
        description: z.string().max(400).optional(),
        votingRules: z.enum(['unanimous', 'majority', 'leader']).optional(),
      }),
      request.body,
    );
    const day = await getCurrentDay(await world());
    const alliance = await actOnAlliance(
      await world(),
      request.params.id as string,
      body.actorCode.toUpperCase(),
      body.action,
      day,
      body,
    );

    res.json({ success: true, data: { alliance } });
  }),
);

diplomacyRouter.get(
  '/treaties',
  asyncHandler(async (_request, res) => {
    res.json({ success: true, data: { treaties: await listTreaties(await world()) } });
  }),
);

diplomacyRouter.post(
  '/treaties',
  asyncHandler(async (request, res) => {
    const body = parse(treatyBody, request.body);
    const day = await getCurrentDay(await world());
    const treaty = await createTreaty(await world(), body.proposedBy.toUpperCase(), body, day);

    res.status(201).json({ success: true, data: { treaty } });
  }),
);

diplomacyRouter.post(
  '/treaties/:id/actions',
  asyncHandler(async (request, res) => {
    const body = parse(
      z.object({
        actorCode: code,
        action: z.enum(['propose', 'accept', 'negotiate', 'terminate', 'renew', 'violate']),
        note: z.string().max(400).optional(),
      }),
      request.body,
    );
    const day = await getCurrentDay(await world());
    const treaty = await actOnTreaty(
      await world(),
      request.params.id as string,
      body.actorCode.toUpperCase(),
      body.action,
      day,
      body.note,
    );

    res.json({ success: true, data: { treaty } });
  }),
);

/** Runs the maintenance pass by hand; the tick calls the same functions. */
diplomacyRouter.post(
  '/maintenance',
  asyncHandler(async (_request, res) => {
    const day = await getCurrentDay(await world());
    const expired = await expireTreaties(await world(), day);
    const modifiers = await getDiplomacyModifiers(await world());

    res.json({
      success: true,
      data: { day, ...expired, modifiedCountries: modifiers.size },
    });
  }),
);
