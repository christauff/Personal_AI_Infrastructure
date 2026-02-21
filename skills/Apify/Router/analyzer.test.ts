#!/usr/bin/env bun
/**
 * Unit tests for Query Analyzer
 */

import { describe, test, expect } from 'bun:test'
import {
  extractUrls,
  parseUrl,
  extractMentions,
  extractHashtags,
  extractKeywords,
  extractLocations,
  classifyIntent,
  analyzeQuery
} from './analyzer'

describe('extractUrls', () => {
  test('extracts single URL', () => {
    const urls = extractUrls('Check out https://x.com/user/status/123')
    expect(urls).toEqual(['https://x.com/user/status/123'])
  })

  test('extracts multiple URLs', () => {
    const urls = extractUrls('Compare https://amazon.com/dp/B123 vs https://ebay.com/itm/456')
    expect(urls).toHaveLength(2)
  })

  test('returns empty for no URLs', () => {
    const urls = extractUrls('No links here')
    expect(urls).toEqual([])
  })
})

describe('parseUrl', () => {
  test('parses Twitter tweet URL', () => {
    const parsed = parseUrl('https://x.com/Alibaba_Qwen/status/2018718453570707465')
    expect(parsed.platform).toBe('twitter')
    expect(parsed.type).toBe('post')
    expect(parsed.ids.username).toBe('Alibaba_Qwen')
    expect(parsed.ids.postId).toBe('2018718453570707465')
  })

  test('parses Twitter profile URL', () => {
    const parsed = parseUrl('https://twitter.com/elonmusk')
    expect(parsed.platform).toBe('twitter')
    expect(parsed.type).toBe('profile')
    expect(parsed.ids.username).toBe('elonmusk')
  })

  test('parses YouTube video URL', () => {
    const parsed = parseUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')
    expect(parsed.platform).toBe('youtube')
    expect(parsed.type).toBe('video')
    expect(parsed.ids.videoId).toBe('dQw4w9WgXcQ')
  })

  test('parses YouTube short URL', () => {
    const parsed = parseUrl('https://youtu.be/dQw4w9WgXcQ')
    expect(parsed.platform).toBe('youtube')
    expect(parsed.type).toBe('video')
    expect(parsed.ids.videoId).toBe('dQw4w9WgXcQ')
  })

  test('parses Amazon product URL', () => {
    const parsed = parseUrl('https://amazon.com/dp/B09V3KXJPB')
    expect(parsed.platform).toBe('amazon')
    expect(parsed.type).toBe('product')
    expect(parsed.ids.productId).toBe('B09V3KXJPB')
  })

  test('parses Instagram profile URL', () => {
    const parsed = parseUrl('https://instagram.com/natgeo')
    expect(parsed.platform).toBe('instagram')
    expect(parsed.type).toBe('profile')
    expect(parsed.ids.username).toBe('natgeo')
  })

  test('parses LinkedIn profile URL', () => {
    const parsed = parseUrl('https://linkedin.com/in/satyanadella')
    expect(parsed.platform).toBe('linkedin')
    expect(parsed.type).toBe('profile')
    expect(parsed.ids.username).toBe('satyanadella')
  })

  test('parses Google Maps URL', () => {
    const parsed = parseUrl('https://google.com/maps/place/Eiffel+Tower')
    expect(parsed.platform).toBe('google-maps')
    expect(parsed.type).toBe('place')
  })

  test('returns web platform for unknown URLs', () => {
    const parsed = parseUrl('https://example.com/some/page')
    expect(parsed.platform).toBe('web')
    expect(parsed.type).toBe('unknown')
  })
})

describe('extractMentions', () => {
  test('extracts @mentions', () => {
    const mentions = extractMentions('Hey @elonmusk and @sama, what do you think?')
    expect(mentions).toContain('elonmusk')
    expect(mentions).toContain('sama')
  })

  test('ignores email addresses', () => {
    const mentions = extractMentions('Contact user@example.com for more')
    expect(mentions).not.toContain('example')
  })

  test('deduplicates mentions', () => {
    const mentions = extractMentions('@user said @user is great')
    expect(mentions).toHaveLength(1)
  })
})

describe('extractHashtags', () => {
  test('extracts #hashtags', () => {
    const hashtags = extractHashtags('Trending #AI and #MachineLearning')
    expect(hashtags).toContain('AI')
    expect(hashtags).toContain('MachineLearning')
  })

  test('returns empty for no hashtags', () => {
    const hashtags = extractHashtags('No hashtags here')
    expect(hashtags).toEqual([])
  })
})

describe('extractLocations', () => {
  test('extracts "in City" patterns', () => {
    const locations = extractLocations('Find restaurants in San Francisco')
    // Captures first word of multi-word location
    expect(locations.some(l => l.includes('San'))).toBe(true)
  })

  test('extracts "City, State" patterns', () => {
    const locations = extractLocations('Weather in Austin, TX')
    expect(locations).toContain('Austin')
  })
})

describe('extractKeywords', () => {
  test('removes URLs and mentions', () => {
    const keywords = extractKeywords(
      'Check @user profile at https://example.com for AI news',
      ['https://example.com'],
      ['user'],
      []
    )
    expect(keywords).toContain('profile')
    expect(keywords).toContain('news')
    expect(keywords).not.toContain('user')
  })

  test('filters stop words', () => {
    const keywords = extractKeywords('The quick brown fox', [], [], [])
    expect(keywords).not.toContain('the')
    expect(keywords).toContain('quick')
    expect(keywords).toContain('brown')
    expect(keywords).toContain('fox')
  })
})

describe('classifyIntent', () => {
  test('classifies social media intent', () => {
    const intent = classifyIntent({
      urls: [{ raw: '', platform: 'twitter', type: 'post', ids: {} }],
      mentions: [],
      hashtags: [],
      keywords: [],
      locations: []
    })
    expect(intent).toBe('social')
  })

  test('classifies ecommerce intent', () => {
    const intent = classifyIntent({
      urls: [{ raw: '', platform: 'amazon', type: 'product', ids: {} }],
      mentions: [],
      hashtags: [],
      keywords: [],
      locations: []
    })
    expect(intent).toBe('ecommerce')
  })

  test('classifies business intent', () => {
    const intent = classifyIntent({
      urls: [{ raw: '', platform: 'google-maps', type: 'place', ids: {} }],
      mentions: [],
      hashtags: [],
      keywords: [],
      locations: []
    })
    expect(intent).toBe('business')
  })

  test('classifies mixed intent', () => {
    const intent = classifyIntent({
      urls: [
        { raw: '', platform: 'twitter', type: 'post', ids: {} },
        { raw: '', platform: 'amazon', type: 'product', ids: {} }
      ],
      mentions: [],
      hashtags: [],
      keywords: [],
      locations: []
    })
    expect(intent).toBe('mixed')
  })
})

describe('analyzeQuery', () => {
  test('analyzes Twitter URL query', () => {
    const analysis = analyzeQuery('https://x.com/Alibaba_Qwen/status/2018718453570707465')
    expect(analysis.intent).toBe('social')
    expect(analysis.entities.urls).toHaveLength(1)
    expect(analysis.entities.urls[0].platform).toBe('twitter')
    expect(analysis.suggestedActors.length).toBeGreaterThan(0)
    expect(analysis.suggestedActors[0].actor.name).toContain('Twitter')
  })

  test('analyzes YouTube URL query', () => {
    const analysis = analyzeQuery('https://youtube.com/watch?v=dQw4w9WgXcQ')
    expect(analysis.intent).toBe('social')
    expect(analysis.entities.urls[0].platform).toBe('youtube')
    expect(analysis.suggestedActors[0].actor.name).toContain('YouTube')
  })

  test('analyzes Amazon URL query', () => {
    const analysis = analyzeQuery('https://amazon.com/dp/B09V3KXJPB')
    expect(analysis.intent).toBe('ecommerce')
    expect(analysis.entities.urls[0].platform).toBe('amazon')
    expect(analysis.suggestedActors[0].actor.name).toContain('Amazon')
  })

  test('analyzes mention query', () => {
    const analysis = analyzeQuery('scrape @elonmusk tweets about AI')
    expect(analysis.entities.mentions).toContain('elonmusk')
    expect(analysis.entities.keywords).toContain('tweets')
  })

  test('handles mixed query', () => {
    // Use valid 10-char ASIN for Amazon URL pattern to match
    const analysis = analyzeQuery('Compare https://x.com/user with https://amazon.com/dp/B09V3KXJPB')
    expect(analysis.intent).toBe('mixed')
    expect(analysis.entities.urls).toHaveLength(2)
  })

  test('returns high confidence for URL matches', () => {
    const analysis = analyzeQuery('https://x.com/user/status/123')
    expect(analysis.confidence).toBeGreaterThan(0.5)
  })
})
