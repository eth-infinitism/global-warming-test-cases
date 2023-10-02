import blockAddressMap from '../assets/blockAccessMap2.json'
import assert from 'node:assert'

import { calculateColdStorageRefund } from '../src/calculate'

describe('calculateColdStorageRefund', () => {
  it('test', function () {
      const refund = calculateColdStorageRefund('10000', blockAddressMap
      )
      assert.deepEqual(Object.fromEntries(refund), {
        '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b': {
          refundFromBurn: 55666666n,
          refundFromCoinbase: 13916666n
        },
        '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1': {
          refundFromBurn: 55666666n,
          refundFromCoinbase: 8349999n
        },
        '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0': {
          refundFromBurn: 34666666n,
          refundFromCoinbase: 5199999n
        }
      })
    }
  )
})
