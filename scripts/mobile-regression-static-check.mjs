import fs from 'node:fs';
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const checks = [
  ['mobile landing uses 16px outer side margins', /Ver-0\.053I[\s\S]*?@media \(max-width: 680px\)[\s\S]*?\.public-landing-page\s*\{[\s\S]*?width:\s*min\(calc\(100% - 32px\), 620px\)/.test(css)],
  ['plans stack vertically on mobile', /Ver-0\.053F[\s\S]*?landing-plan-tier-grid\s*\{[\s\S]*?display:\s*grid\s*!important[\s\S]*?grid-template-columns:\s*1fr\s*!important/.test(css)],
  ['mobile carousel prompt removed', !css.includes('Swipe left to compare plans')],
  ['mobile plan row has no horizontal carousel overflow', !/landing-pricing-section \.landing-plan-tier-grid\s*\{[\s\S]{0,500}overflow-x:\s*auto/.test(css)],
  ['FAQ standard mobile panel padding restored', /Ver-0\.053F[\s\S]*?landing-faq-section\s*\{[\s\S]*?padding:\s*22px\s*!important/.test(css)],
  ['no root or landing page overflow lock is applied', !/(?:html|body|#root|\.public-landing-page)\s*\{[^}]*overflow(?:-x|-y)?\s*:\s*(?:hidden|clip)/.test(css)],
];
let failed=0;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}  ${name}`); if(!ok) failed++; }
if (failed) process.exit(1);
console.log(`\nAll ${checks.length} mobile restoration checks passed.`);
