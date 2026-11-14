#!/bin/zsh
# Rebuilds the bundled drum samples (public/samples/drums) from Sonic Pi's CC0 originals: mono, peak-normalised to
# -1 dBFS, trimmed to a maximum length with a fade, trailing silence removed, 16-bit FLAC. Needs ffmpeg and bc.
# See ATTRIBUTIONS.md for each file's source and ADR 0009 for why FLAC.
#   1. download the .flac files named below from
#      https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples into a folder of their own
#   2. scripts/prepare-drum-samples.sh <that folder> public/samples/drums
set -e
IN=$1; OUT=$2; mkdir -p "$OUT"
# name:source:max seconds
for spec in kick-haus:bd_haus:0.4 kick-tek:bd_tek:0.4 kick-zum:bd_zum:0.4 \
  snare-electro:elec_hi_snare:0.4 snare-dub:sn_dub:0.4 \
  hat-tight:drum_cymbal_closed:0.25 hat-psych:hat_psych:0.25 hat-zild:hat_zild:0.25 \
  openhat-cymbal:drum_cymbal_open:0.9 tom-fuzz:elec_fuzz_tom:0.45 tom-low:drum_tom_lo_hard:0.6 \
  perc-blip:elec_blip:0.2 perc-tick:elec_tick:0.1; do
  name=${spec%%:*}; rest=${spec#*:}; src=${rest%%:*}; max=${rest#*:}
  peak=$(ffmpeg -hide_banner -i "$IN/$src.flac" -ac 1 -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(.*\) dB/\1/p')
  gain=$(echo "-1 - ($peak)" | bc -l)
  fade=$(printf "%.4f" $(echo "$max * 0.35" | bc -l)); fadeStart=$(printf "%.4f" $(echo "$max - $fade" | bc -l))
  ffmpeg -hide_banner -loglevel error -y -i "$IN/$src.flac" -ac 1 -ar 44100 \
    -af "volume=${gain}dB,atrim=0:$max,afade=t=out:st=$fadeStart:d=$fade,areverse,silenceremove=start_periods=1:start_threshold=-70dB,areverse" \
    -sample_fmt s16 -compression_level 12 "$OUT/$name.flac"
done
