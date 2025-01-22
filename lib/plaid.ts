
import {Configuration,PlaidApi,PlaidEnvironments} from 'plaid'

const configration = new Configuration({
    basePath:PlaidEnvironments.sandbox,
    baseOptions:{
        headers:{
            "PLAID-CLIENT-ID":process.env.PLAID_CLIENT_ID,
            "PLAID-SECRET": process.env.PLAID_SECRET
        }
    }
})

export const plaidClient = new PlaidApi(Configuration)