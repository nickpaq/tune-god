# Probe: sidechain

Load `probe-sidechain.koala` in Koala, render the patterns in order (110 BPM, 4/4, 54.55 s in all), then run `python3 scripts/analyzeMixerProbes.py sidechain <zip>`.

| # | Pattern | Starts at (s) | Bars (with the empty one) |
| --- | --- | --- | --- |
| 1 | Kick alone | 0.000 | 5 |
| 2 | Bass alone (Main, no sidechain) | 10.909 | 5 |
| 3 | Kick + bass, threshold -24 dB, release 80 ms, output 0 dB | 21.818 | 5 |
| 4 | Kick + bass, threshold -40 dB, release 80 ms, output 0 dB | 32.727 | 5 |
| 5 | Kick + bass, threshold -60 dB, release 80 ms, output 0 dB | 43.636 | 5 |

# Probe: EQ

Load `probe-eq.koala` in Koala, render the patterns in order (110 BPM, 4/4, 58.91 s in all), then run `python3 scripts/analyzeMixerProbes.py eq <zip>`. Each pattern plays the same white noise (6 s long) through a different EQ; pattern 1 is the reference.

| # | Pattern | Starts at (s) | Bars (with the empty one) |
| --- | --- | --- | --- |
| 1 | Reference (Main, no EQ) | 0.000 | 3 |
| 2 | Bus EQ lo 150 Hz gain -12 dB | 6.545 | 3 |
| 3 | Bus EQ lo 150 Hz gain 0 dB (what the app writes) | 13.091 | 3 |
| 4 | Bus EQ hi 8 kHz gain -12 dB | 19.636 | 3 |
| 5 | Bus EQ mid 1 kHz gain -12 dB Q 1 | 26.182 | 3 |
| 6 | Pad EQ lo 300 Hz gain -18 dB (what the app writes) | 32.727 | 3 |
| 7 | Pad EQ lo 300 Hz gain 0 dB | 39.273 | 3 |
| 8 | Pad EQ hi 8 kHz gain -12 dB | 45.818 | 3 |
| 9 | Pad EQ mid 1 kHz gain -12 dB | 52.364 | 3 |
