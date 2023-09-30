import blockAddressMap from '../assets/blockAccessMap2.json'
import assert from 'node:assert'

import { calculateColdStorageRefund } from '../src/calculate'

describe('calculateColdStorageRefund', () => {
  it('test', function () {
      const refund = calculateColdStorageRefund(
        '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1', '10000', blockAddressMap
      )
      assert.equal(refund, {})
    }
  )
})
