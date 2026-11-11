import { describe, expect, it } from 'vitest';
import {
  decide,
  isDecisionDue,
  runElection,
  scoreActions,
  type Constraints,
  type CountryProfile,
  type WorldSnapshot,
} from '../src/ai/country-ai.rules.js';

const profile: CountryProfile = {
  code: 'AUR',
  objectives: ['territorial_security', 'military_strength'],
  riskTolerance: 70,
  diplomacyWeight: 40,
  economyWeight: 40,
  militaryWeight: 80,
  doctrine: 'assertive',
};

const calm: WorldSnapshot = {
  stability: 62,
  gdpGrowth: 2.1,
  inflation: 3.4,
  debt: 48,
  militaryReadiness: 55,
  threat: 22,
  allies: 1,
  rivals: 1,
  approval: 58,
  activeTreaties: 1,
};

const open: Constraints = {
  allies: ['KET'],
  rivals: ['VEL'],
  nonAggressionWith: [],
  severedWith: [],
};

describe('decision scoring', () => {
  it('rewards actions that match the stated objectives', () => {
    const scored = scoreActions(profile, calm, open);
    const readiness = scored.find((entry) => entry.kind === 'raise_readiness');
    const trade = scored.find((entry) => entry.kind === 'negotiate_trade');

    expect(readiness?.score).toBeGreaterThan(trade?.score ?? 0);
  });

  it('keeps blocked actions in the inspector but marks them ineligible', () => {
    const scored = scoreActions(profile, { ...calm, threat: 20 }, open);
    const borders = scored.find((entry) => entry.kind === 'reinforce_borders');

    expect(borders?.eligible).toBe(false);
    expect(borders?.reason).toBe('No border pressure');
  });

  it('is deterministic for identical inputs', () => {
    expect(decide(profile, calm, open)).toEqual(decide(profile, calm, open));
  });
});

describe('treaty compliance', () => {
  it('forbids hostile action and mobilisation under a non-aggression pact', () => {
    const constrained: Constraints = { ...open, nonAggressionWith: ['KET'] };
    const decision = decide(profile, { ...calm, threat: 80 }, constrained);

    expect(decision.action).not.toBe('mobilise');
    expect(decision.action).not.toBe('reduce_relations');
    expect(decision.rejected.some((entry) => entry.reason.includes('Non-aggression'))).toBe(true);
  });

  it('refuses to mobilise without a rival', () => {
    const decision = decide(profile, { ...calm, threat: 90 }, { ...open, rivals: [] });

    expect(decision.rejected.some((entry) => entry.reason === 'No rival to mobilise against')).toBe(true);
  });

  it('honours disabled decision domains', () => {
    const decision = decide(profile, { ...calm, threat: 90 }, {
      ...open,
      militaryDecisionsEnabled: false,
      diplomaticDecisionsEnabled: false,
    });

    expect(decision.action).not.toBe('mobilise');
    expect(decision.action).not.toBe('improve_relations');
    expect(decision.domain).toBe('economic');
  });
});

describe('autonomy scheduling', () => {
  it('uses a slower cadence at low autonomy', () => {
    expect(isDecisionDue('low', 11, 0)).toBe(false);
    expect(isDecisionDue('low', 12, 0)).toBe(true);
  });

  it('deliberates far more often at high autonomy', () => {
    expect(isDecisionDue('high', 3, 0)).toBe(true);
    expect(isDecisionDue('medium', 3, 0)).toBe(false);
  });

  it('never deliberates for a paused state', () => {
    expect(isDecisionDue('high', 300, 0, true)).toBe(false);
  });
});

describe('elections', () => {
  it('removes an incumbent with a shrinking economy and low approval', () => {
    const result = runElection({
      approval: 30,
      gdpGrowth: -1.8,
      stability: 40,
      incumbentPerformance: 35,
      seed: 'AUR',
      day: 40,
    });

    expect(result.leaderChanged).toBe(true);
    expect(result.reason).toContain('Incumbent lost');
  });

  it('retains an incumbent with strong approval and growth', () => {
    const result = runElection({
      approval: 72,
      gdpGrowth: 3.4,
      stability: 70,
      incumbentPerformance: 75,
      seed: 'KET',
      day: 40,
    });

    expect(result.leaderChanged).toBe(false);
    expect(result.incumbentVoteShare).toBeGreaterThan(45);
  });

  it('produces the same election twice for the same seed and day', () => {
    const input = { approval: 52, gdpGrowth: 1.2, stability: 55, incumbentPerformance: 50, seed: 'VEL', day: 12 };

    expect(runElection(input)).toEqual(runElection(input));
  });
});
