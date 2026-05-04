const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const src = path.join(cwd, 'no background.png');
const dest = path.join(cwd, 'assets', 'no-background.png');
fs.copyFileSync(src, dest);
fs.readdirSync(cwd)
  .filter(f => f.endsWith('.html'))
  .forEach(f => {
    const p = path.join(cwd, f);
    let t = fs.readFileSync(p, 'utf8');
    t = t.replace(/https:\/\/images\.unsplash\.com[^\"\'\s]*/g, 'assets/no-background.png');
    t = t.replace(/https:\/\/via\.placeholder\.com[^\"\'\s]*/g, 'assets/no-background.png');
    fs.writeFileSync(p, t, 'utf8');
  });
console.log('Replaced remote images in HTML files.');
