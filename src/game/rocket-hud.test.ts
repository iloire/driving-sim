import { describe, expect, it } from 'vitest';
import { missionClock } from './rocket-hud';

describe('missionClock', () => {
  it('counts down to zero and up after it, in hours, minutes and seconds', () => {
    expect(missionClock(-10)).toBe('T−00:00:10');
    expect(missionClock(-0.4)).toBe('T−00:00:00');
    expect(missionClock(0)).toBe('T+00:00:00');
    expect(missionClock(389.7)).toBe('T+00:06:29');
    expect(missionClock(3725)).toBe('T+01:02:05');
  });
});
