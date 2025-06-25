// api/index.js - Fixed Multi-Source Streaming Addon for Vercel
import { addonBuilder } from 'stremio-addon-sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Addon manifest
const manifest = {
    id: 'community.multisource-streams-v4',
    version: '4.0.0',
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

// Enhanced headers with rotation
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

function getRandomHeaders() {
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Referer': 'https://www.google.com/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site'
    };
}

// Utility function to clean IMDB ID
function cleanImdbId(id) {
    if (id.startsWith('tmdb:')) {
        return id.replace('tmdb:', '');
    }
    return id.replace(/^tt/, '');
}

// Enhanced M3U8 and MP4 link finder
function findStreamLinks(text) {
    const patterns = [
        // M3U8 patterns
        /https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/gi,
        /["']([^"']*\.m3u8(?:\?[^"']*)?)['"]/gi,
        /file['"\s]*:['"\s]*['"]([^'"]*\.m3u8[^'"]*)['"]/gi,
        /source['"\s]*:['"\s]*['"]([^'"]*\.m3u8[^'"]*)['"]/gi,
        
        // MP4 patterns
        /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi,
        /["']([^"']*\.mp4(?:\?[^"']*)?)['"]/gi,
        /file['"\s]*:['"\s]*['"]([^'"]*\.mp4[^'"]*)['"]/gi,
        /source['"\s]*:['"\s]*['"]([^'"]*\.mp4[^'"]*)['"]/gi,
        
        // General video patterns
        /https?:\/\/[^\s"'<>]*\/[^\s"'<>]*\.(m3u8|mp4|mkv|avi)(?:\?[^\s"'<>]*)?/gi
    ];
    
    const links = new Set();
    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const link = match[1] || match[0];
            const cleaned = link.replace(/['"]/g, '');
            if ((cleaned.includes('.m3u8') || cleaned.includes('.mp4')) && cleaned.startsWith('http')) {
                links.add(cleaned);
            }
        }
    });
    
    return Array.from(links);
}

// VidSrc.xyz extractor - Updated
async function extractVidSrc(imdbId, type, season = null, episode = null) {
    try {
        let url;
        if (type === 'series' && season && episode) {
            url = `https://vidsrc.xyz/embed/tv/tt${imdbId}/${season}/${episode}`;
        } else {
            url = `https://vidsrc.xyz/embed/movie/tt${imdbId}`;
        }
        
        console.log(`VidSrc: Extracting from ${url}`);
        
        const response = await axios.get(url, { 
            headers: getRandomHeaders(), 
            timeout: 15000,
            maxRedirects: 5
        });
        
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Extract iframe sources
        $('iframe').each((i, el) => {
            const src = $(el).attr('src');
            if (src) {
                const fullSrc = src.startsWith('http') ? src : `https://vidsrc.xyz${src}`;
                console.log(`Found iframe: ${fullSrc}`);
                // Add iframe as a stream source
                streams.push(fullSrc);
            }
        });
        
        // Extract from scripts
        const scripts = $('script').map((i, el) => $(el).html()).get();
        for (const script of scripts) {
            if (script) {
                const streamLinks = findStreamLinks(script);
                streams.push(...streamLinks);
                
                // Decode base64 encoded content
                const base64Regex = /[A-Za-z0-9+/]{40,}={0,2}/g;
                const matches = script.match(base64Regex) || [];
                
                for (const match of matches) {
                    try {
                        const decoded = Buffer.from(match, 'base64').toString();
                        if (decoded.includes('.m3u8') || decoded.includes('.mp4')) {
                            streams.push(...findStreamLinks(decoded));
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

// 2Embed extractor - Updated
async function extract2Embed(imdbId, type, season = null, episode = null) {
    try {
        let url;
        if (type === 'series' && season && episode) {
            url = `https://www.2embed.cc/embed/tt${imdbId}?s=${season}&e=${episode}`;
        } else {
            url = `https://www.2embed.cc/embed/tt${imdbId}`;
        }
        
        console.log(`2Embed: Extracting from ${url}`);
        
        const response = await axios.get(url, { 
            headers: getRandomHeaders(), 
            timeout: 12000,
            maxRedirects: 3
        });
        
        const streams = findStreamLinks(response.data);
        console.log(`2Embed: Found ${streams.length} streams`);
        return streams;
        
    } catch (error) {
        console.error('2Embed extraction error:', error.message);
        return [];
    }
}

// SuperEmbed extractor - Updated
async function extractSuperEmbed(imdbId, type, season = null, episode = null) {
    try {
        let url;
        if (type === 'series' && season && episode) {
            url = `https://multiembed.mov/directstream.php?video_id=tt${imdbId}&s=${season}&e=${episode}`;
        } else {
            url = `https://multiembed.mov/directstream.php?video_id=tt${imdbId}`;
        }
        
        console.log(`SuperEmbed: Extracting from ${url}`);
        
        const response = await axios.get(url, { 
            headers: getRandomHeaders(), 
            timeout: 12000
        });
        
        const streams = findStreamLinks(response.data);
        console.log(`SuperEmbed: Found ${streams.length} streams`);
        return streams;
        
    } catch (error) {
        console.error('SuperEmbed extraction error:', error.message);
        return [];
    }
}

// Additional extractor - VidSrc.to
async function extractVidSrcTo(imdbId, type, season = null, episode = null) {
    try {
        let url;
        if (type === 'series' && season && episode) {
            url = `https://vidsrc.to/embed/tv/tt${imdbId}/${season}/${episode}`;
        } else {
            url = `https://vidsrc.to/embed/movie/tt${imdbId}`;
        }
        
        console.log(`VidSrc.to: Extracting from ${url}`);
        
        const response = await axios.get(url, { 
            headers: getRandomHeaders(), 
            timeout: 12000,
            maxRedirects: 5
        });
        
        const streams = findStreamLinks(response.data);
        console.log(`VidSrc.to: Found ${streams.length} streams`);
        return streams;
        
    } catch (error) {
        console.error('VidSrc.to extraction error:', error.message);
        return [];
    }
}

// Quality detection
function detectQuality(url) {
    const text = url.toLowerCase();
    
    if (text.includes('4k') || text.includes('2160p') || text.includes('uhd')) return '4K UHD';
    if (text.includes('1440p') || text.includes('2k') || text.includes('qhd')) return '1440p QHD';
    if (text.includes('1080p') || text.includes('fhd') || text.includes('fullhd')) return '1080p FHD';
    if (text.includes('720p') || text.includes('hd')) return '720p HD';
    if (text.includes('480p') || text.includes('sd')) return '480p SD';
    if (text.includes('360p')) return '360p';
    if (text.includes('240p')) return '240p';
    
    // Check for quality indicators in URL path
    if (text.match(/\/1080\/|\/1080p\/|\/fhd\//)) return '1080p FHD';
    if (text.match(/\/720\/|\/720p\/|\/hd\//)) return '720p HD';
    if (text.match(/\/480\/|\/480p\/|\/sd\//)) return '480p SD';
    
    return 'HD'; // Default quality
}

// Stream validation
async function validateStream(url) {
    try {
        const response = await axios.head(url, {
            timeout: 5000,
            headers: getRandomHeaders()
        });
        
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// Main stream extraction function
async function extractStreams(imdbId, type, season = null, episode = null) {
    console.log(`Extracting streams for: tt${imdbId} (${type}${season ? ` S${season}E${episode}` : ''})`);
    
    const cleanId = cleanImdbId(imdbId);
    const streams = [];
    
    // Try multiple extractors with proper error handling
    const extractors = [
        { name: 'VidSrc', func: extractVidSrc(cleanId, type, season, episode) },
        { name: 'VidSrc.to', func: extractVidSrcTo(cleanId, type, season, episode) },
        { name: '2Embed', func: extract2Embed(cleanId, type, season, episode) },
        { name: 'SuperEmbed', func: extractSuperEmbed(cleanId, type, season, episode) }
    ];
    
    try {
        const results = await Promise.allSettled(extractors.map(e => e.func));
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.length > 0) {
                const extractorName = extractors[index].name;
                
                result.value.slice(0, 5).forEach((link, linkIndex) => {
                    const quality = detectQuality(link);
                    const streamName = `${extractorName} - ${quality}`;
                    
                    streams.push({
                        name: streamName,
                        title: `${extractorName} Stream ${linkIndex + 1}`,
                        url: link,
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: `${extractorName}-${type}`,
                            countryWhitelist: ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE']
                        }
                    });
                });
            }
        });
        
        // Add working test streams if no streams found
        if (streams.length === 0) {
            console.log('No streams found, adding test streams');
            streams.push(
                {
                    name: 'Big Buck Bunny - 1080p',
                    title: 'Test Stream - Big Buck Bunny',
                    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                    behaviorHints: { notWebReady: false }
                },
                {
                    name: 'Sintel - 720p',
                    title: 'Test Stream - Sintel',
                    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
                    behaviorHints: { notWebReady: false }
                },
                {
                    name: 'Elephant Dream - HLS',
                    title: 'Test Stream - HLS',
                    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
                    behaviorHints: { notWebReady: false }
                }
            );
        }
        
        // Sort streams by quality (highest first)
        const qualityOrder = ['4K UHD', '1440p QHD', '1080p FHD', '720p HD', '480p SD', '360p', '240p', 'HD'];
        streams.sort((a, b) => {
            const aQuality = a.name.split(' - ').pop();
            const bQuality = b.name.split(' - ').pop();
            return qualityOrder.indexOf(aQuality) - qualityOrder.indexOf(bQuality);
        });
        
        console.log(`Total streams found: ${streams.length}`);
        return streams.slice(0, 20); // Limit to 20 streams
        
    } catch (error) {
        console.error('Stream extraction error:', error);
        return [{
            name: 'Error - Service temporarily unavailable',
            title: 'Please try again later',
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
        
        // Validate IMDB ID format
        if (!imdbId || (!imdbId.startsWith('tt') && !imdbId.match(/^\d+$/))) {
            throw new Error('Invalid IMDB ID format');
        }
        
        // Validate series parameters
        if (type === 'series' && (!season || !episode)) {
            throw new Error('Season and episode required for series');
        }
        
        const streams = await extractStreams(imdbId, type, season, episode);
        
        const duration = Date.now() - startTime;
        console.log(`Request completed in ${duration}ms with ${streams.length} streams`);
        
        return { 
            streams,
            cacheMaxAge: 600 // 10 minutes cache
        };
        
    } catch (error) {
        console.error('Stream handler error:', error);
        
        return { 
            streams: [{
                name: `Error: ${error.message}`,
                title: 'Check addon logs for details',
                url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                behaviorHints: { notWebReady: false }
            }]
        };
    }
});

// Get addon interface
const addonInterface = builder.getInterface();

// Enhanced route parser
function parseRoute(url) {
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
    // Enhanced CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
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
            
            const addonInterface = builder.getInterface();

if (typeof addonInterface['stream'] !== 'function') {
    throw new Error('Stream handler is not defined correctly.');
}

const result = await addonInterface['stream']({
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
            ],
            examples: [
                '/stream/movie/tt1234567',
                '/stream/series/tt1234567:1:1'
            ]
        });
        
    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
};
