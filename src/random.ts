export type RandomSource = () => number;

export function checkedRandom(random: RandomSource): RandomSource {
  return () => {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
      throw new RangeError("Random source must return a number in [0, 1)");
    }
    return draw;
  };
}
