const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./index');

const port = process.env.PORT || 3000;

serveHTTP(addonInterface, { port }).then(() => {
    console.log(`Stremio VegaMovies addon is running on port ${port}`);
    console.log(`Addon URL: http://localhost:${port}/manifest.json`);
}).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
}); 
