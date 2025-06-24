// api/index.js - Vercel API Route
const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

// Addon manifest
const manifest = {
    id: 'community.vegamovies',
    version: '1.0.0',
    name: 'VegaMovies',
    description: 'Stream movies and TV series from VegaMovies, LuxMovies, and RogMovies',
    logo: 'https://github.com/SaurabhKaperwan/CSX/raw/refs/heads/master/VegaMovies/icon.jpg',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'vegamovies-movies',
            name: 'VegaMovies Movies',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'vegamovies-series',
            name: 'VegaMovies Series',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'luxmovies-movies',
            name: 'LuxMovies',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'luxmovies-series',
            name: 'LuxMovies Series',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'rogmovies-movies',
            name: 'RogMovies',
            extra: [{ name: 'skip', isRequired: false }]
        }
    ],
    idPrefixes: ['vegamovies:', 'luxmovies:', 'rogmovies:']
};

// Provider configurations
const providers = {
    vegamovies: {
        baseUrl: 'https://vegamovies.yoga',
        name: 'VegaMovies',
        urlKey: 'vegamovies'
    },
    luxmovies: {
        baseUrl: 'https://luxmovies.tattoo',
        name: 'LuxMovies',
        urlKey: 'luxmovies'
    },
    rogmovies: {
        baseUrl: 'https://rogmovies.mom',
        name: 'RogMovies',
        urlKey: 'rogmovies'
    }
};

// HTTP headers for requests
const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Cache-Control': 'no-cache'
};

// Cache for dynamic URLs
let urlCache = {};
let cacheTimestamp = 0;
const CACHE_DURATION = 3600000; // 1 hour

// Function to get dynamic URLs
async function getDynamicUrls() {
    const now = Date.now();
    if (urlCache && Object.keys(urlCache).length > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
        return urlCache;
    }

    try {
        const response = await axios.get('https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json', {
            timeout: 10000
        });
        urlCache = response.data;
        cacheTimestamp = now;
        return urlCache;
    } catch (error) {
        console.error('Failed to fetch dynamic URLs:', error.message);
        return {};
    }
}

// Function to get the actual base URL for a provider
async function getProviderUrl(providerKey) {
    const dynamicUrls = await getDynamicUrls();
    return dynamicUrls[providers[providerKey].urlKey] || providers[providerKey].baseUrl;
}

// Function to scrape catalog items
async function scrapeCatalog(providerKey, type, page = 1) {
    try {
        const baseUrl = await getProviderUrl(providerKey);
        let url;

        if (providerKey === 'vegamovies') {
            url = type === 'series' 
                ? `${baseUrl}/web-series/netflix/page/${page}/`
                : `${baseUrl}/page/${page}/`;
        } else {
            url = type === 'series'
                ? `${baseUrl}/category/web-series/netflix/page/${page}/`
                : `${baseUrl}/page/${page}/`;
        }

        const response = await axios.get(url, {
            headers,
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const items = [];

        if (providerKey === 'vegamovies') {
            $('.post-inner.post-hover').each((i, element) => {
                const $el = $(element);
                const title = $el.find('h2 > a').text().replace('Download ', '').trim();
                const href = $el.find('a').attr('href');
                let posterUrl = $el.find('img').attr('src');
                
                if (posterUrl && posterUrl.includes('data:image')) {
                    posterUrl = $el.find('img').attr('data-lazy-src');
                }

                if (title && href) {
                    items.push({
                        id: `${providerKey}:${Buffer.from(href).toString('base64')}`,
                        type: type,
                        name: title,
                        poster: posterUrl || undefined,
                        genres: ['Indian'],
                        description: `Watch ${title} on ${providers[providerKey].name}`
                    });
                }
            });
        } else {
            $('a.blog-img').each((i, element) => {
                const $el = $(element);
                const title = $el.attr('title')?.replace('Download ', '').trim();
                const href = $el.attr('href');
                let posterUrl = $el.find('img').attr('data-src') || $el.find('img').attr('src');

                if (title && href) {
                    items.push({
                        id: `${providerKey}:${Buffer.from(href).toString('base64')}`,
                        type: type,
                        name: title,
                        poster: posterUrl || undefined,
                        genres: ['Indian'],
                        description: `Watch ${title} on ${providers[providerKey].name}`
                    });
                }
            });
        }

        return items;
    } catch (error) {
        console.error(`Error scraping catalog for ${providerKey}:`, error.message);
        return [];
    }
}

// Function to get meta information
async function getMeta(id) {
    try {
        const [providerKey, encodedUrl] = id.split(':');
        const url = Buffer.from(encodedUrl, 'base64').toString();
        
        const response = await axios.get(url, {
            headers,
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        
        let title = $('meta[property="og:title"]').attr('content')?.replace('Download ', '') || '';
        const posterUrl = $('meta[property="og:image"]').attr('content');
        const div = $('.entry-content, .entry-inner').first();
        let description = div.find('h3:contains("SYNOPSIS"), h4:contains("SYNOPSIS"), h3:contains("PLOT"), h4:contains("PLOT")').next().text();
        
        const imdbUrl = div.find('a:contains("Rating")').attr('href');
        const heading = div.find('h3 > strong > span').text();
        
        const isSeries = heading.includes('Series') || heading.includes('SHOW');
        const type = isSeries ? 'series' : 'movie';

        // Try to get IMDB data
        let imdbData = null;
        if (imdbUrl) {
            const imdbId = imdbUrl.split('title/')[1]?.split('/')[0];
            if (imdbId) {
                try {
                    const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
                    const imdbResponse = await axios.get(cinemetaUrl, { timeout: 10000 });
                    imdbData = imdbResponse.data.meta;
                } catch (e) {
                    console.log('IMDB data not available');
                }
            }
        }

        const meta = {
            id: id,
            type: type,
            name: imdbData?.name || title,
            poster: imdbData?.poster || posterUrl,
            background: imdbData?.background || posterUrl,
            description: imdbData?.description || description,
            genre: imdbData?.genre || ['Indian'],
            cast: imdbData?.cast || [],
            imdbRating: imdbData?.imdbRating,
            year: imdbData?.year,
            runtime: imdbData?.runtime
        };

        if (type === 'series' && imdbData?.videos) {
            meta.videos = imdbData.videos.map(video => ({
                id: `${id}:${video.season}:${video.episode}`,
                title: video.title || video.name,
                season: video.season,
                episode: video.episode,
                thumbnail: video.thumbnail,
                overview: video.overview,
                released: video.released
            }));
        }

        return meta;
    } catch (error) {
        console.error('Error getting meta:', error.message);
        return null;
    }
}

// Function to extract streaming links
async function getStreams(id) {
    try {
        const [providerKey, encodedUrl, season, episode] = id.split(':');
        const url = Buffer.from(encodedUrl, 'base64').toString();
        
        const response = await axios.get(url, {
            headers,
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const streams = [];

        // Check if it's a series or movie
        const heading = $('.entry-content, .entry-inner').find('h3 > strong > span').text();
        const isSeries = heading.includes('Series') || heading.includes('SHOW');

        if (isSeries && season && episode) {
            // Handle series episodes
            const hTags = $('.entry-content, .entry-inner').find('h3:contains("4K"), h3:contains("1080p"), h3:contains("720p"), h3:contains("480p"), h5:contains("4K"), h5:contains("1080p"), h5:contains("720p"), h5:contains("480p")');
            
            for (let i = 0; i < hTags.length; i++) {
                const tag = $(hTags[i]);
                const seasonMatch = tag.text().match(/(?:Season |S)(\d+)/);
                const tagSeason = seasonMatch ? parseInt(seasonMatch[1]) : 1;
                
                if (tagSeason === parseInt(season)) {
                    const pTag = tag.next('p');
                    const aTags = pTag.length ? pTag.find('a') : tag.find('a');
                    
                    const downloadLink = aTags.filter((j, el) => {
                        const text = $(el).text();
                        return text.includes('V-Cloud') || text.includes('Episode') || text.includes('Download');
                    }).first();

                    if (downloadLink.length) {
                        const linkUrl = downloadLink.attr('href');
                        if (linkUrl) {
                            try {
                                const linkResponse = await axios.get(linkUrl, { headers, timeout: 10000 });
                                
                                // Extract various streaming links
                                const vcloudRegex = /https:\/\/vcloud\.lol\/[^\s"]+/g;
                                const fastdlRegex = /https:\/\/fastdl\.icu\/embed\?download=[a-zA-Z0-9]+/g;
                                
                                let matches = linkResponse.data.match(vcloudRegex) || [];
                                if (matches.length === 0) {
                                    matches = linkResponse.data.match(fastdlRegex) || [];
                                }

                                matches.forEach((streamUrl, index) => {
                                    if (index + 1 === parseInt(episode)) {
                                        streams.push({
                                            name: `${providers[providerKey].name} - S${season}E${episode}`,
                                            title: `${providers[providerKey].name} - Season ${season} Episode ${episode}`,
                                            url: streamUrl,
                                            behaviorHints: {
                                                notWebReady: true
                                            }
                                        });
                                    }
                                });
                            } catch (e) {
                                console.error('Error extracting episode link:', e.message);
                            }
                        }
                    }
                    break;
                }
            }
        } else {
            // Handle movies
            const buttons = $('p > a:has(button)');
            for (let i = 0; i < buttons.length; i++) {
                const button = $(buttons[i]);
                const linkUrl = button.attr('href');
                
                if (linkUrl) {
                    try {
                        const linkResponse = await axios.get(linkUrl, { headers, timeout: 10000 });
                        const link$ = cheerio.load(linkResponse.data);
                        
                        const vcloudLink = link$('a:contains("V-Cloud")').attr('href');
                        if (vcloudLink) {
                            streams.push({
                                name: `${providers[providerKey].name} - Quality ${i + 1}`,
                                title: `${providers[providerKey].name} Stream`,
                                url: vcloudLink,
                                behaviorHints: {
                                    notWebReady: true
                                }
                            });
                        }
                    } catch (e) {
                        console.error('Error extracting movie link:', e.message);
                    }
                }
            }
        }

        return streams;
    } catch (error) {
        console.error('Error getting streams:', error.message);
        return [];
    }
}

// Create addon builder
const builder = new addonBuilder(manifest);

// Catalog handler
builder.defineCatalogHandler(async (args) => {
    const { type, id, extra } = args;
    const skip = parseInt(extra?.skip) || 0;
    const page = Math.floor(skip / 20) + 1;
    
    let providerKey;
    if (id.includes('vegamovies')) providerKey = 'vegamovies';
    else if (id.includes('luxmovies')) providerKey = 'luxmovies';
    else if (id.includes('rogmovies')) providerKey = 'rogmovies';
    else return { metas: [] };

    const items = await scrapeCatalog(providerKey, type, page);
    return { metas: items };
});

// Meta handler
builder.defineMetaHandler(async (args) => {
    const { id } = args;
    const meta = await getMeta(id);
    return meta ? { meta } : { meta: null };
});

// Stream handler
builder.defineStreamHandler(async (args) => {
    const { id } = args;
    const streams = await getStreams(id);
    return { streams };
});

const addonInterface = builder.getInterface();

// Vercel serverless function handler
module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    try {
        const result = await addonInterface(req);
        
        // Set content type for JSON responses
        if (result && typeof result === 'object') {
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(result);
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } catch (error) {
        console.error('Error handling request:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
