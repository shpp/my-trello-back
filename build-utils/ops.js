/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const actions = {
  // for prod deploy
  'check-secrets-prod': () => checkSecretsProd(),
  'create-dns': () => createCloudflareDnsEntries(),
  'check-kv': () => checkKV(),
  // for local dev
  'get-secrets-dev': () => outputSecretsDev(),
  'setup-https-meh': () => prepareHttpsWithMehserve(),
  'print-domains': () => printDomains(),
  // help
  '--help': () => console.log(Object.keys(actions)),
  help: () => console.log(Object.keys(actions)),
};

let lastOut = '<undefined>';
const execSync = (cmd) => {
  try {
    return (lastOut = '' + require('child_process').execSync(cmd));
  } catch (e) {
    lastOut = '' + e;
    return undefined;
  }
};

const environment = process.env.CLOUDFLARE_ENVIRONMENT;
const fs = require('fs');
const die = (err) => console.log(`last data received = ${lastOut}`) || console.error('FAIL: ' + err) || process.exit(1);
const wranglerToml = JSON.parse(
  execSync(`cat wrangler.toml | dasel select -f - -r toml -w json .`) ||
    die('please install dasel: https://daseldocs.tomwright.me/installation')
);
const cfAppName = wranglerToml.name;

function checkSecretsProd() {
  const requiredSecrets = wranglerToml.required_secrets || [];

  const addedSecrets = (
    JSON.parse(
      execSync(
        `curl -s https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${cfAppName}-${environment}/secrets?per_page=200 ` +
          `-H "Authorization: Bearer ${process.env.CLOUDFLARE_API_TOKEN}"`
      )
    ).result || []
  ).map((x) => x.name);

  // const addedSecrets = JSON.parse(execSync(`npm run -s ${process.env.NPM_SCRIPT_BASE} -- secret list`)).map(
  //   (o) => o.name
  // );

  const missing = requiredSecrets.filter((x) => !addedSecrets.includes(x));
  if (missing.length) {
    console.error(
      '\nSECRETS MISSING! to fix it:\n' + missing.map((s) => `- RUN: npm run -s cfkowo -- secret put ${s}`).join('\n')
    );
  } else {
    console.log('👍 all secrets set (' + addedSecrets.join(', ') + ')');
  }
  process.exit(missing.length);
}

function outputSecretsDev() {
  const requiredSecrets = wranglerToml.required_secrets || [];
  const secrets = requiredSecrets
    .map((secret) => ({ secret, key: `CF_LOCALDEV_${cfAppName}_${secret}` }))
    .map(({ secret, key }) => ({ secret, key, value: execSync(`shppsec get ${key}`) }));
  const missing = secrets.filter((x) => !x.value).map((x) => x.key);
  if (missing.length) {
    console.error('\nSECRETS MISSING! to fix it:\n' + missing.map((x) => `- RUN: shppsec set ${x}`).join('\n'));
  } else {
    console.log(secrets.map((x) => `--var ${x.secret}:${x.value}`).join(' '));
  }
  process.exit(missing.length);
}

// local https with `mehserve`
function prepareHttpsWithMehserve() {
  // console.log('sleeping 10 sec... usually to allow local server to start :) ');
  // execSync('sleep 10');

  const devPort =
    +wranglerToml.dev?.port ||
    die('please create `dev` section in `wrangler.toml` and set `port` entry there to some number');

  const domains = [...new Set(wranglerToml.env?.[environment]?.routes.map((x) => x.split('/')[0]) || [])];
  domains.length || die(`failed to get "routes" entry in "wrangler.toml" for env "${environment}"`);

  execSync('command -v mehserve &>/dev/null') ??
    die('install mehserve: `npm install -g mehserve` and then `mehserve install` and then `mehserve run`');

  const isMac = execSync(`uname -a`).includes('Darwin');
  domains.forEach((domain) => {
    const certFile = process.env.HOME + `/.mehserve/${domain}.ssl.crt`;
    console.log(`HTTPS cert: ${certFile}`);
    if (!fs.existsSync(certFile)) {
      const sslCmd = `mehserve ssl ${domain} 2>/dev/null`;
      execSync(sslCmd);
      if (!fs.existsSync(certFile)) {
        console.log(`failed to: ${sslCmd}`);
      } else {
        console.log('success: ' + sslCmd);
        if (isMac) {
          execSync('open /Users/rshmelev/.mehserve/') || console.log('failed to open .mehserve directory in Explorer');
          console.log(`- in Finder double-click on: ${certFile}`);
          console.log(`- open Keychain Access > System > Certificates"`);
          console.log(`- double click ${domain}" entry`);
          console.log(`- in "Trust" > "When using this cert" select "Always trust"`);
          console.log(`- edit "/etc/hosts": add line '127.0.0.1 ${domain}.meh'`);
        }
      }
    } else {
      console.log(`👍 ssl cert for ${domain} already exists`);
    }
    const addCmd = `mehserve add ${domain} ${devPort}`;
    if (execSync(addCmd) === undefined) console.log(`failed to: $addCmd`);
    else console.log('👍 success: ' + addCmd);
  });

  console.log(
    '...if all is good, you can access local worker with:\n' + domains.map((d) => `- https://${d}.meh`).join('\n')
  );
}

function printDomains() {
  const domains = [...new Set(wranglerToml.env?.[environment]?.routes.map((x) => x.split('/')[0]) || [])];
  console.log(domains.map((x) => `https://${x}/`).join('\n'));
}

function createCloudflareDnsEntries() {
  const zones = Object.fromEntries(
    JSON.parse(
      execSync(
        `curl -s https://api.cloudflare.com/client/v4/zones ` +
          `-H "Authorization: Bearer ${process.env.CLOUDFLARE_API_TOKEN}"`
      )
    ).result.map(({ id, name }) => [name, id])
  );

  const domains = [...new Set(wranglerToml.env?.[environment]?.routes.map((x) => x.split('/')[0]) || [])];

  for (const domain of domains) {
    const zoneName = Object.keys(zones).find((zoneName) => domain.endsWith(zoneName));
    const zoneId = zones[zoneName];
    console.log(`checking DNS entry for ${domain} in zone ${zoneName} (${zoneId})`);
    const code = execSync(
      `curl --write-out %{http_code} --silent --output /dev/null ` +
        `-X POST "https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records" ` +
        `-H "Authorization: Bearer ${process.env.CLOUDFLARE_API_TOKEN}" ` +
        `-H "Content-Type: application/json" ` +
        `--data '{"type":"CNAME","name":"${domain}","content":"shpp.me","ttl":600,"priority":10,"proxied":true}'`
    );
    console.log(
      code === '200'
        ? `🙏 domain ${domain} CREATED`
        : code === '400'
        ? `👍 domain ${domain} already exists`
        : code === '403'
        ? "\nWARNING: YOUR TOKEN DOESN'T ALLOW CREATING DNS RECORDS"
        : '👀 unknown HTTP code: ' + code
    );
  }
}

function checkKV() {
  const kvs = Object.fromEntries(
    JSON.parse(
      execSync(
        `curl -s https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces?per_page=200 ` +
          `-H "Authorization: Bearer ${process.env.CLOUDFLARE_API_TOKEN}"`
      )
    ).result.map(({ id, title }) => [id, title])
  );

  Object.keys(kvs).length || console.log('👀 no KVs in your account at all?? is it new account or bug?');

  const appKvs = wranglerToml.env?.[environment]?.kv_namespaces;
  appKvs.length || console.log('👀 no KVs configured');

  for (const { binding, id, preview_id } of appKvs) {
    let issues = 0;
    kvs[id] ||
      die(
        `KV with id ${id} "${binding}" doesn't exist, please use:\n` +
          `npm run -s ${process.env.NPM_SCRIPT_BASE} kv:namespace create ${binding}`
      );
    kvs[id] === `${cfAppName}-${environment}-${binding}` ||
      kvs[id] === `${cfAppName}-${environment}-${environment}-${binding}` ||
      (++issues && console.log(`👀 KV id ${id} "${binding} has strange title ${kvs[id]}" `));

    kvs[preview_id] ||
      die(
        `preview KV with ${preview_id} "${binding}" doesn't exist, please use:\n` +
          `npm run -s ${process.env.NPM_SCRIPT_BASE} kv:namespace create ${binding} --preview`
      );
    kvs[preview_id] === `${cfAppName}-${environment}-${binding}_preview` ||
      kvs[preview_id] === `${cfAppName}-${environment}-${environment}-${binding}_preview` ||
      (++issues && console.log(`👀 preview KV ${preview_id} "${binding} has strange name ${kvs[preview_id]}" `));
    if (!issues) console.log(`👍 KV check of binding "${binding}" ok`);
  }
}

try {
  console.error('\nops: running ' + process.argv[2]);
  actions[process.argv[2]]();
} catch (e) {
  console.log(`lastOut = ${lastOut}`);
  console.log(e);
  process.exit(1);
}
