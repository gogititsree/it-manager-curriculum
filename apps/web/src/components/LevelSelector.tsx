/**
 * Per-topic level selector: three segmented buttons. Rusty gets a tooltip
 * ("I used to know this well; give me the refresher"). Persists via putTopicSettings.
 *
 * `available` marks which levels the caller will let you pick. A level that is not available is
 * disabled rather than removed, so the three-level shape of every topic stays visible even while
 * most of the curriculum is still being written.
 */
import { LEVELS, type Level } from '@itmc/core';
import { Segmented } from './Segmented';

const LABEL: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', rusty: 'Rusty' };
const HINT: Record<Level, string> = {
  beginner: 'Assume nothing; build the mental model from scratch.',
  intermediate: 'You know the basics; go deeper and see real-world patterns.',
  rusty: 'You used to know this well. Fast refresher plus what changed.',
};

export function LevelSelector({
  value,
  onChange,
  available,
}: {
  value: Level;
  onChange: (l: Level) => void;
  available: Level[];
}) {
  return (
    <Segmented
      label="Level"
      value={value}
      onChange={onChange}
      options={LEVELS.map((l) => ({
        value: l,
        label: LABEL[l],
        hint: HINT[l],
        disabled: !available.includes(l),
      }))}
    />
  );
}
