import { describe, expect, it } from 'vitest';
import { canAcceptInvitation, nextLeader } from '../src/diplomacy/alliance.service.js';
import { evaluateNegotiation } from '../src/diplomacy/negotiation.rules.js';
import { defaultClausesFor, validateTreatyDraft } from '../src/diplomacy/treaty.service.js';

const friendly = {
  status: 'recognised',
  score: 78,
  trust: 82,
  tradeDependency: 66,
  militaryThreat: 12,
  strategicImportance: 70,
};

const hostile = {
  status: 'recognised',
  score: -62,
  trust: 14,
  tradeDependency: 8,
  militaryThreat: 86,
  strategicImportance: 25,
};

const proposal = {
  kind: 'treaty',
  durationDays: 360,
  obligations: ['Border recognition'],
  asksMilitarySupport: false,
  offersConcession: false,
};

describe('treaty validation', () => {
  it('accepts a complete draft', () => {
    const errors = validateTreatyDraft({
      name: 'Northern trade accord',
      type: 'trade',
      parties: ['AUR', 'KET'],
      durationDays: 360,
      clauses: [{ title: 'Tariffs', obligation: 'Cut tariffs on grain.' }],
    });

    expect(errors).toEqual([]);
  });

  it('rejects fewer than two parties, short terms and empty clauses', () => {
    const errors = validateTreatyDraft({
      name: 'Bad draft',
      type: 'trade',
      parties: ['AUR'],
      durationDays: 5,
      clauses: [],
    });

    expect(errors).toContain('a treaty needs at least two parties');
    expect(errors.some((error) => error.startsWith('duration must be'))).toBe(true);
    expect(errors).toContain('a treaty needs at least one clause');
  });

  it('supplies template clauses when the builder sends none', () => {
    expect(defaultClausesFor({ type: 'mutual_defence' }).length).toBeGreaterThan(0);
    expect(defaultClausesFor({ type: 'trade' })[0]?.obligation).toBeTruthy();
  });
});

describe('negotiation rules', () => {
  it('accepts a proposal from a trusted partner', () => {
    const result = evaluateNegotiation(friendly, proposal, {
      recognised: true,
      sharedAlliance: true,
      activeTreaties: [],
    });

    expect(result.outcome).toBe('accepted');
    expect(result.score).toBeGreaterThanOrEqual(result.threshold);
    expect(result.explanation).toContain('Accepted');
    expect(result.factors.length).toBeGreaterThan(3);
  });

  it('rejects a proposal from a hostile state', () => {
    const result = evaluateNegotiation(hostile, proposal, {
      recognised: true,
      sharedAlliance: false,
      activeTreaties: [],
    });

    expect(result.outcome).toBe('rejected');
    expect(result.counterProposal).toBeNull();
  });

  it('counter-proposes in the middle band with a shorter term', () => {
    const middling = {
      status: 'recognised',
      score: 8,
      trust: 48,
      tradeDependency: 30,
      militaryThreat: 50,
      strategicImportance: 45,
    };

    const result = evaluateNegotiation(middling, proposal, {
      recognised: true,
      sharedAlliance: false,
      activeTreaties: [],
    });

    expect(result.outcome).toBe('counter');
    expect(result.counterProposal?.durationDays).toBeLessThan(proposal.durationDays);
    expect(result.counterProposal?.obligations.length).toBeLessThanOrEqual(proposal.obligations.length);
  });

  it('refuses everything except recognition when relations are severed', () => {
    const result = evaluateNegotiation({ ...friendly, status: 'severed' }, proposal, {
      recognised: true,
      sharedAlliance: false,
      activeTreaties: [],
    });

    expect(result.outcome).toBe('rejected');
    expect(result.explanation).toContain('severed');
  });
});

describe('alliance membership rules', () => {
  const base = {
    memberCount: 3,
    maxMembers: 12,
    relationScore: 40,
    recognised: true,
    requiresRecognition: true,
    minRelationScore: 15,
  };

  it('admits a state that meets every requirement', () => {
    expect(canAcceptInvitation(base).allowed).toBe(true);
  });

  it('refuses a full alliance', () => {
    expect(canAcceptInvitation({ ...base, memberCount: 12 }).allowed).toBe(false);
  });

  it('refuses an unrecognised state when recognition is required', () => {
    expect(canAcceptInvitation({ ...base, recognised: false }).allowed).toBe(false);
  });

  it('refuses a state below the relation floor and explains why', () => {
    const result = canAcceptInvitation({ ...base, relationScore: 4 });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('below the required');
  });

  it('hands leadership to a remaining member', () => {
    expect(nextLeader(['AUR', 'KET'], 'AUR')).toBe('KET');
  });
});
