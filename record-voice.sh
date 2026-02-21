#!/bin/bash
# Quick voice recording and transcription helper for PAI
# Usage: ./record-voice.sh [output-name]

# Add uv to PATH
export PATH="$HOME/.local/bin:$PATH"

# Default output name
OUTPUT_NAME="${1:-voice-input}"
AUDIO_FILE="/tmp/${OUTPUT_NAME}.wav"
PAI_DIR="${HOME}/.claude"

echo "🎤 Voice Input for PAI"
echo "===================="
echo ""
echo "Press ENTER to start recording..."
read

echo "🔴 Recording... Press CTRL+C when done speaking"
echo ""

# Record audio (WAV format for compatibility)
# -D hw:0,0 = explicitly use hardware device 0
# -f cd = CD quality (16-bit, 44.1kHz stereo)
# -t wav = output format
# -q = quiet mode
trap "echo ''" SIGINT
arecord -D hw:0,0 -f cd -t wav -q "$AUDIO_FILE" 2>&1
RECORD_EXIT=$?
trap - SIGINT

# Check if recording was successful (file created and has content)
if [ ! -f "$AUDIO_FILE" ] || [ ! -s "$AUDIO_FILE" ]; then
    echo ""
    echo "✗ Recording failed. Possible issues:"
    echo "  - No microphone detected"
    echo "  - ALSA not configured"
    echo "  - Permissions issue"
    echo ""
    echo "Available devices:"
    arecord -l 2>&1
    exit 1
fi

echo ""
echo "✓ Recording saved to $AUDIO_FILE"
echo "🔄 Transcribing with faster-whisper..."
echo ""

# Transcribe using local faster-whisper
cd "${PAI_DIR}/skills/PAI/Tools"
uv run extract-transcript.py "$AUDIO_FILE" --format txt

# Read the transcript
TRANSCRIPT_FILE="/tmp/${OUTPUT_NAME}.txt"
if [ -f "$TRANSCRIPT_FILE" ]; then
    echo ""
    echo "📝 Transcript:"
    echo "─────────────────────────────────────"
    cat "$TRANSCRIPT_FILE"
    echo ""
    echo "─────────────────────────────────────"
    echo ""
    echo "✓ Transcript saved to: $TRANSCRIPT_FILE"
    echo ""
    echo "💡 Copy the text above and paste it into Claude Code"
else
    echo "✗ Transcription file not found"
    exit 1
fi
