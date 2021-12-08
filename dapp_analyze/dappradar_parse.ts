// Parse dapp radar json search results into a CSV
// Run this to generate dappradar_trending.csv for use with analyze.ts

const { readFile, writeFile, readdir } = require('fs/promises')
const url = require('url')
const { convertArrayToCSV } = require('convert-array-to-csv')
const fetch = require('node-fetch')

type dappradarResult = {
  dapps: {
    name: string
    activeProtocols: string[]
    category: string
    deepLink: string
  }[]
}

const wait = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const main = async () => {
  const dapps: any[][] = []

  const dir = './dappradar_api_results'
  const fileNames = await readdir(dir)
  for(const fileName of fileNames) {
    if (!fileName.endsWith('.json')) continue
    console.log('Adding file:', fileName)
    const file = await readFile(`${dir}/${fileName}`, 'utf8')
    const result = JSON.parse(file) as dappradarResult
    for (const [i, d] of result.dapps.entries()) {
      if (i === 0) continue // First result is always an ad...

      let urlRaw = d.deepLink.toLowerCase()
      if (urlRaw.startsWith('https://dappradar.com/deeplink/')) {
        try {
        const response = await fetch(urlRaw)
        urlRaw = response.url
        await wait(1000)
        } catch (e) {
          console.log('Error fetching', urlRaw)
          continue
        }
      }

      console.log('cleaning', urlRaw)
      const urlClean = url.format(new url.URL(urlRaw), {search: false})
      dapps.push([
        d.name,
        urlClean,
        d.category,
        d.activeProtocols.join(','),
      ])
    }
  }

  const csvData = convertArrayToCSV(dapps, {
    header: ['name', 'url', 'category', 'protocols'],
  })
  await writeFile('dappradar_trending.csv', csvData);
  process.exit()
}

main()