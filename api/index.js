// api/index.js - Fixed Multi-Source Streaming Addon for Vercel
import { addonBuilder } from 'stremio-addon-sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Addon manifest
const manifest = {
    id: 'community.multisource-streams-v3',
    version: '3.0.0',
    name: 'Multi-Source Streams Pro',
    description: 'Advanced streaming addon with multiple sources and quality detection',
    logo: 'https://i.imgur.com/5QjNvzO.png',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    behaviorHints: {
        configurable: false,
        configurationRequired: false
    }
};

// Create addon builder
const builder = new addonBuilder(manifest);

// Optimized headers
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Referer': 'https://www.google.com/',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
};

// Utility function to clean IMDB ID
function cleanImdbId(id) {
    // Handle both tt1234567 and tmdb:12345 formats
    if (id.startsWith('tmdb:')) {
        return id.replace('tmdb:', '');
    }
    return id.replace(/^tt/, '');
}

// Enhanced M3U8 link finder
function findM3u8Links(text) {
    const patterns = [
        /https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/gi,
        /["']([^"']*\.m3u8(?:\?[^"']*)?)['"]/gi,
        /file['"\s]*:['"\s]*['"]([^'"]*\.m3u8[^'"]*)['"]/gi
    ];
    
    const links = new Set();
    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const link = match[1] || match[0];
            const cleaned = link.replace(/['"]/g, '');
            if (cleaned.includes('.m3u8') && cleaned.startsWith('http')) {
                links.add(cleaned);
            }
        }
    });
    
    return Array.from(links);
}

// VidSrc extractor with better error handling
async function extractVidSrc(imdbId, type, season = null, episode = null) {
    try {
        let url;
        if (type === 'series' && season && episode) {
            url = `https://vidsrc.xyz/embed/tv/${imdbId}/${season}/${episode}`;
        } else {
            url = `https://vidsrc.xyz/embed/movie/${imdbId}`;
        }
        
        console.log(`VidSrc: Extracting from ${url}`);
        
        const response = await axios.get(url, { 
            headers, 
            timeout: 15000,
            maxRedirects: 5
        });
        
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Look for iframe sources
        $('iframe').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.includes('player')) {
                const fullSrc = src.startsWith('http') ? src : `https://vidsrc.xyz${src}`;
                console.log(`Found iframe: ${fullSrc}`);
            }
        });
        
        // Extract from scripts
        const scripts = $('script').map((i, el) => $(el).html()).get();
        for (const script of scripts) {
            if (script) {
                const m3u8Links = findM3u8Links(script);
                streams.push(...m3u8Links);
                
                // Look for base64 encoded links
                const base64Regex = /[A-Za-z0-9+/]{40,}={0,2}/g;
                const matches = script.match(base64Regex) || [];
                
                for (const match of matches) {
                    try {
                        const decoded = Buffer.from(match, 'base64').toString();
                        if (decoded.includes('.m3u8')) {
                            streams.push(...findM3u8Links(decoded));
                        }
                    } catch (e) { continue; }
                }
            }
        }
        
        console.log(`VidSrc: Found ${streams.length} streams`);
        return [...new Set(streams)];
        
    } catch (error) {
        console.error('VidSrc extraction error:', error.message);
        return [];
    }
}

// Simple 2Embed extractor
async function extract2Embed(imdbId, type, season = null, episode = null) {
    try {
        let url;
        if (type === 'series' && season && episode) {
            url = `https://www.2embed.cc/embed/${imdbId}&s=${season}&e=${episode}`;
        } else {
            url = `https://www.2embed.cc/embed/${imdbId}`;
        }
        
        console.log(`2Embed: Extracting from ${url}`);
        
        const response = await axios.get(url, { 
            headers, 
            timeout: 10000,
            maxRedirects: 3
        });
        
        const streams = findM3u8Links(response.data);
        console.log(`2Embed: Found ${streams.length} streams`);
        return streams;
        
    } catch (error) {
        console.error('2Embed extraction error:', error.message);
        return [];
    }
}

// SuperEmbed extractor
async function extractSuperEmbed(imdbId, type, season = null, episode = null) {
    try {
        let url;
        if (type === 'series' && season && episode) {
            url = `https://multiembed.mov/?video_id=${imdbId}&s=${season}&e=${episode}`;
        } else {
            url = `https://multiembed.mov/?video_id=${imdbId}`;
        }
        
        console.log(`SuperEmbed: Extracting from ${url}`);
        
        const response = await axios.get(url, { 
            headers, 
            timeout: 10000
        });
        
        const streams = findM3u8Links(response.data);
        console.log(`SuperEmbed: Found ${streams.length} streams`);
        return streams;
        
    } catch (error) {
        console.error('SuperEmbed extraction error:', error.message);
        return [];
    }
}

// Quality detection
function detectQuality(url) {
    const text = url.toLowerCase();
    
    if (text.includes('4k') || text.includes('2160p')) return '4K UHD';
    if (text.includes('1440p') || text.includes('2k')) return '1440p QHD';
    if (text.includes('1080p') || text.includes('fhd')) return '1080p FHD';
    if (text.includes('720p') || text.includes('hd')) return '720p HD';
    if (text.includes('480p')) return '480p SD';
    if (text.includes('360p')) return '360p';
    
    return 'HD'; // Default quality
}

// Main stream extraction function
async function extractStreams(imdbId, type, season = null, episode = null) {
    console.log(`Extracting streams for: ${imdbId} (${type}${season ? ` S${season}E${episode}` : ''})`);
    
    const cleanId = cleanImdbId(imdbId);
    const streams = [];
    
    // Try multiple extractors in parallel with timeout
    const extractors = [
        extractVidSrc(cleanId, type, season, episode),
        extract2Embed(cleanId, type, season, episode),
        extractSuperEmbed(cleanId, type, season, episode)
    ];
    
    try {
        const results = await Promise.allSettled(extractors);
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.length > 0) {
                const extractorName = ['VidSrc', '2Embed', 'SuperEmbed'][index];
                
                result.value.forEach((link, linkIndex) => {
                    streams.push({
                        name: `${extractorName} - ${detectQuality(link)}`,
                        title: `${extractorName} Stream ${linkIndex + 1}`,
                        url: link,
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: `${extractorName}-${type}`
                        }
                    });
                });
            }
        });
        
        // Add some fallback test streams if no streams found
        if (streams.length === 0) {
            console.log('No streams found, adding test streams');
            streams.push(
                {
                    name: 'Test Stream 1 - HD',
                    title: 'Sample HLS Stream',
                    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
                    behaviorHints: { notWebReady: false }
                },
                {
                    name: 'Test Stream 2 - HD',
                    title: 'Big Buck Bunny',
                    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                    behaviorHints: { notWebReady: false }
                }
            );
        }
        
        console.log(`Total streams found: ${streams.length}`);
        return streams.slice(0, 15); // Limit to 15 streams
        
    } catch (error) {
        console.error('Stream extraction error:', error);
        return [{
            name: 'Error - Please try again',
            title: 'Stream extraction failed',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            behaviorHints: { notWebReady: false }
        }];
    }
}

// Stream handler
builder.defineStreamHandler(async (args) => {
    const startTime = Date.now();
    
    try {
        console.log('Stream request received:', args);
        
        const { type, id } = args;
        let imdbId = id;
        let season = null;
        let episode = null;
        
        // Parse series ID format: tt1234567:1:1
        if (type === 'series' && id.includes(':')) {
            const parts = id.split(':');
            imdbId = parts[0];
            season = parts[1];
            episode = parts[2];
        }
        
        // Validate required parameters
        if (!imdbId) {
            throw new Error('No IMDB ID provided');
        }
        
        if (type === 'series' && (!season || !episode)) {
            throw new Error('Season and episode required for series');
        }
        
        const streams = await extractStreams(imdbId, type, season, episode);
        
        const duration = Date.now() - startTime;
        console.log(`Request completed in ${duration}ms with ${streams.length} streams`);
        
        return { 
            streams,
            cacheMaxAge: 300 // 5 minutes cache
        };
        
    } catch (error) {
        console.error('Stream handler error:', error);
        
        // Return error stream for debugging
        return { 
            streams: [{
                name: `Error: ${error.message}`,
                title: 'Debug - Check logs',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                behaviorHints: { notWebReady: false }
            }]
        };
    }
});

// Get addon interface
const addonInterface = builder.getInterface();

// Route parser for Vercel
function parseRoute(url) {
    // Remove leading slash and decode
    const path = decodeURIComponent(url.replace(/^\/+/, ''));
    
    console.log('Parsing route:', path);
    
    if (path === 'manifest.json' || path === '') {
        return { type: 'manifest' };
    }
    
    if (path.startsWith('stream/')) {
        const parts = path.split('/');
        if (parts.length >= 3) {
            return {
                type: 'stream',
                contentType: parts[1],
                id: parts[2]
            };
        }
    }
    
    return { type: 'unknown', path };
}

// Main Vercel handler
export default async (req, res) => {
    // CORS and security headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=300');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    try {
        const route = parseRoute(req.url);
        console.log('Route parsed:', route);
        
        if (route.type === 'manifest') {
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(manifest);
            return;
        }
        
        if (route.type === 'stream') {
            console.log('Handling stream request:', {
                type: route.contentType,
                id: route.id
            });
            
            const result = await builder.streamHandler({ 
                type: route.contentType, 
                id: route.id 
            });
            
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(result);
            return;
        }
        
        // Route not found
        res.status(404).json({ 
            error: 'Route not found',
            route: route,
            availableRoutes: [
                '/manifest.json',
                '/stream/{type}/{id}'
            ]
        });
        
    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
