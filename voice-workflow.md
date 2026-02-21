# Voice Input Workflow for PAI

Since you're running PAI on a VMware VM (`ubuntu-64-dev`), you have two options for voice input:

## Option 1: Record Locally, Transcribe on Server (Recommended)

**On your local machine:**
1. Record audio using any tool:
   - **macOS**: Voice Memos app, QuickTime, or `say` command
   - **Windows**: Voice Recorder app or Audacity
   - **Linux**: `arecord`, Audacity, or any audio recorder
   - **Phone**: Any voice recorder app

2. Save in any format (.m4a, .mp3, .wav, .mp4, etc.)

**Transfer to server:**
```bash
# Using scp
scp recording.m4a ubuntu-64-dev:~/

# Or drag-and-drop if using VSCode Remote SSH
```

**Transcribe on server:**
```bash
ssh ubuntu-64-dev
cd ~/.claude
./transcribe.sh ~/recording.m4a
```

## Option 2: Record Directly on VM

If your VMware setup has audio forwarding enabled:

```bash
~/.claude/record-voice.sh
```

This will use the VM's audio device to record directly.

## Quick Example Workflow

```bash
# Local machine - record with your phone or computer
# Transfer the file: recording.m4a

# On server
ssh ubuntu-64-dev
~/.claude/transcribe.sh ~/recording.m4a

# Copy the transcript text
# Paste into Claude Code
```

## File Transfer Tips

**VSCode Remote SSH users**: Just drag audio files into the file explorer

**Command line**: Use `scp` or `rsync`:
```bash
scp *.m4a ubuntu-64-dev:~/audio-inbox/
```

**Cloud storage**: Upload to Dropbox/Drive, download on server:
```bash
wget "https://dropbox.com/your-shared-link" -O recording.m4a
```

## Supported Audio Formats

All common formats work:
- Audio: .m4a, .mp3, .wav, .flac, .ogg, .aac, .wma
- Video: .mp4, .mov, .avi, .mkv, .webm (extracts audio automatically)

## Pro Tip: Batch Processing

Drop multiple files in a folder and transcribe them all:

```bash
mkdir ~/voice-inbox
# Transfer multiple files there
cd ~/.claude/skills/PAI/Tools
uv run extract-transcript.py ~/voice-inbox/ --batch
```
