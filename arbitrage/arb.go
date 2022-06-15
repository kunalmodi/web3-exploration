package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"math/big"
	"net/http"
	"time"
)

type Token struct {
	Address  string `json:"address"`
	Chain    int    `json:"chainId"`
	Symbol   string `json:"symbol"`
	Decimals int    `json:"decimals"`
}

// var startingAmount = "100000000000000000000000"

// var startingToken = Token{
// 	Address:  "0x6b175474e89094c44da98b954eedeac495271d0f",
// 	Chain:    1,
// 	Symbol:   "DAI",
// 	Decimals: 18,
// }
// var startingAmount = "1000000000000"
// var startingToken = Token{
// 	Address:  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
// 	Chain:    1,
// 	Symbol:   "USDT",
// 	Decimals: 6,
// }
var startingAmount = "10000000000000000000000"
var startingToken = Token{
	Address:  "0x0F5D2fB29fb7d3CFeE444a200298f468908cC942",
	Chain:    1,
	Symbol:   "MANA",
	Decimals: 18,
}

func main() {
	amt, _ := new(big.Int).SetString(startingAmount, 10)
	if amt == nil {
		panic(fmt.Errorf("invalid amt..."))
	}

	tokens := getTokens()
	for _, token := range tokens {
		if token.Address == startingToken.Address ||
			token.Symbol == startingToken.Symbol ||
			token.Chain != startingToken.Chain {
			continue
		}
		c1Amt, err := fetchQuote(startingToken, token, amt)
		if err != nil {
			fmt.Printf("[err] %d %s -> %s: %v\n", amt, startingToken.Symbol, token.Symbol, err)
			continue
		}
		c2Amt, err := fetchQuote(token, startingToken, c1Amt)
		if err != nil {
			fmt.Printf("[err] %d %s -> %s: %v\n", c1Amt, startingToken.Symbol, token.Symbol, err)
			continue
		}
		if c2Amt.Cmp(amt) > 0 {
			pi := pctIncrease(amt, c2Amt)
			fmt.Printf("FOUND: %s -> %s %s +%s%%\n", startingToken.Symbol, token.Symbol, token.Address, pi)
			fmt.Printf("       %s -> %s -> %s\n", pt(startingToken, amt), pt(token, c1Amt), pt(startingToken, c2Amt))
		}
		time.Sleep(time.Millisecond * 500)
		// break
	}
}

func pctIncrease(prev, cur *big.Int) string {
	v := new(big.Int).Sub(cur, prev)
	v = v.Mul(v, big.NewInt(10000))
	v = v.Div(v, prev)
	return fmt.Sprintf("%.2f", float64(v.Int64())/100.0)
}

func pt(t Token, amt *big.Int) string {
	// dec := math.Pow10(t.Decimals)
	// new(big.Int).Div(amt, big.NewInt(int64(t.Decimals)))
	// v := float64(amt) / math.Pow10(t.Decimals)
	// return fmt.Sprintf("%.2f", v)
	return amt.String()
}

const (
	oneInchURL = "https://pathfinder.1inch.io/v1.2/chain/%d/router/v4/quotes-by-presets?chainId=1&fromTokenAddress=%s&toTokenAddress=%s&amount=%s&gasPrice=57539833193&maxReturnProtocols=UNISWAP_V1,UNISWAP_V2,SUSHI,MOONISWAP,BALANCER,COMPOUND,CURVE,CURVE_V2_SPELL_2_ASSET,CURVE_V2_SGT_2_ASSET,CURVE_V2_THRESHOLDNETWORK_2_ASSET,CHAI,OASIS,KYBER,AAVE,IEARN,BANCOR,PMM1,CREAMSWAP,SWERVE,BLACKHOLESWAP,DODO,DODO_V2,VALUELIQUID,SHELL,DEFISWAP,SAKESWAP,LUASWAP,MINISWAP,MSTABLE,PMM2,SYNTHETIX,AAVE_V2,ST_ETH,ONE_INCH_LP,ONE_INCH_LP_1_1,LINKSWAP,S_FINANCE,PSM,POWERINDEX,PMM3,XSIGMA,CREAM_LENDING,SMOOTHY_FINANCE,SADDLE,PMM4,KYBER_DMM,BALANCER_V2,UNISWAP_V3,SETH_WRAPPER,CURVE_V2,CURVE_V2_EURS_2_ASSET,CURVE_V2_EURT_2_ASSET,CURVE_V2_XAUT_2_ASSET,CURVE_V2_ETH_CRV,CURVE_V2_ETH_CVX,CONVERGENCE_X,ONE_INCH_LIMIT_ORDER,ONE_INCH_LIMIT_ORDER_V2,DFX_FINANCE,FIXED_FEE_SWAP,DXSWAP,CLIPPER,SHIBASWAP,UNIFI,PMMX,PMM5,PSM_PAX,PMM2MM1,WSTETH,DEFI_PLAZA,FIXED_FEE_SWAP_V3,SYNTHETIX_WRAPPER,SYNAPSE,CURVE_V2_YFI_2_ASSET,CURVE_V2_ETH_PAL,POOLTOGETHER,ETH_BANCOR_V3,PMM6,ELASTICSWAP,BALANCER_V2_WRAPPER,SYNTHETIX_ATOMIC&time=%d"
	oneInchUA  = ""
)

type oneInchAPIResponse struct {
	Result struct {
		Gas    string `json:"gasUnitsConsumed"`
		Amount string `json:"toTokenAmount"`
	} `json:"maxReturnResult"`
}

func fetchQuote(t1, t2 Token, amount *big.Int) (*big.Int, error) {
	url := fmt.Sprintf(oneInchURL, t1.Chain, t1.Address, t2.Address, amount.String(), time.Now().Unix())
	// fmt.Printf("url: %s\n", url)
	cli := http.Client{Timeout: time.Second * 2}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", oneInchUA)
	res, err := cli.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("invalid http status: %d", res.StatusCode)
	}
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	var oneInchResp oneInchAPIResponse
	err = json.Unmarshal(body, &oneInchResp)
	if err != nil {
		return nil, err
	}

	if amt, _ := new(big.Int).SetString(oneInchResp.Result.Amount, 10); amt != nil {
		return amt, nil
	}
	return nil, fmt.Errorf("invalid amt: %s", oneInchResp.Result.Amount)
}

func getTokens() []Token {
	type tokenList struct {
		Tokens []Token `json:"tokens"`
	}
	file, err := ioutil.ReadFile("1inch.json")
	if err != nil {
		panic(err)
	}
	var tl tokenList
	if err := json.Unmarshal(file, &tl); err != nil {
		panic(err)
	}
	return tl.Tokens
}
