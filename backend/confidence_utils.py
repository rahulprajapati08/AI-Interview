import librosa
import numpy as np
import parselmouth
from parselmouth.praat import call

def get_confidence_score(audio_path: str) -> float:
    try:
        # -----------------------------
        # 1. Load audio
        # -----------------------------
        y, sr = librosa.load(audio_path)
        duration = librosa.get_duration(y=y, sr=sr)

        if duration < 1.0:
            return 0.2

        # -----------------------------
        # 2. Basic features
        # -----------------------------
        rms = np.mean(librosa.feature.rms(y=y))
        zcr = np.mean(librosa.feature.zero_crossing_rate(y=y))

        # Pitch (F0) with librosa.pyin
        f0, _, _ = librosa.pyin(y, fmin=80, fmax=300)
        f0 = f0[~np.isnan(f0)]

        pitch_mean = np.mean(f0) if len(f0) > 0 else 0
        pitch_std = np.std(f0) if len(f0) > 0 else 0

        # -----------------------------
        # 3. Advanced features (Praat)
        # -----------------------------
        snd = parselmouth.Sound(audio_path)

        pitch_obj = snd.to_pitch()
        point_process = call(snd, "To PointProcess (periodic, cc)", 75, 500)

        # Correct 2024+ Praat arguments
        jitter = call(point_process, "Get jitter (local)", 0, 0, 0.02, 1.3)
        shimmer = call([snd, point_process], "Get shimmer (local)", 0, 0, 0.02, 1.3, 0.0001)
        hnr = call(snd, "Get harmonicity (cc)", 0.01, 75, 0.1, 1.0)

        # -----------------------------
        # 4. MFCC emotional tone
        # -----------------------------
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_energy = np.mean(mfcc[0])  # 0th MFCC = energy

        # -----------------------------
        # 5. Speech vs Silence
        # -----------------------------
        intervals = librosa.effects.split(y, top_db=30)
        speaking_time = sum((end - start) for start, end in intervals) / sr
        silence_ratio = 1 - (speaking_time / duration)

        # Speech rate (rough syllable approximation)
        speech_rate = speaking_time / duration

        # -----------------------------
        # 6. Normalize + weighted scoring
        # -----------------------------

        # Normalize features into 0–1
        rms_score = min(rms * 80, 1.0)
        zcr_score = min(zcr * 8, 1.0)

        pitch_var_score = 1 - min(pitch_std / 50, 1.0)
        jitter_score = 1 - min(jitter * 50, 1.0)
        shimmer_score = 1 - min(shimmer * 50, 1.0)
        hnr_score = min(hnr / 30, 1.0)
        mfcc_score = min((mfcc_energy + 300) / 400, 1.0)

        silence_penalty = 1 - min(silence_ratio * 2, 1.0)

        speech_rate_score = min(speech_rate * 2, 1.0)

        # Weighted formula (can be tuned)
        confidence = (
            0.15 * rms_score +
            0.15 * hnr_score +
            0.10 * zcr_score +
            0.10 * mfcc_score +
            0.15 * pitch_var_score +
            0.10 * jitter_score +
            0.10 * shimmer_score +
            0.10 * speech_rate_score +
            0.05 * silence_penalty
        )

        return round(confidence, 2)

    except Exception as e:
        print(f"[Confidence Error] {e}")
        return 0.5

