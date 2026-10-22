// The caller has just propagated the complete scene after all world updates.
// Reuse those matrices for ONE synchronous main draw. Do not wrap independent
// renders/preparation, or any callback that changes object transforms.
export function withPreparedWorldMatrices(scene, draw, enabled = true) {
  if (!enabled) return draw();
  const previous = scene.matrixWorldAutoUpdate;
  try {
    scene.matrixWorldAutoUpdate = false;
    return draw();
  } finally {
    scene.matrixWorldAutoUpdate = previous;
  }
}
