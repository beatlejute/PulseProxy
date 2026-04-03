const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname);

console.log('Serving from:', root);

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  const file = path.join(root, urlPath);

  // Security check: prevent path traversal
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  console.log('Request:', urlPath, '->', file);

  try {
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      const indexFile = path.join(file, 'index.html');
      try {
        const data = fs.readFileSync(indexFile);
        res.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*'});
        res.end(data);
        return;
      } catch(e) {}
      // Directory listing
      const files = fs.readdirSync(file).map(f => `<li><a href="${urlPath}/${f}">${f}</a></li>`).join('');
      res.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*'});
      res.end(`<ul>${files}</ul>`);
      return;
    }

    const data = fs.readFileSync(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const mimeTypes = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      gif: 'image/gif',
      svg: 'image/svg+xml'
    };
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'text/plain',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  } catch(e) {
    console.log('Error:', e.message);
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('Not found: ' + urlPath);
  }
}).listen(3456, '0.0.0.0', () => {
  console.log('HTTP server running on port 3456');
  console.log('Root directory:', root);
});
