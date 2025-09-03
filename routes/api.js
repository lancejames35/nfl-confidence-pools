const express = require('express');
const router = express.Router();

// API routes placeholder

router.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        message: 'API is running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;