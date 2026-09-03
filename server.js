/**
 * WebMCP Dual-Accessibility Studio — Production Server
 * Serves the Studio UI, showcase web apps, WebMCP runtime, and proxy scan API.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/axe.js', express.static(path.join(__dirname, 'axe.js')));
app.use('/axe.min.js', express.static(path.join(__dirname, 'axe.min.js')));

/**
 * Health check endpoint for deployment monitoring.
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'webmcp-studio',
    version: '1.0.0',
    spec: 'W3C Web Machine Learning CG WebMCP Draft (2026-09)',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

/**
 * System metadata endpoint.
 */
app.get('/api/info', (req, res) => {
  res.json({
    name: 'WebMCP Dual-Accessibility Studio',
    description: 'Autonomous AI Agent Co-pilot leveraging WebMCP for closed-loop web accessibility remediation.',
    features: [
      'In-browser WebMCP tool discovery (document.modelContext)',
      'Dual-A11y Evaluation (Human WCAG 2.0/2.1/2.2 + Agent WebMCP Health)',
      'Evidence-First Finding Lifecycle (5 States)',
      'Interactive Human-in-the-Loop Checkpoints for Ambiguity & High-Risk Mutations',
      'Live WebMCP Actuation & Continuous Verification Retest'
    ],
    supportedShowcases: ['Apex HealthCare EHR', 'FinFlow Corporate Treasury']
  });
});

/**
 * URL proxy scan endpoint allowing the Studio to audit arbitrary external web pages safely.
 */
app.post('/api/proxy-scan', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only HTTP and HTTPS protocols are supported' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(parsedUrl.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'WebMCP-DualA11y-Agent/1.0'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Target server responded with HTTP ${response.status}: ${response.statusText}`
      });
    }

    const html = await response.text();
    return res.json({
      url: parsedUrl.href,
      html: html.substring(0, 500000), // Limit size for safety
      contentLength: html.length,
      timestamp: Date.now()
    });
  } catch (err) {
    return res.status(500).json({
      error: `Failed to fetch target URL: ${err.message}`
    });
  }
});

// Fallback route to Studio index
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`⚡ WebMCP Dual-Accessibility Studio LIVE on port ${PORT}`);
    console.log(`   URL: http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`======================================================\n`);
  });
}

export default app;
