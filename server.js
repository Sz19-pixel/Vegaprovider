// server.js - Fixed Local development server
import { createServer } from 'http';
import { URL } from 'url';
import addonHandler from './api/index.js';

const PORT = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // Create mock Vercel request/response objects
    const mockReq = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        query: new URL(req.url, `http://localhost:${PORT}`).searchParams
    };
    
    const mockRes = {
        _statusCode: 200,
        _headers: {},
        setHeader(key, value) {
            this._headers[key] = value;
            res.setHeader(key, value);
        },
        status(code) {
            this._statusCode = code;
            res.statusCode = code;
            return this;
        },
        json(data) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data, null, 2));
        },
        end(data) {
            if (data) res.write(data);
            res.end();
        }
    };
    
    try {
        await addonHandler(mockReq, mockRes);
    } catch (error) {
        console.error('Server error:', error);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
                error: 'Internal Server Error',
                message: error.message 
            }));
        }
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Stremio addon server running on port ${PORT}`);
    console.log(`📺 Manifest URL: http://localhost:${PORT}/manifest.json`);
    console.log(`🔗 Install URL: stremio://localhost:${PORT}/manifest.json`);
    console.log('');
    console.log('Available endpoints:');
    console.log(`  GET /manifest.json - Addon manifest`);
    console.log(`  GET /stream/movie/{imdb_id} - Movie streams`);
    console.log(`  GET /stream/series/{imdb_id}:{season}:{episode} - TV series streams`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
