/* Gera css/style.min.css a partir de css/style.css.
 *
 * Por que existe: o style.css tem 145KB, e boa parte e comentario -- a
 * documentacao de cada decisao de layout, que e util para quem le o codigo e
 * inutil para quem visita o site. Minificado, o arquivo que BLOQUEIA a
 * renderizacao cai 13KB depois de comprimido.
 *
 * O repo nao tem package.json de proposito (o api/evento.mjs depende disso
 * para ser lido como ESM), entao nao ha passo de build na Vercel: o .min e
 * COMMITADO. Depois de mexer no style.css, rode:
 *
 *     node scripts/build-css.mjs
 *
 * e commite os dois. Sem isso a alteracao nao chega ao site.
 *
 * Precisa do esbuild:  npx esbuild@0.24 --version
 */
import { transformSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync } from 'node:zlib';

const src = new URL('../css/style.css', import.meta.url);
const out = new URL('../css/style.min.css', import.meta.url);

const css = readFileSync(src, 'utf8');
const { code } = transformSync(css, { loader: 'css', minify: true });
writeFileSync(out, code);

const kb = (x) => (brotliCompressSync(Buffer.from(x)).length / 1024).toFixed(1);
console.log(`style.css      ${(css.length / 1024).toFixed(1)}KB cru, ${kb(css)}KB brotli`);
console.log(`style.min.css  ${(code.length / 1024).toFixed(1)}KB cru, ${kb(code)}KB brotli`);
