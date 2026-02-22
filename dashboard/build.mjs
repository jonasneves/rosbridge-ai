import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { createHash } from 'crypto';

mkdirSync('dist', { recursive: true });

async function minifyAndWrite(srcFile, loader) {
  const { code } = await esbuild.transform(readFileSync(srcFile, 'utf8'), { loader, minify: true });
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
  const name = srcFile.replace(/\.(\w+)$/, `.${hash}.$1`);
  writeFileSync(`dist/${name}`, code);
  return name;
}

const [jsFile, cssFile] = await Promise.all([
  minifyAndWrite('ros-webmcp.js', 'js'),
  minifyAndWrite('style.css', 'css'),
]);

let html = readFileSync('index.html', 'utf8');
html = html.replace('href="style.css"', `href="${cssFile}"`);
html = html.replace('src="ros-webmcp.js"', `src="${jsFile}"`);
writeFileSync('dist/index.html', html);

copyFileSync('logo.jpg', 'dist/logo.jpg');

const logoB64 = readFileSync('logo.jpg').toString('base64');
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs><image href="data:image/jpeg;base64,${logoB64}" width="100" height="100" clip-path="url(#c)"/></svg>`;
writeFileSync('dist/favicon.svg', faviconSvg);

console.log(`dist/ → ${jsFile}, ${cssFile}, index.html, logo.jpg, favicon.svg`);
