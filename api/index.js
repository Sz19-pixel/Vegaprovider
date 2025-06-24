// api/index.js - Fixed Multi-Source Streaming Addon for Vercel
import { addonBuilder } from 'stremio-addon-sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Addon manifest
const manifest = {
    id: 'community.multisource-streams-v2',
    version: '2.1.0',
    name: 'Multi-Source Streams Pro',
    description: 'Advanced streaming addon with multiple sources and quality detection',
    logo: 'https://i.imgur.com/5QjNvzO.png',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'tmdb:'],
    catalogs: [],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

// Optimized streaming providers with priority and timeout handling
const streamProviders = [
    {
        name: "VidSrc Pro",
        priority: 1,
        timeout: 12000,
        movie: "https://vidsrc.xyz/embed/movie/{imdb_id}",
        tv: "https://vidsrc.xyz/embed/tv/{imdb_id}/{season}/{episode}",
        extractor: extractVidSrcAdvanced
    },
    {
        name: "VidSrc Alt",
        priority: 2,
        timeout: 10000,
        movie: "https://vidsrc.me/embed/movie?imdb={imdb_id}",
        tv: "https://vidsrc.me/embed/tv?imdb={imdb_id}&season={season}&episode={episode}",
        extractor: extractVidSrcMe
    },
    {
        name: "2Embed Pro",
        priority: 3,
        timeout: 10000,
        movie: "https://2embed.to/embed/imdb/movie?id={imdb_id}",
        tv: "https://2embed.to/embed/imdb/tv?id={imdb_id}&s={season}&e={episode}",
        extractor: extract2EmbedAdvanced
    },
    {
        name: "Vidora Stream",
        priority: 4,
        timeout: 8000,
        movie: "https://vidora.su/embed/movie/{imdb_id}",
        tv: "https://vidora.su/embed/tv/{imdb_id}/{season}/{episode}",
        extractor: extractGenericEmbed
    },
    {
        name: "SuperEmbed",
        priority: 5,
        timeout: 8000,
        movie: "https://superembed.stream/embed/{imdb_id}",
        tv: "https://superembed.stream/embed/{imdb_id}",
        extractor: extractGenericEmbed
    }
];

// Optimized headers with real browser fingerprint
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1'
};

// Utility functions
function cleanImdbId(id) {
    return id.replace(/^tt/, '').replace(/^tmdb:/, '');
}

function findM3u8Links(text) {
    const patterns = [
        /https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/gi,
        /["']([^"']*\.m3u8(?:\?[^"']*)?)['"]/gi
    ];
    
    const links = new Set();
    patterns.forEach(pattern => {
        const matches = text.match(pattern) || [];
        matches.forEach(match => {
            const cleaned = match.replace(/['"]/g, '');
            if (cleaned.includes('.m3u8')) {
                links.add(cleaned);
            }
        });
    });
    
    return Array.from(links);
}

function findVideoLinks(text) {
    const videoRegex = /https?:\/\/[^\s"'<>]+\.(mp4|mkv|avi|webm|mov)(?:\?[^\s"'<>]*)?/gi;
    const matches = text.match(videoRegex) || [];
    return [...new Set(matches)];
}

// Enhanced VidSrc extractor
async function extractVidSrcAdvanced(url, timeout = 12000) {
    try {
        const response = await axios.get(url, { 
            headers, 
            timeout,
            maxRedirects: 3
        });
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Method 1: Data attributes
        $('[data-src*=".m3u8"], [data-video*=".m3u8"]').each((i, el) => {
            const src = $(el).attr('data-src') || $(el).attr('data-video');
            if (src) streams.push(src);
        });
        
        // Method 2: Script analysis with base64 decoding
        const scripts = $('script').map((i, el) => $(el).html()).get();
        for (const script of scripts) {
            if (script && script.includes('source')) {
                // Decode base64 patterns
                const base64Regex = /[A-Za-z0-9+/]{30,}={0,2}/g;
                const matches = script.match(base64Regex) || [];
                
                for (const match of matches) {
                    try {
                        const decoded = Buffer.from(match, 'base64').toString();
                        if (decoded.includes('.m3u8')) {
                            streams.push(...findM3u8Links(decoded));
                        }
                    } catch (e) { continue; }
                }
                
                // Direct m3u8 links in scripts
                streams.push(...findM3u8Links(script));
            }
        }
        
        // Method 3: Iframe processing (limited)
        const iframes = $('iframe[src]').slice(0, 2);
        for (let i = 0; i < iframes.length; i++) {
            const iframeSrc = $(iframes[i]).attr('src');
            if (iframeSrc) {
                try {
                    const fullUrl = iframeSrc.startsWith('http') ? iframeSrc : new URL(iframeSrc, url).href;
                    const iframeResponse = await axios.get(fullUrl, { 
                        headers, 
                        timeout: 8000,
                        maxRedirects: 2
                    });
                    streams.push(...findM3u8Links(iframeResponse.data));
                } catch (e) { continue; }
            }
        }
        
        return [...new Set(streams)];
    } catch (error) {
        console.error('VidSrc extraction error:', error.message);
        return [];
    }
}

// Enhanced VidSrc.me extractor
async function extractVidSrcMe(url, timeout = 10000) {
    try {
        const response = await axios.get(url, { headers, timeout });
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Look for player iframes with enhanced detection
        const playerSelectors = [
            'iframe[src*="player"]',
            'iframe[src*="embed"]',
            'iframe[data-src*="player"]'
        ];
        
        for (const selector of playerSelectors) {
            const playerIframe = $(selector).first();
            if (playerIframe.length) {
                const src = playerIframe.attr('src') || playerIframe.attr('data-src');
                if (src) {
                    try {
                        const fullUrl = src.startsWith('http') ? src : `https://vidsrc.me${src}`;
                        const playerResponse = await axios.get(fullUrl, { headers, timeout: 8000 });
                        streams.push(...findM3u8Links(playerResponse.data));
                    } catch (e) { continue; }
                }
            }
        }
        
        streams.push(...findM3u8Links(response.data));
        return [...new Set(streams)];
    } catch (error) {
        console.error('VidSrc.me extraction error:', error.message);
        return [];
    }
}

// Enhanced 2Embed extractor with server selection
async function extract2EmbedAdvanced(url, timeout = 10000) {
    try {
        const response = await axios.get(url, { headers, timeout });
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Server selection with multiple selectors
        const serverSelectors = [
            '.server-item[data-id]',
            '.btn-server[data-server]',
            '[data-embed]',
            '.server-option'
        ];
        
        const serverElements = [];
        serverSelectors.forEach(selector => {
            $(selector).each((i, el) => serverElements.push($(el)));
        });
        
        // Process first 3 servers to avoid timeout
        for (let i = 0; i < Math.min(serverElements.length, 3); i++) {
            const $el = serverElements[i];
            const serverId = $el.attr('data-id') || $el.attr('data-server') || $el.attr('data-embed');
            const serverUrl = $el.attr('href') || $el.attr('data-url');
            
            if (serverUrl) {
                try {
                    const fullUrl = serverUrl.startsWith('http') ? serverUrl : new URL(serverUrl, url).href;
                    const serverResponse = await axios.get(fullUrl, { 
                        headers, 
                        timeout: 6000,
                        maxRedirects: 2
                    });
                    streams.push(...findM3u8Links(serverResponse.data));
                } catch (e) { continue; }
            }
        }
        
        // Fallback iframe extraction
        if (streams.length === 0) {
            const iframes = $('iframe[src*="embed"]').slice(0, 2);
            for (let i = 0; i < iframes.length; i++) {
                const src = $(iframes[i]).attr('src');
                if (src) {
                    try {
                        const fullUrl = src.startsWith('http') ? src : `https:${src}`;
                        const iframeResponse = await axios.get(fullUrl, { headers, timeout: 6000 });
                        streams.push(...findM3u8Links(iframeResponse.data));
                    } catch (e) { continue; }
                }
            }
        }
        
        return [...new Set(streams)];
    } catch (error) {
        console.error('2Embed extraction error:', error.message);
        return [];
    }
}

// Generic extractor for most embed sites
async function extractGenericEmbed(url, timeout = 8000) {
    try {
        const response = await axios.get(url, { headers, timeout });
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Multiple extraction methods
        const extractionMethods = [
            // Direct m3u8 links
            () => findM3u8Links(response.data),
            
            // Video/source tags
            () => {
                const sources = [];
                $('video source[src*=".m3u8"], source[src*=".m3u8"]').each((i, el) => {
                    const src = $(el).attr('src');
                    if (src) sources.push(src);
                });
                return sources;
            },
            
            // Data attributes
            () => {
                const sources = [];
                $('[data-src*=".m3u8"], [data-video*=".m3u8"], [data-file*=".m3u8"]').each((i, el) => {
                    const $el = $(el);
                    const src = $el.attr('data-src') || $el.attr('data-video') || $el.attr('data-file');
                    if (src) sources.push(src);
                });
                return sources;
            },
            
            // JavaScript variables
            () => {
                const sources = [];
                const scripts = $('script').map((i, el) => $(el).html()).get();
                
                const patterns = [
                    /(?:file|source|src|url)['"\s]*:['"\s]*['"]([^'"]*\.m3u8[^'"]*)['"]/gi,
                    /['"]([^'"]*\.m3u8[^'"]*)['"]/gi
                ];
                
                scripts.forEach(script => {
                    if (script) {
                        patterns.forEach(pattern => {
                            let match;
                            while ((match = pattern.exec(script)) !== null) {
                                sources.push(match[1]);
                            }
                        });
                    }
                });
                
                return sources;
            }
        ];
        
        // Apply extraction methods
        extractionMethods.forEach(method => {
            try {
                streams.push(...method());
            } catch (e) { /* ignore */ }
        });
        
        // Limited iframe recursion
        const iframes = $('iframe[src]').slice(0, 1);
        for (let i = 0; i < iframes.length; i++) {
            const iframeSrc = $(iframes[i]).attr('src');
            if (iframeSrc && !iframeSrc.includes(new URL(url).hostname)) {
                try {
                    const fullUrl = iframeSrc.startsWith('http') ? iframeSrc : new URL(iframeSrc, url).href;
                    const iframeStreams = await extractGenericEmbed(fullUrl, 5000);
                    streams.push(...iframeStreams);
                } catch (e) { continue; }
            }
        }
        
        return [...new Set(streams)];
    } catch (error) {
        console.error('Generic extraction error:', error.message);
        return [];
    }
}

// Enhanced quality detection
function detectQuality(url, filename = '') {
    const text = `${url} ${filename}`.toLowerCase();
    
    if (text.match(/4k|2160p|uhd|ultra/)) return '4K UHD';
    if (text.match(/1440p|2k/)) return '1440p QHD';
    if (text.match(/1080p|fhd|full.*hd/)) return '1080p FHD';
    if (text.match(/720p|hd(?!.*1080)/)) return '720p HD';
    if (text.match(/480p|sd/)) return '480p SD';
    if (text.match(/360p|low/)) return '360p';
    if (text.match(/auto|adaptive/)) return 'Auto';
    
    return 'HD';
}

// Stream validation with timeout
async function validateStream(url) {
    try {
        const response = await axios.head(url, { 
            headers: { 'User-Agent': headers['User-Agent'] }, 
            timeout: 3000,
            maxRedirects: 2
        });
        
        const contentType = response.headers['content-type'] || '';
        return contentType.includes('video/') || 
               contentType.includes('application/vnd.apple.mpegurl') ||
               contentType.includes('application/x-mpegURL') ||
               url.includes('.m3u8');
    } catch (error) {
        return true; // Assume valid if can't validate
    }
}

// Main extraction function with parallel processing
async function extractStreams(imdbId, type, season = null, episode = null) {
    const cleanId = cleanImdbId(imdbId);
    const extractionPromises = [];
    
    // Create extraction promises for parallel execution
    streamProviders.forEach(provider => {
        const promise = (async () => {
            try {
                let url;
                if (type === 'series' && season && episode) {
                    url = provider.tv
                        .replace('{imdb_id}', cleanId)
                        .replace('{season}', season)
                        .replace('{episode}', episode);
                } else {
                    url = provider.movie.replace('{imdb_id}', cleanId);
                }
                
                console.log(`Extracting from ${provider.name}: ${url}`);
                const links = await provider.extractor(url, provider.timeout);
                
                return links.map((link, index) => ({
                    name: `${provider.name} - ${detectQuality(link)}`,
                    title: `${provider.name} Stream ${index + 1}`,
                    url: link,
                    quality: detectQuality(link),
                    behaviorHints: {
                        notWebReady: false,
                        bingeGroup: `${provider.name}-${type}`
                    }
                }));
            } catch (error) {
                console.error(`Error with ${provider.name}:`, error.message);
                return [];
            }
        })();
        
        extractionPromises.push(promise);
    });
    
    // Wait for all extractions with timeout
    try {
        const results = await Promise.allSettled(extractionPromises);
        const streams = [];
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                streams.push(...result.value);
                if (result.value.length > 0) {
                    console.log(`Found ${result.value.length} streams from ${streamProviders[index].name}`);
                }
            }
        });
        
        // Sort by quality preference
        const qualityOrder = ['4K UHD', '1440p QHD', '1080p FHD', '720p HD', 'Auto', 'HD', '480p SD', '360p'];
        streams.sort((a, b) => {
            const aIndex = qualityOrder.indexOf(a.quality);
            const bIndex = qualityOrder.indexOf(b.quality);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        });
        
        return streams.slice(0, 20); // Limit to top 20 streams
    } catch (error) {
        console.error('Stream extraction error:', error);
        return [];
    }
}

// Create addon builder
const builder = new addonBuilder(manifest);

// Stream handler with caching headers
builder.defineStreamHandler(async (args) => {
    const startTime = Date.now();
    
    try {
        const { type, id } = args;
        let imdbId = id;
        let season = null;
        let episode = null;
        
        // Parse series ID
        if (type === 'series') {
            const parts = id.split(':');
            imdbId = parts[0];
            season = parts[1];
            episode = parts[2];
        }
        
        console.log(`Processing ${type}: ${imdbId}${season ? ` S${season}E${episode}` : ''}`);
        
        const streams = await extractStreams(imdbId, type, season, episode);
        
        const duration = Date.now() - startTime;
        console.log(`Found ${streams.length} streams in ${duration}ms`);
        
        return { 
            streams,
            cacheMaxAge: 300 // Cache for 5 minutes
        };
    } catch (error) {
        console.error('Stream handler error:', error);
        return { streams: [] };
    }
});

// Get addon interface
const addonInterface = builder.getInterface();

// Helper function to parse URL path and extract route info
function parseAddonRoute(url) {
    const path = url.replace(/^\/+/, ''); // Remove leading slashes
    const parts = path.split('/');
    
    if (parts[0] === 'manifest.json' || parts.length === 1) {
        return { type: 'manifest' };
    }
    
    if (parts[0] === 'stream' && parts.length >= 3) {
        const contentType = parts[1];
        const id = parts[2];
        return { type: 'stream', contentType, id };
    }
    
    return { type: 'unknown' };
}

// Vercel serverless function handler
export default async (req, res) => {
    // Performance and security headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    try {
        const route = parseAddonRoute(req.url);
        
        if (route.type === 'manifest') {
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(manifest);
            return;
        }
        
        if (route.type === 'stream') {
            const result = await builder.streamHandler({ 
                type: route.contentType, 
                id: route.id 
            });
            
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(result);
            return;
        }
        
        // Default fallback - try to handle with addon interface
        if (typeof addonInterface === 'function') {
            const result = await addonInterface(req);
            if (result && typeof result === 'object') {
                res.setHeader('Content-Type', 'application/json');
                res.status(200).json(result);
                return;
            }
        }
        
        // If we get here, route not found
        res.status(404).json({ 
            error: 'Route not found',
            availableRoutes: [
                '/manifest.json',
                '/stream/{type}/{id}'
            ]
        });
        
    } catch (error) {
        console.error('Request handler error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }
};
