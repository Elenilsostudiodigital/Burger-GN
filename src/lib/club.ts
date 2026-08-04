/**
 * Pure helpers for Clube Burger stamp/reward math.
 */

export type StampAwardResult = {
  stampsAdded: number;
  stampCountAfter: number;
  freeBurgersGranted: number;
  freeBurgersAvailableAfter: number;
};

/**
 * Awards 1 stamp per completed purchase. When the stamp count reaches the
 * configured goal (default 12), grants 1 free burger and resets the surplus stamps.
 */
export function applyStampReward(params: {
  currentStamps: number;
  currentFreeBurgers: number;
  purchasesRequired: number;
  stampsToAdd?: number;
}): StampAwardResult {
  const stampsToAdd = params.stampsToAdd ?? 1;
  const required = Math.max(1, params.purchasesRequired);

  let stamps = params.currentStamps + stampsToAdd;
  let freeBurgers = params.currentFreeBurgers;
  let granted = 0;

  while (stamps >= required) {
    stamps -= required;
    freeBurgers += 1;
    granted += 1;
  }

  return {
    stampsAdded: stampsToAdd,
    stampCountAfter: stamps,
    freeBurgersGranted: granted,
    freeBurgersAvailableAfter: freeBurgers,
  };
}

export function progressPercent(stampCount: number, purchasesRequired: number): number {
  const required = Math.max(1, purchasesRequired);
  return Math.min(100, Math.round((stampCount / required) * 100));
}
