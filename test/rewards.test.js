const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { applyReward, availableRewards, pointsEarned, normalizePhone } = require('../public/js/shared/rewards');

describe('loyalty rewards', () => {
    it('earns 10 points per dollar and caps a reward at the subtotal', () => {
        assert.equal(pointsEarned(5.5), 55);
        assert.equal(pointsEarned(5.75), 57);
        assert.equal(pointsEarned(0), 0);

        const drink = applyReward(5.75, 'FREE_DRINK');
        assert.equal(drink.points, 500);
        assert.equal(drink.discount, 5.75);
        assert.equal(applyReward(10, 'OFF_150').discount, 1.5);
        assert.equal(applyReward(10, null).points, 0);
        assert.equal(applyReward(10, 'topping'), null);
    });

    it('offers only the rewards a balance can afford', () => {
        assert.deepEqual(availableRewards(50).map((reward) => reward.id), []);
        assert.deepEqual(availableRewards(75).map((reward) => reward.id), ['FREE_TOPPING']);
        assert.deepEqual(availableRewards(500).map((reward) => reward.id), [
            'FREE_TOPPING', 'OFF_150', 'OFF_300', 'FREE_DRINK'
        ]);
        assert.equal(normalizePhone('(979) 845-1234'), '9798451234');
        assert.equal(normalizePhone('12345'), '');
    });
});
