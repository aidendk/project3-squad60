const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyReward, isCustomerCode } = require('../public/rewards');

test('reward discount is capped at the subtotal and the point cost stays whole', () => {
    const capped = applyReward(2, 'three');
    assert.equal(capped.discount, 2);
    assert.equal(capped.points, 200);

    assert.equal(applyReward(10, 'dollar').discount, 1);
    assert.equal(applyReward(10, 'topping').discount, 0.75);
    assert.equal(applyReward(10, 'topping').points, 50);
    assert.equal(applyReward(5, null).points, 0);
    assert.equal(applyReward(5, 'nope'), null);
});

test('customer codes are exactly 4 digits', () => {
    assert.equal(isCustomerCode('1234'), true);
    assert.equal(isCustomerCode('12345'), false);
    assert.equal(isCustomerCode('abcd'), false);
    assert.equal(isCustomerCode('123'), false);
});
