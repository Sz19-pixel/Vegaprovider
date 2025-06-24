// server.js - Local development server
const { addonBuilder } = require('stremio-addon-sdk');
const addonInterface = require('./api/index.js').default;

const PORT = process.env.PORT || 3000;

// Create a simple HTTP server for local development
const http = require('http');
const url = require('url');

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // Create a mock Vercel-like request object
    const mockReq = {
        method: req.method,
        url: req.url,
        query: parsedUrl.query,
        headers: req.headers,
        body: req.body
    };
    
    // Create a mock Vercel-like response object
    const mockRes = {
        setHeader: (key, value) => res.setHeader(key, value),
        status: (code) => {
            res.statusCode = code;
            return mockRes;
        },
        json: (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
        },
        end: () => res.end()
    };
    
    try {
        await addonInterface(mockReq, mockRes);
    } catch (error) {
        console.error('Server error:', error);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Stremio addon server running on port ${PORT}`);
    console.log(`📺 Manifest URL: http://localhost:${PORT}/manifest.json`);
    console.log(`🔗 Install URL: stremio://localhost:${PORT}/manifest.json`);
});
