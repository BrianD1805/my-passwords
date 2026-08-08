import fs from 'node:fs';

const main = fs.readFileSync('src/main.jsx', 'utf8');
const css = fs.readFileSync('src/styles.css', 'utf8');
let failures = 0;

function check(label, condition) {
  if (condition) console.log(`PASS  ${label}`);
  else { console.log(`FAIL  ${label}`); failures += 1; }
}

check('Hero heading uses the lighter Ver-0.053A weight', /Ver-0\.053A[\s\S]*?\.public-landing-page \.landing-hero-copy h1\s*\{[\s\S]*?font-weight:\s*500\s*!important/.test(css));
check('Vault preview has three traffic-light dots', /preview-window-bar[\s\S]*?<span><\/span><span><\/span><span><\/span>/.test(main) && /span:nth-of-type\(1\)[\s\S]*?#df5b57/.test(css) && /span:nth-of-type\(2\)[\s\S]*?#e7ae45/.test(css) && /span:nth-of-type\(3\)[\s\S]*?#5aad72/.test(css));
check('Trusted Person Access is promoted as a dedicated landing section', /landing-trusted-person-spotlight/.test(main) && /Trusted Person Access/.test(main) && /waiting period/.test(main) && /prepared emergency package/.test(main));
check('Mobile landing flow uses mixed section treatments', /@media \(max-width: 680px\)[\s\S]*?\.landing-feature-section[\s\S]*?background:\s*transparent[\s\S]*?\.landing-trusted-person-spotlight[\s\S]*?background:\s*#336699[\s\S]*?\.landing-how-section[\s\S]*?background:\s*#edf3f8[\s\S]*?\.landing-security-section/.test(css));
check('Desktop footer is left-oriented and reserves space for Back to top', /@media \(min-width: 861px\)[\s\S]*?\.landing-footer[\s\S]*?padding-right:\s*88px[\s\S]*?\.landing-footer-copy[\s\S]*?text-align:\s*left[\s\S]*?\.landing-footer-links[\s\S]*?justify-content:\s*flex-start/.test(css));
check('Footer uses the new privacy-focused tagline', main.includes('Encrypted password vault. A trusted place for the private details that matter.') && !main.includes('Encrypted password vault for everyday private details · A ZippyWeb project.'));

if (failures) {
  console.error(`\n${failures} landing UX static check(s) failed.`);
  process.exit(1);
}
console.log('\nAll 6 landing UX static checks passed.');
