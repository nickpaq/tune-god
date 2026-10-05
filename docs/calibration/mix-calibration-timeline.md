# Mix calibration timeline

Everything is one pattern (pattern 1, 58 bars); render just that pattern as one WAV at 110 BPM, 4/4 (one bar is 2.1818 s). Each pattern ends with one empty bar. A pad's level is the peak in dBFS written in its name; velocity is 127 unless noted.

| # | Section | Starts at (s) | Bars (with the empty one) | Measures |
| --- | --- | --- | --- | --- |
| 1 | Reference tone | 0.000 | 5 | 1 kHz at -20 dBFS held for 4 bars: master level and meter reference |
| 2 | Level ladder | 10.909 | 24 | each sound once at velocity 127, one per bar, in pad order: its real output level |
| 3 | Sidechain | 63.273 | 5 | kick on every beat over a held 55 Hz bass: ducking depth and release |
| 4 | Velocity | 74.182 | 10 | kick at velocity 127, 100, 70, 40 (bars 1 to 4), the -18 dBFS kick at 127 (bar 5), then the tom at 127, 100, 70, 40 (bars 6 to 9): velocity curve and clipper |
| 5 | Hats and cymbals | 96.000 | 5 | closed hats on 8ths (bars 1 and 2), open hat (bar 3), crash (bar 4): pad highpass and high-shelf cut |
| 6 | Full groove | 106.909 | 9 | kick, snare, hats, 808, melodic loop and vox together for 8 bars: overall balance and master chain |

Total: 58 bars, 126.55 s.

## Hits

Time in seconds = pattern start + timeOffset / 4096 beats x beat length.

### 1. Reference tone (starts 0.000 s)

-   0.000 s  pad 18 reference_1kHz_-20dBFS  vel 127  length 65536 ticks

### 2. Level ladder (starts 10.909 s)

-  10.909 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  13.091 s  pad  2 kick_quiet_-18dBFS  vel 127  length 4096 ticks
-  15.273 s  pad  3 808_bass_E1_41Hz_-6dBFS  vel 127  length 4096 ticks
-  17.455 s  pad  4 bass_A1_55Hz_-9dBFS  vel 127  length 4096 ticks
-  19.636 s  pad  5 snare_-3dBFS  vel 127  length 4096 ticks
-  21.818 s  pad  6 clap_-6dBFS  vel 127  length 4096 ticks
-  24.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 4096 ticks
-  26.182 s  pad  8 open_hat_-6dBFS  vel 127  length 4096 ticks
-  28.364 s  pad  9 crash_cymbal_-6dBFS  vel 127  length 4096 ticks
-  30.545 s  pad 10 tom_perc_-6dBFS  vel 127  length 4096 ticks
-  32.727 s  pad 11 vox_chant_-9dBFS  vel 127  length 4096 ticks
-  34.909 s  pad 12 riser_fx_-6dBFS  vel 127  length 4096 ticks
-  37.091 s  pad 13 piano_stab_A3_-9dBFS  vel 127  length 4096 ticks
-  39.273 s  pad 14 melodic_loop_Am_110bpm_-9dBFS  vel 127  length 4096 ticks
-  45.818 s  pad 15 drum_loop_110bpm_-3dBFS  vel 127  length 4096 ticks
-  52.364 s  pad 16 kick_beat_110bpm_-3dBFS  vel 127  length 15360 ticks
-  54.545 s  pad 17 bass_sustain_55Hz_-9dBFS  vel 127  length 15360 ticks

### 3. Sidechain (starts 63.273 s)

-  63.273 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  63.273 s  pad 17 bass_sustain_55Hz_-9dBFS  vel 127  length 65536 ticks
-  63.818 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  64.364 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  64.909 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  65.455 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  66.000 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  66.545 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  67.091 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  67.636 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  68.182 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  68.727 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  69.273 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  69.818 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  70.364 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  70.909 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  71.455 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks

### 4. Velocity (starts 74.182 s)

-  74.182 s  pad  1 kick_calibration_-3dBFS  vel 127  length 4096 ticks
-  76.364 s  pad  1 kick_calibration_-3dBFS  vel 100  length 4096 ticks
-  78.545 s  pad  1 kick_calibration_-3dBFS  vel 70  length 4096 ticks
-  80.727 s  pad  1 kick_calibration_-3dBFS  vel 40  length 4096 ticks
-  82.909 s  pad  2 kick_quiet_-18dBFS  vel 127  length 4096 ticks
-  85.091 s  pad 10 tom_perc_-6dBFS  vel 127  length 4096 ticks
-  87.273 s  pad 10 tom_perc_-6dBFS  vel 100  length 4096 ticks
-  89.455 s  pad 10 tom_perc_-6dBFS  vel 70  length 4096 ticks
-  91.636 s  pad 10 tom_perc_-6dBFS  vel 40  length 4096 ticks

### 5. Hats and cymbals (starts 96.000 s)

-  96.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  96.273 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  96.545 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  96.818 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  97.091 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  97.364 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  97.636 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  97.909 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  98.182 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  98.455 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  98.727 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  99.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  99.273 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  99.545 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
-  99.818 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 100.091 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 101.455 s  pad  8 open_hat_-6dBFS  vel 127  length 4096 ticks
- 102.545 s  pad  9 crash_cymbal_-6dBFS  vel 127  length 8192 ticks

### 6. Full groove (starts 106.909 s)

- 106.909 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 106.909 s  pad  3 808_bass_E1_41Hz_-6dBFS  vel 127  length 16384 ticks
- 106.909 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 106.909 s  pad 14 melodic_loop_Am_110bpm_-9dBFS  vel 127  length 32768 ticks
- 107.182 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 107.455 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 107.455 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 107.727 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 107.727 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 108.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 108.273 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 108.273 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 108.545 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 108.545 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 108.818 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 109.091 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 109.091 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 109.364 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 109.636 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 109.636 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 109.909 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 109.909 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 110.182 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 110.455 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 110.455 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 110.727 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 110.727 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 111.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 111.000 s  pad  8 open_hat_-6dBFS  vel 127  length 2048 ticks
- 111.273 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 111.273 s  pad  3 808_bass_E1_41Hz_-6dBFS  vel 127  length 16384 ticks
- 111.273 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 111.273 s  pad 14 melodic_loop_Am_110bpm_-9dBFS  vel 127  length 32768 ticks
- 111.545 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 111.818 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 111.818 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 112.091 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 112.091 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 112.364 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 112.636 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 112.636 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 112.909 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 112.909 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 113.182 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 113.455 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 113.455 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 113.727 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 114.000 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 114.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 114.273 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 114.273 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 114.545 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 114.818 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 114.818 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 115.091 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 115.091 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 115.364 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 115.364 s  pad  8 open_hat_-6dBFS  vel 127  length 2048 ticks
- 115.636 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 115.636 s  pad  3 808_bass_E1_41Hz_-6dBFS  vel 127  length 16384 ticks
- 115.636 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 115.636 s  pad 14 melodic_loop_Am_110bpm_-9dBFS  vel 127  length 32768 ticks
- 115.909 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 115.909 s  pad 11 vox_chant_-9dBFS  vel 127  length 8192 ticks
- 116.182 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 116.182 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 116.455 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 116.455 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 116.727 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 117.000 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 117.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 117.273 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 117.273 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 117.545 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 117.818 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 117.818 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 118.091 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 118.364 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 118.364 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 118.636 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 118.636 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 118.909 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 119.182 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 119.182 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 119.455 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 119.455 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 119.727 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 119.727 s  pad  8 open_hat_-6dBFS  vel 127  length 2048 ticks
- 120.000 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 120.000 s  pad  3 808_bass_E1_41Hz_-6dBFS  vel 127  length 16384 ticks
- 120.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 120.000 s  pad 14 melodic_loop_Am_110bpm_-9dBFS  vel 127  length 32768 ticks
- 120.273 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 120.545 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 120.545 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 120.818 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 120.818 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 121.091 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 121.364 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 121.364 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 121.636 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 121.636 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 121.909 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 122.182 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 122.182 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 122.455 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 122.727 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 122.727 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 123.000 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 123.000 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 123.273 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 123.545 s  pad  1 kick_calibration_-3dBFS  vel 127  length 2048 ticks
- 123.545 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 123.818 s  pad  5 snare_-3dBFS  vel 127  length 2048 ticks
- 123.818 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 124.091 s  pad  7 closed_hat_-3dBFS  vel 127  length 1024 ticks
- 124.091 s  pad  8 open_hat_-6dBFS  vel 127  length 2048 ticks
