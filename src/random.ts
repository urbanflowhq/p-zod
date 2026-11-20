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

export function checkedUniform(uniform: number): number {
  if (!Number.isFinite(uniform) || uniform < 0 || uniform >= 1) {
    throw new RangeError("Uniform must be a number in [0, 1)");
  }
  return uniform;
}
