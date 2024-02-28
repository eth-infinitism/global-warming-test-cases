import axios, { type AxiosRequestConfig } from 'axios'

export async function fetchContractName (
  address: string
): Promise<string> {
  const params: AxiosRequestConfig = {
  params: {
    module: 'contract',
    action: 'getsourcecode',
    address,
    apikey: process.env.ETHERSCAN_API_KEY
  }
}
const response = await axios.get("https://api.etherscan.io/api", params)
return response?.data?.result?.[0]?.ContractName
}
