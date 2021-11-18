import web3 from 'web3';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import BN from "bn.js";

const bn = (n: number | string) => web3.utils.toBN(n);

const startingTokens: { [id: string]: { symbol: string, chainId: number, address: string }} = {
  'dai': { symbol: 'DAI', chainId: 1, address: '0x6b175474e89094c44da98b954eedeac495271d0f' },
  'crv': { symbol: 'CRV', chainId: 1, address: '0xd533a949740bb3306d119cc777fa900ba034cd52' },
  'weth': { symbol: 'WETH', chainId: 1, address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
  'aave': { symbol: "AAVE", chainId: 1, address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9' },
  'usdc': { symbol: "USDC", chainId: 1, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
  'mkr': { symbol: "MKR", chainId: 1, address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2' },
  'mana': { symbol: "MANA", chainId: 1, address: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942' },
  'ampl': { symbol: "AMPL", chainId: 1, address: '0xd46ba6d942050d489dbd938a2c909a5d5039a161' },
};

const sleep = (t: number) => new Promise(s => setTimeout(s, t));

const gen1InchQuote = async (from: string, to: string, amount: BN) => {
  const url = `https://api.1inch.exchange/v3.0/1/quote?fromTokenAddress=${from}&toTokenAddress=${to}&amount=${amount.toString()}`

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data['statusCode'] === 400) {
      return false;
    }
    return web3.utils.toBN(data['toTokenAmount']);
  } catch (e) {
    console.log(from, to, e);
    return false;
  }
}

type tokenList = {
  tokens: {
    symbol: string;
    address: string;
    chainId: number;
  }[];
}

const genLoadTokenList = async (name: string) => {
  const buf = await fs.readFile(name + '.json');
  const json: tokenList = JSON.parse(buf.toString());
  return json.tokens;
}

const genBadPairsList = async () => {
  const buf = await fs.readFile('bad_pairs.json');
  const pairs: [string, string][] = JSON.parse(buf.toString());
  return pairs;
}

const isBadPair = (from: string, to: string, pairs: [string, string][]) => {
  for (const pair of pairs) {
    if ((pair[0] === from && pair[1] === to) || (pair[1] === from && pair[0] === to)) {
      return true;
    }
  }
  return false;
}

const pctIncrease = (bn1: BN, bn2: BN): string => {
  // BN doesn't like decimals, so we multiply by 100 * 1000 to get pct w/ 3 decimal precision
  const pctInc_Padded = bn2.sub(bn1).muln(100000).div(bn1).toNumber();
  return (pctInc_Padded / 1000.0).toFixed(3);
}

const genImpl = async (startToken: string, amount: string, list: string) => {
  const tokens = await genLoadTokenList(list);
  const knownBadPairs = await genBadPairsList();
  const newBadPairs: [string, string][] = [];

  const start = startingTokens[startToken];
  if (!start) {
    console.log(`Invalid starting token: ${startToken}. Must be in (${Object.keys(startingTokens).join(', ')})`);
    process.exit(1);
  }
  const startAmount = bn(amount);

  for (const connector of tokens) {
    if (connector.address.toLowerCase() === start.address.toLowerCase()) continue;
    if (connector.chainId !== start.chainId) continue;
    if (isBadPair(start.symbol, connector.symbol, knownBadPairs)) continue;

    const token1Received = await gen1InchQuote(start.address, connector.address, startAmount);
    if (!token1Received) {
      newBadPairs.push([start.symbol, connector.symbol]);
      continue;
    }
    const token0Received = await gen1InchQuote(connector.address, start.address, token1Received);
    if (!token0Received) {
      newBadPairs.push([start.symbol, connector.symbol]);
      continue;
    }

    // If we made more token0 than we spent, this is an arbitrage oppurtunity!
    if (token0Received.cmp(startAmount) > 0) {
      const pctPretty = pctIncrease(startAmount, token0Received);
      console.log(`FOUND: ${start.symbol} -> ${connector.symbol} (+${pctPretty}%) (${connector.address})`);
      console.log(`       ${startAmount.toString()} -> ${token1Received.toString()}-> ${token0Received.toString()}`);
    }

    // Rate limited to 400/min =~ 6/s (according to some random person online?)
    // We make two calls per loop, so 2 loops a second should be well within the rate limit...
    await sleep(500);
  }

  knownBadPairs.push(...newBadPairs);
  console.log('Bad Pairs', JSON.stringify(knownBadPairs));
}

const main = () => {
  const args = process.argv;
  if (args.length !== 5) {
    console.log('Usage: 1inch_swap_arbitrage.ts <start_token> <amount> <coin list name>')
    console.log('Example: ts-node 1inch_swap_arbitrage.ts dai 1000000000000000000000 gemini');
    process.exit(1);
  }
  genImpl(args[2], args[3], args[4]);
}

main();
