const KEYPOINT_SCORE_MIN = 0.25;
const TORSO_KEYPOINTS = [
  "left_shoulder",
  "right_shoulder",
  "left_hip",
  "right_hip"
];

// Bare-minimum prototype: easy to trigger, expects more false positives.
const DEFAULTS = {
  dropThreshold: 0.04,
  velocityThreshold: 0.08,
  lowTorsoOffset: 0.05,
  holdSeconds: 0.5,
  cooldownSeconds: 8,
  minTorsoPoints: 2
};

function kpByName(pose, name) {
  return pose.keypoints.find((k) => k.name === name && (k.score ?? 0) >= KEYPOINT_SCORE_MIN);
}

function getTorsoMetrics(pose, frameHeight, minTorsoPoints) {
  const points = TORSO_KEYPOINTS.map((name) => kpByName(pose, name)).filter(Boolean);

  if (points.length < minTorsoPoints) {
    return null;
  }

  const torsoYpx = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return {
    torsoY: torsoYpx / frameHeight,
    pointCount: points.length,
    usedKeypoints: points.map((point) => point.name)
  };
}

/**
 * Simplified fall detector for prototype use.
 *
 * Uses shoulder/hip keypoints only (torso region). Needs at least 2 of those 4
 * points visible; all 4 are not required.
 *
 * Heuristic:
 * 1) Detect a quick downward torso movement.
 * 2) Confirm torso stays lower than baseline briefly.
 * 3) Emit one alarm, then cooldown.
 */
export function createFallDetector(config = {}) {
  const t = { ...DEFAULTS, ...config };
  let baselineTorsoY = null;
  let lastTorsoY = null;
  let lastTime = null;
  let candidateStart = null;
  let alarmedAt = null;

  return function detectFall(pose, _frameWidth, frameHeight, nowMs) {
    const torso = getTorsoMetrics(pose, frameHeight, t.minTorsoPoints);
    if (!torso) {
      return { isFall: false, reason: "insufficient_keypoints" };
    }

    const { torsoY, pointCount, usedKeypoints } = torso;

    if (baselineTorsoY === null) {
      baselineTorsoY = torsoY;
    } else {
      baselineTorsoY = baselineTorsoY * 0.98 + torsoY * 0.02;
    }

    let velocity = 0;
    if (lastTorsoY !== null && lastTime !== null) {
      const dt = Math.max((nowMs - lastTime) / 1000, 0.016);
      velocity = (torsoY - lastTorsoY) / dt;
    }

    const droppedBy = torsoY - baselineTorsoY;
    const isRapidDrop =
      droppedBy > t.dropThreshold || velocity > t.velocityThreshold;
    const staysLow = torsoY > baselineTorsoY + t.lowTorsoOffset;

    const inCooldown =
      alarmedAt !== null && (nowMs - alarmedAt) / 1000 < t.cooldownSeconds;
    if (inCooldown) {
      lastTorsoY = torsoY;
      lastTime = nowMs;
      return {
        isFall: false,
        reason: "cooldown",
        droppedBy,
        velocity,
        pointCount,
        usedKeypoints
      };
    }

    if (isRapidDrop && candidateStart === null) {
      candidateStart = nowMs;
    }

    if (candidateStart !== null) {
      if (!staysLow) {
        candidateStart = null;
      } else {
        const heldFor = (nowMs - candidateStart) / 1000;
        if (heldFor >= t.holdSeconds) {
          candidateStart = null;
          alarmedAt = nowMs;
          lastTorsoY = torsoY;
          lastTime = nowMs;
          return {
            isFall: true,
            reason: "rapid_drop_then_stays_low",
            droppedBy,
            velocity,
            pointCount,
            usedKeypoints
          };
        }
      }
    }

    lastTorsoY = torsoY;
    lastTime = nowMs;
    return {
      isFall: false,
      reason: "monitoring",
      droppedBy,
      velocity,
      pointCount,
      usedKeypoints
    };
  };
}
