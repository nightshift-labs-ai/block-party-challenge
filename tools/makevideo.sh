#!/usr/bin/env bash
# Rebuild docs/demo.mp4 (≈2:40): pitch slides + a real recorded episode (host + phone) + Piper voice-over + subtitles.
# Needs /tmp/pp/s*.png (node tools/slideshots.mjs <abs docs/pitch.html> /tmp/pp) and REC=<dir from tools/recvideo.mjs>.
# If you re-record, re-time docs/video-script.txt from the new marks.json (game starts at 19 s in the video).
set -euo pipefail
cd "$(dirname "$0")/.."; ROOT=$PWD; W=/tmp/brvid; rm -rf $W; mkdir -p $W; REC=${REC:-/tmp/rv}
FF=/home/agent/tools/ffmpeg/ffmpeg; export LD_LIBRARY_PATH=/home/agent/tools/libroot/usr/lib/x86_64-linux-gnu
seg(){ $FF -y -loglevel error -loop 1 -t $2 -i /tmp/pp/s$1.png -vf "scale=1280:720,format=yuv420p" -r 30 -c:v libx264 -preset veryfast -crf 20 $W/s$1.mp4; }
seg 1 7; seg 2 12; seg 7 10; seg 9 15; seg 10 14
$FF -y -loglevel error -i $REC/host/*.webm -i $REC/phone/*.webm -filter_complex "color=c=0x14161f:s=1280x720:r=30[bg];[0:v]scale=944:531[h];[1:v]scale=268:536[p];[bg][h]overlay=24:94[a];[a][p]overlay=988:92:shortest=1,format=yuv420p" -t 102 -r 30 -c:v libx264 -preset veryfast -crf 21 $W/game.mp4
printf "file s1.mp4\nfile s2.mp4\nfile game.mp4\nfile s7.mp4\nfile s9.mp4\nfile s10.mp4\n" > $W/list.txt
$FF -y -loglevel error -f concat -safe 0 -i $W/list.txt -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r 30 $W/raw.mp4
python3 /home/agent/claude-money/tools/narrate.py $W/raw.mp4 docs/video-script.txt $W/voiced.mp4 --soft-subs >/dev/null
cp $W/voiced.srt docs/demo.srt
$FF -y -loglevel error -i $W/voiced.mp4 -vn -c:a copy $W/voice.m4a
$FF -y -loglevel error -i $W/raw.mp4 -i $W/voice.m4a -filter_complex "[0:v]subtitles='$ROOT/docs/demo.srt':force_style='FontName=DejaVu Sans,FontSize=13,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=6'[v]" -map "[v]" -map 1:a -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -c:a copy -movflags +faststart docs/demo.mp4
/home/agent/tools/ffmpeg/ffprobe -v error -show_entries format=duration -of csv=p=0 docs/demo.mp4
