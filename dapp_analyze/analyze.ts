// Analyze dappradar search results

const { readFile, writeFile, readdir } = require('fs/promises')
const Wappalyzer = require('wappalyzer')
const dnsClient = require('dns');
const { convertArrayToCSV } = require('convert-array-to-csv');
const puppeteer = require('puppeteer');
const { parse: tldparse } = require('tldts');
const csv = require('csvtojson')

const wappalyzer = new Wappalyzer({})

type dapp = {
  url: string
  name: string
  category: string
  protocols: string
}
const getDApps = async () => {
  const dapps = await csv().fromFile('dappradar_trending.csv')
  return dapps as dapp[]
}

type wapplyzerResult = {
  technologies: {
    name: string;
  }[]
}

const getWappalyzerResults = async (url: string) => {
  const site = await wappalyzer.open(url, {})
  const results = await site.analyze()
  return results as wapplyzerResult;
}

const stripTrailingSlash = (str: string) =>
  str.charAt(str.length-1)=="/" ? str.substr(0,str.length-1) : str

const getTxtRecords = async (url: string): Promise<string[]> => {
  return new Promise((resolve) => {
    dnsClient.resolveTxt(url, (err: Error | null | undefined, records: string[][]) => {
      if (err) {
        return resolve([]);
      }
      resolve(records.flat())
    })
  })
}

const getDNSResults = async (unformattedUrl: string) => {
  const url = stripTrailingSlash(unformattedUrl.replace('https://', ''))
  const txtRecords = await getTxtRecords(`_dnslink.${url}`)
  const isIPFS = txtRecords.filter(t => t.startsWith('dnslink=')).length > 0
  return { isIPFS }
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// lol. there is certainly a better way to do this...
const urlsToIgnore = new Set<string>([
  'https://app.tryroll.com/tokens.json',
  'https://tokens.coingecko.com/uniswap/all.json',
  'https://nftx.ethereumdb.com/v2/tokenlist/',
  'https://www.gemini.com/uniswap/manifest.json',
  'https://list.dhedge.eth.link/',
  'https://raw.githubusercontent.com/The-Blockchain-Association/sec-notice-list/master/ba-sec-list.json',
  'https://bridge.arbitrum.io/token-list-42161.json',
  'https://api.coinmarketcap.com/data-api/v3/uniswap/all.json',
  'https://tokens.pancakeswap.finance/pancakeswap-top-100.json',
  'https://tokens.pancakeswap.finance/pancakeswap-extended.json',
])

const isInterestingURL = (url: string) => {
  if (url.startsWith('data:')) return false
  if (url.endsWith('tokenlist.json')) return false
  if (urlsToIgnore.has(url)) return false
  return true
}

const puppet = async (url: string) => {
  const providers = new Set<string>();
  const browser = await puppeteer.launch();
  const currentDomain = tldparse(url.toLowerCase()).domain

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en'
    });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36');
    await page.setDefaultNavigationTimeout(0); 
    await page.setRequestInterception(true);

    // @ts-ignore
    page.on('request', request => {
      let url: string = request.url()
      url = url.toLowerCase()

      try {
        if (isInterestingURL(url)) {
          const domain = tldparse(url).domain
          if (domain !== currentDomain) providers.add(domain)
        }
      } catch (e) {}

      request.continue()
    })

    await page.goto(url, {
      timeout: 15000, waitUntil: 'networkidle0',
    });
    await wait(3000)
  } finally {
    await browser.close()
    return Array.from(providers);
  }
}

const main = async () => {
  await wappalyzer.init()

  const dapps = await getDApps()

  const data: any[][] = [];
  for (const [i, d] of dapps.entries()) {
    console.log('Looking at:', i, d.name, d.url)

    const html = await getWappalyzerResults(d.url)
    const dns = await getDNSResults(d.url)
    const apiRequests = await puppet(d.url)

    const row = [
      d.name,
      d.url,
      d.category,
      d.protocols,
      (dns.isIPFS ? ['dnslink'] : []).join(','),
      html.technologies.map(t => t.name).join(','),
      apiRequests.join(','),
    ]
    data.push(row)

    await wait(2000)
  }

  const csvData = convertArrayToCSV(data, {
    header: ['name', 'url', 'category', 'protocols', 'dns', 'html', 'api'],
  })
  await writeFile('dapps.csv', csvData);
  process.exit()
}

main()