#!/usr/bin/env bun

/**
 * YouTubeChecker.ts - Check YouTube channels for new videos
 *
 * Monitors configured YouTube channels for new content and tracks
 * processed videos to avoid duplicate processing.
 *
 * Usage:
 *   bun ~/.claude/skills/PAIUpgrade/Tools/YouTubeChecker.ts           # Check all channels
 *   bun ~/.claude/skills/PAIUpgrade/Tools/YouTubeChecker.ts --limit 5 # Check last 5 videos per channel
 *   bun ~/.claude/skills/PAIUpgrade/Tools/YouTubeChecker.ts --force   # Ignore state, report all videos
 *   bun ~/.claude/skills/PAIUpgrade/Tools/YouTubeChecker.ts --channel @Fireship  # Check single channel
 *   bun ~/.claude/skills/PAIUpgrade/Tools/YouTubeChecker.ts --json    # Output as JSON
 *
 * Dependencies:
 *   - yt-dlp (installed via go/pip/brew)
 *
 * State:
 *   - ~/.claude/skills/PAIUpgrade/State/youtube-videos.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

// Types
interface Channel {
  handle: string;
  name: string;
  purpose: string;
}

interface ChannelsConfig {
  channels: Channel[];
  _docs?: Record<string, string>;
}

interface Video {
  id: string;
  channel_handle: string;
  channel_name: string;
  title: string;
  url: string;
  duration_seconds: number;
  first_seen: string;
  transcript_extracted: boolean;
}

interface VideoState {
  videos: Video[];
  last_check?: string;
}

interface YtDlpVideo {
  id: string;
  title: string;
  url: string;
  duration: number;
  channel?: string;
  uploader?: string;
}

// Config
const HOME = homedir();
const SKILL_DIR = join(HOME, '.claude', 'skills', 'PAIUpgrade');
const STATE_DIR = join(SKILL_DIR, 'State');
const STATE_FILE = join(STATE_DIR, 'youtube-videos.json');
const CHANNELS_FILE = join(SKILL_DIR, 'youtube-channels.json');
const USER_CHANNELS_FILE = join(HOME, '.claude', 'skills', 'PAI', 'USER', 'SKILLCUSTOMIZATIONS', 'PAIUpgrade', 'youtube-channels.json');

// Parse args
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const JSON_OUTPUT = args.includes('--json');
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) || 10 : 10;
const channelIndex = args.indexOf('--channel');
const SINGLE_CHANNEL = channelIndex !== -1 ? args[channelIndex + 1] : null;

// Load channels config (merge base + user)
function loadChannels(): Channel[] {
  let channels: Channel[] = [];

  // Load base channels
  if (existsSync(CHANNELS_FILE)) {
    try {
      const config: ChannelsConfig = JSON.parse(readFileSync(CHANNELS_FILE, 'utf-8'));
      channels = config.channels || [];
    } catch (error) {
      console.error('Error loading channels config:', error);
    }
  }

  // Merge user channels if they exist
  if (existsSync(USER_CHANNELS_FILE)) {
    try {
      const userConfig: ChannelsConfig = JSON.parse(readFileSync(USER_CHANNELS_FILE, 'utf-8'));
      if (userConfig.channels) {
        // Add user channels, avoiding duplicates by handle
        const existingHandles = new Set(channels.map(c => c.handle));
        for (const channel of userConfig.channels) {
          if (!existingHandles.has(channel.handle)) {
            channels.push(channel);
          }
        }
      }
    } catch (error) {
      console.error('Error loading user channels config:', error);
    }
  }

  return channels;
}

// Load video state
function loadState(): VideoState {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  if (!existsSync(STATE_FILE)) {
    return { videos: [] };
  }

  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch (error) {
    console.error('Error loading state, starting fresh:', error);
    return { videos: [] };
  }
}

// Save video state
function saveState(state: VideoState): void {
  try {
    state.last_check = new Date().toISOString();
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

// Get recent videos from a channel using yt-dlp
function getChannelVideos(channel: Channel, limit: number): YtDlpVideo[] {
  const videos: YtDlpVideo[] = [];
  const channelUrl = `https://www.youtube.com/${channel.handle}/videos`;

  try {
    // Use yt-dlp to get video metadata without downloading
    const cmd = `yt-dlp --flat-playlist --dump-json --playlist-end ${limit} "${channelUrl}" 2>/dev/null`;
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 });

    // Each line is a JSON object
    for (const line of output.trim().split('\n')) {
      if (!line) continue;
      try {
        const video = JSON.parse(line) as YtDlpVideo;
        videos.push({
          id: video.id,
          title: video.title,
          url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
          duration: video.duration || 0,
          channel: video.channel || video.uploader || channel.name,
        });
      } catch (parseError) {
        // Skip malformed lines
      }
    }
  } catch (error) {
    if (!JSON_OUTPUT) {
      console.error(`Error fetching videos for ${channel.name}:`, error instanceof Error ? error.message : error);
    }
  }

  return videos;
}

// Main execution
async function main() {
  const channels = loadChannels();
  const state = loadState();
  const seenIds = new Set(state.videos.map(v => v.id));

  if (!JSON_OUTPUT) {
    console.log('YouTube Channel Checker');
    console.log('=======================\n');
    console.log(`Checking ${SINGLE_CHANNEL ? '1' : channels.length} channel(s), last ${LIMIT} videos each`);
    console.log(`Force mode: ${FORCE ? 'Yes' : 'No'}`);
    console.log(`Known videos: ${state.videos.length}`);
    console.log();
  }

  const newVideos: Video[] = [];
  const channelsToCheck = SINGLE_CHANNEL
    ? channels.filter(c => c.handle === SINGLE_CHANNEL || c.handle === `@${SINGLE_CHANNEL.replace('@', '')}`)
    : channels;

  if (channelsToCheck.length === 0) {
    if (SINGLE_CHANNEL) {
      console.error(`Channel not found: ${SINGLE_CHANNEL}`);
      process.exit(1);
    }
    console.error('No channels configured');
    process.exit(1);
  }

  for (const channel of channelsToCheck) {
    if (!JSON_OUTPUT) {
      console.log(`Checking ${channel.name} (${channel.handle})...`);
    }

    const videos = getChannelVideos(channel, LIMIT);

    for (const video of videos) {
      const isNew = !seenIds.has(video.id);

      if (FORCE || isNew) {
        const newVideo: Video = {
          id: video.id,
          channel_handle: channel.handle,
          channel_name: channel.name,
          title: video.title,
          url: video.url,
          duration_seconds: video.duration,
          first_seen: new Date().toISOString(),
          transcript_extracted: false,
        };

        newVideos.push(newVideo);

        if (isNew) {
          seenIds.add(video.id);
          state.videos.push(newVideo);
        }
      }
    }

    if (!JSON_OUTPUT) {
      console.log(`  Found ${videos.length} videos, ${newVideos.filter(v => v.channel_handle === channel.handle).length} new`);
    }

    // Small delay between channels to be polite
    if (channelsToCheck.indexOf(channel) < channelsToCheck.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Save updated state
  saveState(state);

  // Output results
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      checked_at: new Date().toISOString(),
      channels_checked: channelsToCheck.length,
      new_videos: newVideos,
      total_known_videos: state.videos.length,
    }, null, 2));
  } else {
    console.log('\n=======================');
    console.log(`Summary: ${newVideos.length} new videos found\n`);

    if (newVideos.length > 0) {
      console.log('New Videos:');
      for (const video of newVideos) {
        const duration = video.duration_seconds > 0
          ? `${Math.floor(video.duration_seconds / 60)}:${(video.duration_seconds % 60).toString().padStart(2, '0')}`
          : 'unknown';
        console.log(`  [${video.channel_name}] ${video.title}`);
        console.log(`    Duration: ${duration}`);
        console.log(`    URL: ${video.url}`);
        console.log();
      }

      console.log('To extract transcripts for new videos:');
      console.log('  bun ~/.claude/skills/PAI/Tools/GetTranscript.ts "<video-url>"');
    } else {
      console.log('No new videos since last check.');
    }

    console.log(`\nState saved to: ${STATE_FILE}`);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
