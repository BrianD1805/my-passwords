import fs from 'node:fs';
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const checks = [
  ['viewport meta is device width', /name="viewport"[^>]*width=device-width/.test(html)],
  ['mobile text autosizing is pinned to 100%', /-webkit-text-size-adjust:\s*100%/.test(css) && /text-size-adjust:\s*100%/.test(css)],
  ['mobile root overflow is contained', /@media \(max-width:\s*860px\)[\s\S]*overflow-x:\s*hidden/.test(css)],
  ['landing shells are constrained to viewport', /\.public-landing-page,[\s\S]*max-width:\s*100%/.test(css)],
  ['mobile hero uses bounded clamp sizing', /\.landing-hero-copy h1[\s\S]*font-size:\s*clamp\(/.test(css)],
  ['plan carousel retains local horizontal scroll', /\.landing-pricing-section \.landing-plan-tier-grid[\s\S]*overscroll-behavior-x:\s*contain/.test(css)],
];
let failed=0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`\nAll ${checks.length} mobile regression static checks passed.`);
