// useBehaviorTracker.js
import { useEffect, useState, useRef } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";

export function useBehaviorTracker(videoRef, enabled = false) {
  const [behavior, setBehavior] = useState({
    facePresent: 0,
    lookingAway: 0,
    gazeScore: 0,
    headPose: { yaw: 0, pitch: 0, roll: 0 },
    blinkRate: 0,
    fidgetScore: 0,
    engagement: 0,
  });

  // internal refs for state that shouldn't trigger re-renders per frame
  const rafRef = useRef(null);
  const faceMeshRef = useRef(null);
  const prevNoseRef = useRef(null);
  const blinkCounterRef = useRef(0);
  const lastBlinkTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) {
      // When disabled, stop RAF loop, reset behavior and clean faceMesh
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close?.();
        } catch {}
        faceMeshRef.current = null;
      }
      prevNoseRef.current = null;
      blinkCounterRef.current = 0;
      lastBlinkTimeRef.current = Date.now();
      setBehavior({
        facePresent: 0,
        lookingAway: 1,
        gazeScore: 0,
        headPose: { yaw: 0, pitch: 0, roll: 0 },
        blinkRate: 0,
        fidgetScore: 0,
        engagement: 0,
      });
      return;
    }

    // enabled === true
    if (!videoRef?.current) return;

    // Initialize FaceMesh once
    const faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    faceMeshRef.current = faceMesh;

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    faceMesh.onResults((results) => {
      // We will not set RAF here; we update behavior from this callback
      if (!results || !results.multiFaceLandmarks?.length) {
        setBehavior({
          facePresent: 0,
          lookingAway: 1,
          gazeScore: 0,
          headPose: { yaw: 0, pitch: 0, roll: 0 },
          blinkRate: 0,
          fidgetScore: 0,
          engagement: 0,
        });
        return;
      }

      const lm = results.multiFaceLandmarks[0];

      // head pose estimate (simple)
      const nose = lm[1];
      const leftEye = lm[33];
      const rightEye = lm[263];

      const yaw = nose.x - 0.5;
      const pitch = nose.y - 0.5;
      const roll = leftEye.y - rightEye.y;

      // gaze using iris vs eye center
      const leftIris = lm[468];
      const rightIris = lm[473];
      const gazeLeft = leftIris?.x - leftEye?.x || 0;
      const gazeRight = rightIris?.x - rightEye?.x || 0;
      const gazeScore = 1 - Math.min(Math.abs(gazeLeft) + Math.abs(gazeRight), 0.5);

      // blink detection: use larger threshold
      const eyeTop = lm[159];
      const eyeBottom = lm[145];
      const eyeOpen = eyeBottom?.y - eyeTop?.y || 0;
      const BLINK_THRESHOLD = 0.015; // tuned for typical webcam scale

      if (eyeOpen < BLINK_THRESHOLD) {
        if (Date.now() - lastBlinkTimeRef.current > 150) {
          blinkCounterRef.current++;
          lastBlinkTimeRef.current = Date.now();
        }
      }
      const elapsed = Math.max(1, (Date.now() - lastBlinkTimeRef.current) / 1000);
      const blinkRate = blinkCounterRef.current / elapsed;

      // fidget: nose movement delta
      let fidget = 1;
      if (prevNoseRef.current) {
        const dx = Math.abs(prevNoseRef.current.x - nose.x);
        const dy = Math.abs(prevNoseRef.current.y - nose.y);
        fidget = 1 - Math.min(dx + dy, 0.2);
      }
      prevNoseRef.current = nose;

      // engagement: balanced and clamped
      let engagement =
        0.4 * Math.max(0, Math.min(1, gazeScore)) +
        0.2 * Math.max(0, Math.min(1, 1 - Math.abs(yaw))) +
        0.2 * Math.max(0, Math.min(1, fidget)) +
        0.2 * Math.max(0, Math.min(1, 1 - blinkRate));

      engagement = Math.max(0, Math.min(1, engagement));

      setBehavior({
        facePresent: 1,
        lookingAway: gazeScore < 0.5 ? 1 : 0,
        gazeScore,
        headPose: { yaw, pitch, roll },
        blinkRate,
        fidgetScore: fidget,
        engagement,
      });
    });

    // RAF loop: call faceMesh.send with the video element as image
    const runLoop = async () => {
      try {
        const videoEl = videoRef.current;
        // Only send if video element has data
        if (videoEl && videoEl.readyState >= 2) {
          await faceMeshRef.current.send({ image: videoEl });
        }
      } catch (e) {
        // ignore intermittent errors (camera not ready)
        // console.warn("faceMesh send error", e);
      } finally {
        rafRef.current = requestAnimationFrame(runLoop);
      }
    };

    // start the loop
    rafRef.current = requestAnimationFrame(runLoop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close?.();
        } catch {}
        faceMeshRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoRef?.current]);

  return behavior;
}
