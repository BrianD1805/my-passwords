import fs from 'node:fs';
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const eBlock = css.split('/* Password-Encrypt Ver-0.053E — urgent mobile landing scroll fix.')[1] || '';
const checks = [
  ['viewport meta is device width', /name="viewport"[^>]*width=device-width/.test(html)],
  ['mobile text autosizing is pinned to 100%', /-webkit-text-size-adjust:\s*100%/.test(eBlock) && /text-size-adjust:\s*100%/.test(eBlock)],
  ['0.053E does not constrain html body or root overflow', !/html,\s*\n\s*body,\s*\n\s*#root[\s\S]*overflow/.test(eBlock)],
  ['plan swipe is isolated to local horizontal overflow', /landing-plan-tier-grid[\s\S]*overflow-x:\s*auto\s*!important/.test(eBlock)],
  ['carousel no longer uses mandatory snapping or forced stops', /scroll-snap-type:\s*none\s*!important/.test(eBlock) && /scroll-snap-stop:\s*normal\s*!important/.test(eBlock)],
  ['carousel no longer uses a negative mobile margin', /landing-plan-tier-grid[\s\S]*margin:\s*0\s*!important/.test(eBlock) && !/margin-right:\s*-/.test(eBlock)],
  ['mobile plan row keeps normal touch manipulation', /landing-plan-tier-grid[\s\S]*touch-action:\s*manipulation/.test(eBlock)],
  ['mobile hero remains bounded', /landing-hero-copy h1[\s\S]*font-size:\s*clamp\(/.test(eBlock)],
];
let failed=0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`\nAll ${checks.length} mobile regression static checks passed.`);
