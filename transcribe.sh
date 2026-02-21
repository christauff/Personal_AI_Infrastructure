#!/bin/bash
# Simple transcription helper - transcribe any audio/video file
# Usage: ./transcribe.sh <audio-file> [format]

set -e

# Add uv to PATH
export PATH="$HOME/.local/bin:$PATH"

if [ $# -eq 0 ]; then
    echo "Usage: ./transcribe.sh <audio-file> [format]"
    echo ""
    echo "Formats: txt (default), json, srt, vtt"
    echo ""
    echo "Examples:"
    echo "  ./transcribe.sh recording.m4a"
    echo "  ./transcribe.sh video.mp4 srt"
    echo "  ./transcribe.sh audio.wav json"
    exit 1
fi

AUDIO_FILE="$1"
FORMAT="${2:-txt}"
PAI_DIR="${HOME}/.claude"

if [ ! -f "$AUDIO_FILE" ]; then
    echo "Error: File not found: $AUDIO_FILE"
    exit 1
fi

echo "🔄 Transcribing: $(basename "$AUDIO_FILE")"
echo "📄 Format: $FORMAT"
echo ""

cd "${PAI_DIR}/skills/PAI/Tools"
uv run extract-transcript.py "$AUDIO_FILE" --format "$FORMAT"

# Show the transcript if it's a txt file
BASENAME=$(basename "$AUDIO_FILE" | sed 's/\.[^.]*$//')
DIRNAME=$(dirname "$AUDIO_FILE")
TRANSCRIPT_FILE="${DIRNAME}/${BASENAME}.${FORMAT}"

if [ "$FORMAT" = "txt" ] && [ -f "$TRANSCRIPT_FILE" ]; then
    echo ""
    echo "📝 Transcript:"
    echo "─────────────────────────────────────"
    cat "$TRANSCRIPT_FILE"
    echo ""
    echo "─────────────────────────────────────"
fi

echo ""
echo "✓ Saved to: $TRANSCRIPT_FILE"
